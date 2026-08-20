import re
from datetime import datetime, timedelta, timezone
from math import ceil
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse
from uuid import UUID, uuid4

from dateutil import parser as dateutil_parser
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.event_repo import EventRepository, ConnectorRepository
from app.models.enums import ConnectorType
from app.services.external_urls import (
    deterministic_source_url,
    legacy_source_url,
    normalize_external_url,
    sanitize_imported_source_url,
)
from app.services.safe_external_fetcher import SafeExternalFetcher


# Some public calendar hosts (e.g. CivicPlus county sites behind Cloudflare
# "Bot Fight Mode") reject requests that don't look like a real calendar
# client and return an HTML challenge instead of the .ics. Every legitimate
# subscriber (Google/Apple/Outlook Calendar) sends a browser-style User-Agent,
# so we do the same — this is feed subscription, not detection evasion.
_FEED_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/calendar,application/rss+xml,text/html;q=0.9,*/*;q=0.8",
}

_DCR_HOSTS = {"dcr.virginia.gov", "www.dcr.virginia.gov"}
_DCR_RESULTS_COUNT_RE = re.compile(
    r"\(\s*(?P<count>\d+)\s*\)\s*events?\s+found", re.IGNORECASE
)
_DCR_DATE_RE = re.compile(
    r"(?P<date>[A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4})\.?(?=\s|$)",
    re.IGNORECASE,
)
_DCR_TIME_TOKEN = r"\d{1,2}(?::\d{2})?\s*[ap]\.?(?:m)\.?"
_DCR_TIME_RANGE_RE = re.compile(
    rf"(?P<start>{_DCR_TIME_TOKEN})\s*(?:-|\u2013|\u2014|to)\s*"
    rf"(?P<end>{_DCR_TIME_TOKEN})",
    re.IGNORECASE,
)
_DCR_SINGLE_TIME_RE = re.compile(rf"(?P<start>{_DCR_TIME_TOKEN})", re.IGNORECASE)


def _normalize_text(value: str) -> str:
    return " ".join(value.split())


def _looks_like_results_summary(title: str) -> bool:
    normalized = _normalize_text(title).lower()
    return "events found" in normalized and "between" in normalized


def _is_dcr_events_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.hostname in _DCR_HOSTS and parsed.path.rstrip("/") == "/state-parks/events"


def _parse_dcr_date_range(text: str) -> tuple[datetime, datetime | None] | None:
    """Parse DCR's local date/time format without inventing a missing date."""
    normalized = _normalize_text(text)
    date_match = _DCR_DATE_RE.search(normalized)
    if not date_match:
        return None

    time_text = normalized[date_match.end():]
    range_match = _DCR_TIME_RANGE_RE.search(time_text)
    single_match = _DCR_SINGLE_TIME_RE.search(time_text)
    if not range_match and not single_match:
        # DCR occasionally lists all-day events with a date but no time.
        if "all day" not in time_text.lower():
            return None
        start = dateutil_parser.parse(date_match.group("date"), fuzzy=True)
        return start.replace(tzinfo=None), None

    def normalize_meridiem(value: str) -> str:
        return re.sub(r"\.", "", value).upper()

    start_time = normalize_meridiem((range_match or single_match).group("start"))
    start = dateutil_parser.parse(
        f"{date_match.group('date')} {start_time}", fuzzy=True
    ).replace(tzinfo=None)

    end = None
    if range_match:
        end_time = normalize_meridiem(range_match.group("end"))
        end = dateutil_parser.parse(
            f"{date_match.group('date')} {end_time}", fuzzy=True
        ).replace(tzinfo=None)
        if end < start:
            end += timedelta(days=1)

    return start, end


def _is_details_link(element) -> bool:
    text = _normalize_text(element.get_text(" ", strip=True)).lower()
    return "detail" in text and ("view" in text or text == "details")


def _find_dcr_event_block(details_link):
    """Find the smallest ancestor that contains one detail link and a date."""
    candidate = details_link.parent
    for _ in range(8):
        if candidate is None:
            return None
        block_text = candidate.get_text(" ", strip=True)
        details_links = [
            link for link in candidate.find_all("a", href=True)
            if _is_details_link(link)
        ]
        event_headings = [
            heading
            for heading in candidate.find_all(["h2", "h3", "h4", "h5", "h6"])
            if not _is_dcr_chrome_line(heading.get_text(" ", strip=True))
        ]
        if (
            len(details_links) == 1
            and len(event_headings) <= 1
            and _parse_dcr_date_range(block_text)
        ):
            return candidate
        # Do not climb out of a semantic card, or into a results-level wrapper
        # containing multiple titles. That could pair one card's detail link
        # with a date from a neighboring card.
        if candidate.name in {"article", "li"} or len(event_headings) > 1:
            return None
        candidate = candidate.parent
    return None


def _dcr_content_lines(block) -> list[str]:
    lines = []
    for value in block.get_text("\n", strip=True).splitlines():
        normalized = _normalize_text(value)
        if normalized and (not lines or normalized != lines[-1]):
            lines.append(normalized)
    return lines


def _find_dcr_date_lines(lines: list[str]) -> tuple[int, int] | None:
    # DCR places the date, each time, each meridiem, and the range dash in
    # separate elements. Prefer the full range window so none of those tokens
    # leak into the location/description fields.
    single_time_fallback = None
    for start_index in range(len(lines)):
        # The rolling window must begin on the date itself. Real DCR cards
        # render the title as plain text immediately before it; accepting a
        # window that merely *contains* a date consumes that title and leaves
        # the card with no usable heading.
        if not _DCR_DATE_RE.search(lines[start_index]):
            continue
        for end_index in range(start_index, min(start_index + 7, len(lines))):
            parsed_range = _parse_dcr_date_range(
                " ".join(lines[start_index:end_index + 1])
            )
            if parsed_range:
                single_time_fallback = single_time_fallback or (
                    start_index,
                    end_index,
                )
                if parsed_range[1] is not None:
                    return start_index, end_index
    return single_time_fallback


def _is_dcr_chrome_line(value: str) -> bool:
    normalized = value.lower()
    return (
        not normalized
        or _looks_like_results_summary(value)
        or normalized.startswith("park:")
        or normalized.startswith("image:")
        or normalized in {"-", "\u2013", "\u2014", "view details", "details", "refine list"}
    )


def _next_safe_link_identity(
    candidate_url: str | None,
    occurrences: dict[str, int],
) -> tuple[str, str] | None:
    """Return a canonical link and stable zero-based occurrence identity."""
    if not candidate_url:
        return None
    try:
        normalized_link = normalize_external_url(candidate_url)
    except ValueError:
        return None
    occurrence = occurrences.get(normalized_link, 0)
    occurrences[normalized_link] = occurrence + 1
    return normalized_link, f"link:{normalized_link}|occurrence:{occurrence}"


def _parse_dcr_event_page(html: str, page_url: str) -> tuple[list[dict], int | None]:
    """Parse one rendered DCR results page into real event cards."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    page_text = soup.get_text(" ", strip=True)
    count_match = _DCR_RESULTS_COUNT_RE.search(page_text)
    reported_count = int(count_match.group("count")) if count_match else None
    events = []
    seen_urls = set()

    for details_link in soup.find_all("a", href=True):
        if not _is_details_link(details_link):
            continue

        candidate_source_url = urljoin(page_url, details_link["href"])

        block = _find_dcr_event_block(details_link)
        if block is None:
            continue

        parsed_range = _parse_dcr_date_range(block.get_text(" ", strip=True))
        lines = _dcr_content_lines(block)
        date_lines = _find_dcr_date_lines(lines)
        if parsed_range is None or date_lines is None:
            continue

        date_start_index, date_end_index = date_lines
        title = None
        for heading in block.find_all(["h2", "h3", "h4", "h5", "h6"]):
            heading_text = _normalize_text(heading.get_text(" ", strip=True))
            if heading_text and not _is_dcr_chrome_line(heading_text):
                title = heading_text
                break

        if not title:
            for line in reversed(lines[:date_start_index]):
                if (
                    not _is_dcr_chrome_line(line)
                    and "cancelled" not in line.lower()
                    and "canceled" not in line.lower()
                ):
                    title = line
                    break

        if not title or _looks_like_results_summary(title):
            continue

        content_after_date = [
            line for line in lines[date_end_index + 1:]
            if not _is_dcr_chrome_line(line) and line != title
        ]
        location = content_after_date[0] if content_after_date else None
        location_line_count = 1 if location else 0
        if (
            location
            and location.lower().endswith("state park")
            and len(content_after_date) > 1
        ):
            location = f"{location}, {content_after_date[1]}"
            location_line_count = 2
        description_lines = content_after_date[location_line_count:]
        cancelled = any(
            "canceled" in line.lower() or "cancelled" in line.lower()
            for line in lines
        )
        description = " ".join(description_lines).strip() or None
        if cancelled and (not description or "cancel" not in description.lower()):
            description = f"This event has been canceled. {description or ''}".strip()

        start_date, end_date = parsed_range
        source_url = deterministic_source_url(
            page_url,
            candidate_source_url,
            candidate_source_url,
        )
        if source_url in seen_urls:
            continue
        events.append({
            "title": title[:255],
            "description": description[:2000] if description else None,
            "start_date": start_date,
            "end_date": end_date,
            "location": location[:255] if location else None,
            "source_url": source_url,
            "status": "cancelled" if cancelled else "active",
        })
        seen_urls.add(source_url)

    return events, reported_count


def _dcr_page_url(url: str, page_number: int) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if page_number <= 1:
        query.pop("cp", None)
    else:
        query["cp"] = str(page_number)
    return urlunparse(parsed._replace(query=urlencode(query)))


class ConnectorService:
    def __init__(
        self,
        db: AsyncSession,
        tenant_id: UUID | None = None,
        fetcher: SafeExternalFetcher | None = None,
    ):
        self.db = db
        self.tenant_id = tenant_id
        self.event_repo = EventRepository(db)
        self.connector_repo = ConnectorRepository(db)
        self.fetcher = fetcher or SafeExternalFetcher(headers=_FEED_HEADERS)

    async def sync_connector(self, connector_id: UUID) -> dict:
        """Sync events from a single connector."""
        if self.tenant_id is None:
            from app.core.exceptions import NotFoundError
            raise NotFoundError("Connector")
        connector = await self.connector_repo.get_by_id_for_tenant(
            connector_id, self.tenant_id
        )
        if not connector:
            from app.core.exceptions import NotFoundError
            raise NotFoundError("Connector")

        try:
            events = await self._parse_source(connector)
            saved = 0
            for event_data in events:
                event_data["source_url"] = sanitize_imported_source_url(
                    connector.url,
                    event_data.get("source_url"),
                )
                # Dedup by source_url + connector_id
                if event_data.get("source_url"):
                    existing = await self.event_repo.find_by_source_url(
                        event_data["source_url"], connector_id
                    )
                    if existing:
                        continue
                    legacy_url = legacy_source_url(event_data["source_url"])
                    if legacy_url:
                        legacy = await self.event_repo.find_by_source_url(
                            legacy_url, connector_id
                        )
                        if legacy:
                            legacy.source_url = event_data["source_url"]
                            await self.db.flush()
                            continue

                event_data["id"] = uuid4()
                event_data["connector_id"] = connector_id
                event_data["source"] = connector.name
                event_data["category"] = connector.category.value if hasattr(connector.category, "value") else connector.category
                # Scope synced events to the connector's tenant — otherwise they
                # land with tenant_id=NULL and never appear in the tenant's
                # Events list (which filters by tenant_id).
                event_data["tenant_id"] = connector.tenant_id
                await self.event_repo.create(event_data)
                saved += 1

            # Update connector sync status
            await self.connector_repo.update_for_tenant(connector_id, self.tenant_id, {
                "last_synced_at": datetime.utcnow(),
                "last_sync_count": saved,
                "last_sync_error": None,
            })
            return {"synced": saved, "total_parsed": len(events)}

        except Exception as e:
            await self.connector_repo.update_for_tenant(connector_id, self.tenant_id, {
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
        if self.tenant_id is None:
            from app.core.exceptions import NotFoundError
            raise NotFoundError("Tenant")
        connectors = await self.connector_repo.get_active(self.tenant_id)
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

        resp = await self.fetcher.fetch_text(url)
        resp.raise_for_status()

        body = resp.text
        # Guard: many calendar "feed" URLs are actually HTML landing pages
        # (e.g. CivicPlus county sites where iCalendar.aspx serves a chooser
        # page, not an .ics file). Parsing that silently yields zero VEVENTs
        # and looks like a successful empty sync — confusing the admin. Detect
        # it and raise a clear, actionable error instead.
        content_type = (resp.headers.get("content-type") or "").lower()
        if "BEGIN:VCALENDAR" not in body:
            hint = " (the URL returned an HTML page, not an .ics feed)" if (
                "text/html" in content_type or body.lstrip()[:15].lower().startswith("<!doctype")
                or body.lstrip()[:6].lower() == "<html>"
            ) else ""
            raise ValueError(
                f"Response is not a valid iCalendar feed{hint}. "
                "Check that the URL points directly to an .ics file."
            )

        cal = Calendar.from_ical(body)
        events = []
        now = datetime.utcnow()
        link_occurrences: dict[str, int] = {}

        for component in cal.walk():
            if component.name != "VEVENT":
                continue

            dtstart = component.get("dtstart")
            dtend = component.get("dtend")
            summary = str(component.get("summary", ""))
            description = str(component.get("description", "")).strip()
            location = str(component.get("location", ""))
            uid = str(component.get("uid", "")).strip()
            url_prop = str(component.get("url", "")).strip()

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

            # Dedup keys on source_url, so it MUST be unique per event. Many
            # ASP.NET/CivicPlus calendars set the iCal URL property to the
            # shared *feed* URL (identical on every VEVENT) while the real
            # per-event link lives in DESCRIPTION — using the feed URL collapses
            # the whole feed into a single saved event. Prefer a real per-event
            # http(s) link, then namespace by the canonical per-event UID so two
            # events can never share a key even if the feed reuses one URL.
            event_link = ""
            for candidate in (url_prop, description):
                if not candidate:
                    continue
                try:
                    event_link = normalize_external_url(candidate)
                    break
                except ValueError:
                    continue
            identity = uid
            if not identity:
                link_identity = _next_safe_link_identity(
                    event_link or None, link_occurrences
                )
                if link_identity:
                    event_link, identity = link_identity
            if not identity:
                identity = f"{summary}|{start.isoformat()}|{location}"
            source_url = deterministic_source_url(url, event_link or None, identity)

            # If DESCRIPTION is just the event's own URL (common in CivicPlus
            # exports), don't echo it back as body text.
            desc_out = None if (description and description == event_link) else (description or None)

            events.append({
                "title": summary.strip(),
                "description": desc_out,
                "start_date": start,
                "end_date": end,
                "location": location.strip() if location else None,
                "source_url": source_url,
                "status": "active",
            })

        return events

    async def _parse_rss(self, url: str) -> list[dict]:
        """Parse an RSS/Atom feed for event-like entries."""
        import feedparser

        resp = await self.fetcher.fetch_text(url)
        resp.raise_for_status()

        feed = feedparser.parse(resp.text)
        events = []
        link_occurrences: dict[str, int] = {}

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

            source_start_date = start_date
            if not start_date:
                start_date = datetime.utcnow()

            identity = entry.get("id") or entry.get("guid")
            safe_link = None
            if not identity:
                link_identity = _next_safe_link_identity(link or None, link_occurrences)
                if link_identity:
                    safe_link, identity = link_identity
            if not identity and source_start_date:
                identity = f"{title}|{source_start_date.isoformat()}|{link}"
            if not identity:
                source_date_text = entry.get("published") or entry.get("updated") or ""
                identity = f"{title}|{source_date_text}|{link}|{description or ''}"
            identity = str(identity)
            source_url = deterministic_source_url(
                url, safe_link or link or None, identity
            )

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

    async def _parse_html(self, url: str, config: dict) -> list[dict]:
        """Scrape events from an HTML page using CSS selectors."""
        from bs4 import BeautifulSoup

        title_sel = config.get("title_selector", "h2")
        date_sel = config.get("date_selector", "time")
        desc_sel = config.get("description_selector", "p")
        link_sel = config.get("link_selector", "a")

        resp = await self.fetcher.fetch_text(url)
        resp.raise_for_status()

        if _is_dcr_events_url(url):
            first_events, reported_count = _parse_dcr_event_page(resp.text, url)
            if reported_count is None:
                raise ValueError(
                    "The DCR page did not include an event result count; its markup may have changed."
                )
            if reported_count == 0:
                return []
            if not first_events:
                raise ValueError(
                    f"DCR reported {reported_count} events, but no valid event cards could be parsed."
                )

            all_events = {event["source_url"]: event for event in first_events}
            page_count = ceil(reported_count / len(first_events))
            if page_count > 50:
                raise ValueError(
                    f"DCR results require {page_count} pages, exceeding the safe sync limit."
                )

            for page_number in range(2, page_count + 1):
                page_url = _dcr_page_url(url, page_number)
                page_resp = await self.fetcher.fetch_text(page_url)
                page_resp.raise_for_status()
                page_events, _ = _parse_dcr_event_page(page_resp.text, page_url)
                for event in page_events:
                    all_events[event["source_url"]] = event

            if len(all_events) != reported_count:
                raise ValueError(
                    f"DCR reported {reported_count} events, but only "
                    f"{len(all_events)} unique event cards were parsed. No events were saved."
                )
            return list(all_events.values())

        soup = BeautifulSoup(resp.text, "lxml")
        events = []
        link_occurrences: dict[str, int] = {}

        # Find all title elements as event anchors
        title_elements = soup.select(title_sel)

        for title_el in title_elements:
            title = title_el.get_text(" ", strip=True)
            if not title or _looks_like_results_summary(title):
                continue

            # Look for sibling/parent context
            parent = title_el.parent or title_el

            # Date
            date_el = parent.select_one(date_sel)
            start_date = None
            if date_el:
                date_text = date_el.get("datetime", "") or date_el.get_text(" ", strip=True)
                if date_text:
                    try:
                        start_date = dateutil_parser.parse(date_text, fuzzy=True)
                        if start_date.tzinfo:
                            start_date = start_date.replace(tzinfo=None)
                    except (ValueError, OverflowError):
                        start_date = None

            # Never turn a heading or results summary into an event by silently
            # assigning the current time when the source has no parseable date.
            if start_date is None:
                continue

            # Description
            desc_el = parent.select_one(desc_sel)
            description = desc_el.get_text(" ", strip=True) if desc_el else None

            # Link
            link_el = parent.select_one(link_sel) if link_sel != title_sel else title_el
            candidate_source_url = None
            if link_el and link_el.get("href"):
                candidate_source_url = urljoin(url, link_el["href"])
            link_identity = _next_safe_link_identity(
                candidate_source_url, link_occurrences
            )
            safe_link = link_identity[0] if link_identity else None
            identity = (
                link_identity[1]
                if link_identity
                else f"{title}|{start_date.isoformat()}|{candidate_source_url or ''}"
            )
            source_url = deterministic_source_url(
                url,
                safe_link or candidate_source_url,
                identity,
            )

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
