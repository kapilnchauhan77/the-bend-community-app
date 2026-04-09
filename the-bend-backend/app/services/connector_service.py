import httpx
from uuid import UUID, uuid4
from datetime import datetime, timezone
from dateutil import parser as dateutil_parser
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.event_repo import EventRepository, ConnectorRepository
from app.models.enums import ConnectorType


class ConnectorService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.event_repo = EventRepository(db)
        self.connector_repo = ConnectorRepository(db)

    async def sync_connector(self, connector_id: UUID) -> dict:
        """Sync events from a single connector."""
        connector = await self.connector_repo.get_by_id(connector_id)
        if not connector:
            raise ValueError("Connector not found")

        try:
            events = await self._parse_source(connector)
            saved = 0
            for event_data in events:
                # Dedup by source_url + connector_id
                if event_data.get("source_url"):
                    existing = await self.event_repo.find_by_source_url(
                        event_data["source_url"], connector_id
                    )
                    if existing:
                        continue

                event_data["id"] = uuid4()
                event_data["connector_id"] = connector_id
                event_data["source"] = connector.name
                event_data["category"] = connector.category.value if hasattr(connector.category, "value") else connector.category
                await self.event_repo.create(event_data)
                saved += 1

            # Update connector sync status
            await self.connector_repo.update(connector_id, {
                "last_synced_at": datetime.utcnow(),
                "last_sync_count": saved,
                "last_sync_error": None,
            })
            return {"synced": saved, "total_parsed": len(events)}

        except Exception as e:
            await self.connector_repo.update(connector_id, {
                "last_synced_at": datetime.utcnow(),
                "last_sync_count": 0,
                "last_sync_error": str(e)[:500],
            })
            raise

    async def test_connector(self, connector_type: str, url: str, config: dict | None = None) -> dict:
        """Test parse a source without saving. Returns count and sample."""
        class FakeConnector:
            pass
        c = FakeConnector()
        c.type = ConnectorType(connector_type.lower()) if isinstance(connector_type, str) else connector_type
        c.url = url
        c.config = config

        events = await self._parse_source(c)
        sample = events[:3] if events else []
        return {"count": len(events), "sample": sample}

    async def sync_all(self) -> dict:
        """Sync all active connectors."""
        connectors = await self.connector_repo.get_active()
        results = {}
        for connector in connectors:
            try:
                result = await self.sync_connector(connector.id)
                results[connector.name] = {"status": "ok", **result}
            except Exception as e:
                results[connector.name] = {"status": "error", "error": str(e)[:200]}
        return results

    async def _parse_source(self, connector) -> list[dict]:
        """Route to the correct parser based on connector type."""
        conn_type = connector.type
        if isinstance(conn_type, str):
            conn_type = ConnectorType(conn_type.lower())

        if conn_type == ConnectorType.ICS:
            return await self._parse_ics(connector.url)
        elif conn_type == ConnectorType.RSS:
            return await self._parse_rss(connector.url)
        elif conn_type == ConnectorType.HTML:
            return await self._parse_html(connector.url, connector.config or {})
        else:
            raise ValueError(f"Unknown connector type: {conn_type}")

    async def _parse_ics(self, url: str) -> list[dict]:
        """Parse an ICS calendar feed."""
        from icalendar import Calendar

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        cal = Calendar.from_ical(resp.text)
        events = []
        now = datetime.utcnow()

        for component in cal.walk():
            if component.name != "VEVENT":
                continue

            dtstart = component.get("dtstart")
            dtend = component.get("dtend")
            summary = str(component.get("summary", ""))
            description = str(component.get("description", ""))
            location = str(component.get("location", ""))
            uid = str(component.get("uid", ""))
            url_prop = str(component.get("url", ""))

            if not summary or not dtstart:
                continue

            start = dtstart.dt
            if hasattr(start, "tzinfo") and start.tzinfo:
                start = start.replace(tzinfo=None)
            if not isinstance(start, datetime):
                start = datetime.combine(start, datetime.min.time())

            end = None
            if dtend:
                end = dtend.dt
                if hasattr(end, "tzinfo") and end.tzinfo:
                    end = end.replace(tzinfo=None)
                if not isinstance(end, datetime):
                    end = datetime.combine(end, datetime.min.time())

            events.append({
                "title": summary.strip(),
                "description": description.strip() if description else None,
                "start_date": start,
                "end_date": end,
                "location": location.strip() if location else None,
                "source_url": url_prop.strip() or uid.strip() or None,
                "status": "active",
            })

        return events

    async def _parse_rss(self, url: str) -> list[dict]:
        """Parse an RSS/Atom feed for event-like entries."""
        import feedparser

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        feed = feedparser.parse(resp.text)
        events = []

        for entry in feed.entries:
            title = entry.get("title", "").strip()
            if not title:
                continue

            link = entry.get("link", "")
            description = entry.get("summary", "") or entry.get("description", "")
            # Strip HTML tags from description
            if description:
                from bs4 import BeautifulSoup
                description = BeautifulSoup(description, "html.parser").get_text(separator=" ").strip()

            # Try to parse date
            start_date = None
            for date_field in ["published_parsed", "updated_parsed"]:
                parsed = entry.get(date_field)
                if parsed:
                    try:
                        import time
                        start_date = datetime(*parsed[:6])
                    except (TypeError, ValueError):
                        pass
                    break

            if not start_date:
                start_date = datetime.utcnow()

            events.append({
                "title": title[:255],
                "description": description[:2000] if description else None,
                "start_date": start_date,
                "end_date": None,
                "location": None,
                "source_url": link or None,
                "status": "active",
            })

        return events

    async def _parse_html(self, url: str, config: dict) -> list[dict]:
        """Scrape events from an HTML page using CSS selectors."""
        from bs4 import BeautifulSoup

        title_sel = config.get("title_selector", "h2")
        date_sel = config.get("date_selector", "time")
        desc_sel = config.get("description_selector", "p")
        link_sel = config.get("link_selector", "a")

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")
        events = []

        # Find all title elements as event anchors
        title_elements = soup.select(title_sel)

        for title_el in title_elements:
            title = title_el.get_text(strip=True)
            if not title:
                continue

            # Look for sibling/parent context
            parent = title_el.parent or title_el

            # Date
            date_el = parent.select_one(date_sel)
            start_date = datetime.utcnow()
            if date_el:
                date_text = date_el.get("datetime", "") or date_el.get_text(strip=True)
                if date_text:
                    try:
                        start_date = dateutil_parser.parse(date_text, fuzzy=True)
                        if start_date.tzinfo:
                            start_date = start_date.replace(tzinfo=None)
                    except (ValueError, OverflowError):
                        pass

            # Description
            desc_el = parent.select_one(desc_sel)
            description = desc_el.get_text(strip=True) if desc_el else None

            # Link
            link_el = parent.select_one(link_sel) if link_sel != title_sel else title_el
            source_url = None
            if link_el and link_el.get("href"):
                href = link_el["href"]
                if href.startswith("/"):
                    from urllib.parse import urljoin
                    href = urljoin(url, href)
                source_url = href

            events.append({
                "title": title[:255],
                "description": description[:2000] if description else None,
                "start_date": start_date,
                "end_date": None,
                "location": None,
                "source_url": source_url,
                "status": "active",
            })

        return events
