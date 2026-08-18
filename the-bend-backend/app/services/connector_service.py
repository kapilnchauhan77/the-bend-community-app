import re
from datetime import datetime, timedelta
from ipaddress import ip_address
from math import ceil
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse
from uuid import UUID, uuid4

import httpx
from dateutil import parser as dateutil_parser
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ConnectorType
from app.repositories.event_repo import ConnectorRepository, EventRepository
from app.services.event_image_cache import EventImageCache, is_cacheable_event_image

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
_IMAGE_FILE_EXTENSIONS = {
    ".avif",
    ".gif",
    ".jpeg",
    ".jpg",
    ".png",
    ".svg",
    ".webp",
}


def _normalize_text(value: str) -> str:
    return " ".join(value.split())


def _normalize_image_url(candidate, base_url: str) -> str | None:
    """Resolve a browser-safe external image URL without fetching it."""
    if candidate is None:
        return None

    value = str(candidate).strip()
    if (
        not value
        or "\\" in value
        or any(character.isspace() for character in value)
    ):
        return None

    try:
        resolved = urljoin(base_url, value)
        if len(resolved) > 500:
            return None
        parsed = urlparse(resolved)
        hostname = parsed.hostname
        _ = parsed.port  # Validate numeric range; urllib defers this check.
    except ValueError:
        return None

    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        return None

    hostname = hostname.rstrip(".").lower()
    if not hostname.isascii():
        try:
            hostname = hostname.encode("idna").decode("ascii").rstrip(".").lower()
        except UnicodeError:
            return None
    if (
        "%" in hostname
        or hostname == "localhost"
        or hostname.endswith(".localhost")
    ):
        return None
    try:
        if not ip_address(hostname).is_global:
            return None
    except ValueError:
        numeric_parts = hostname.split(".")
        if numeric_parts and all(
            re.fullmatch(r"(?:0[xX][0-9a-fA-F]+|[0-9]+)", part)
            for part in numeric_parts
        ):
            # Browsers accept abbreviated/octal/hex IPv4 spellings that
            # ipaddress intentionally rejects, and normalize them to a local
            # address such as 127.0.0.1. Do not persist those ambiguous hosts.
            return None
        # Normal DNS hostnames are resolved by the visitor's browser. The Bend
        # backend never downloads these URLs, so this path adds no server-side
        # request surface.

    return resolved


def _has_image_file_extension(candidate) -> bool:
    try:
        path = urlparse(str(candidate or "")).path.lower()
    except ValueError:
        return False
    return any(path.endswith(extension) for extension in _IMAGE_FILE_EXTENSIONS)


def _image_url_from_element(element, base_url: str) -> str | None:
    if element is None:
        return None

    for attribute in ("data-srcset", "srcset"):
        srcset = element.get(attribute)
        if not srcset:
            continue
        srcset_text = str(srcset).strip()
        if re.search(r"(?:^|,\s*)data:", srcset_text, re.IGNORECASE):
            # A data URL contains a comma of its own, so a simple srcset split
            # can mistake the encoded payload for a relative remote URL. We do
            # not persist data URLs; ignore this attribute and try src instead.
            continue
        candidates = []
        for index, candidate in enumerate(srcset_text.split(",")):
            candidate_parts = candidate.strip().split()
            if not candidate_parts:
                continue
            image_url = _normalize_image_url(candidate_parts[0], base_url)
            if not image_url:
                continue

            descriptor_priority = 0
            descriptor_value = 0.0
            if len(candidate_parts) > 1:
                descriptor = candidate_parts[1].lower()
                descriptor_match = re.fullmatch(
                    r"(\d+(?:\.\d+)?)([wx])", descriptor
                )
                if descriptor_match:
                    descriptor_priority = (
                        2 if descriptor_match.group(2) == "w" else 1
                    )
                    descriptor_value = float(descriptor_match.group(1))
            candidates.append(
                (descriptor_priority, descriptor_value, -index, image_url)
            )
        if candidates:
            return max(candidates)[3]

    for attribute in ("data-src", "data-lazy-src", "src"):
        image_url = _normalize_image_url(element.get(attribute), base_url)
        if image_url:
            return image_url
    return None


def _page_image_url(
    soup, base_url: str, excluded_containers: list | None = None
) -> str | None:
    """Find a page's declared social/banner/logo image in priority order."""
    metadata_keys = (
        ("property", "og:image"),
        ("property", "og:image:url"),
        ("property", "og:image:secure_url"),
        ("name", "twitter:image"),
        ("name", "twitter:image:src"),
    )
    for attribute, expected in metadata_keys:
        for element in soup.find_all("meta"):
            if str(element.get(attribute, "")).strip().lower() != expected:
                continue
            image_url = _normalize_image_url(element.get("content"), base_url)
            if image_url:
                return image_url

    for element in soup.find_all("link", href=True):
        rel = {str(value).lower() for value in (element.get("rel") or [])}
        if "image_src" in rel:
            image_url = _normalize_image_url(element.get("href"), base_url)
            if image_url:
                return image_url

    excluded_container_ids = {
        id(container) for container in (excluded_containers or [])
    }
    for element in soup.find_all("img"):
        ancestor_ids = {id(element), *(id(parent) for parent in element.parents)}
        if excluded_container_ids.intersection(ancestor_ids):
            continue
        descriptor = " ".join(
            [
                str(element.get("id", "")),
                " ".join(element.get("class", [])),
                str(element.get("alt", "")),
            ]
        ).lower()
        if "logo" in descriptor or "banner" in descriptor:
            image_url = _image_url_from_element(element, base_url)
            if image_url:
                return image_url

    for element in soup.find_all("link", href=True):
        rel = {str(value).lower() for value in (element.get("rel") or [])}
        if rel.intersection({"apple-touch-icon", "icon"}):
            image_url = _normalize_image_url(element.get("href"), base_url)
            if image_url:
                return image_url
    return None


def _first_html_image_url(html: str, base_url: str) -> str | None:
    if not html:
        return None
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    for element in soup.find_all("img"):
        image_url = _image_url_from_element(element, base_url)
        if image_url:
            return image_url
    return None


def _feed_image_url(feed, base_url: str) -> str | None:
    feed_data = getattr(feed, "feed", {}) or {}
    feed_base = _normalize_image_url(feed_data.get("link"), base_url) or base_url
    image = feed_data.get("image") or {}
    if hasattr(image, "get"):
        for key in ("href", "url"):
            image_url = _normalize_image_url(image.get(key), feed_base)
            if image_url:
                return image_url
    for key in ("logo", "icon"):
        image_url = _normalize_image_url(feed_data.get(key), feed_base)
        if image_url:
            return image_url
    return None


def _rss_entry_image_url(entry, feed_logo: str | None, feed_url: str) -> str | None:
    entry_base = _normalize_image_url(entry.get("link"), feed_url) or feed_url

    for media in entry.get("media_content", []) or []:
        media_type = str(media.get("type", "")).lower()
        medium = str(media.get("medium", "")).lower()
        if (media_type and not media_type.startswith("image/")) or (
            medium and medium != "image"
        ):
            continue
        image_url = _normalize_image_url(media.get("url"), entry_base)
        if image_url:
            return image_url

    for media in entry.get("media_thumbnail", []) or []:
        image_url = _normalize_image_url(media.get("url"), entry_base)
        if image_url:
            return image_url

    for enclosure in entry.get("enclosures", []) or []:
        media_type = str(enclosure.get("type", "")).lower()
        href = enclosure.get("href") or enclosure.get("url")
        if not media_type.startswith("image/") and not _has_image_file_extension(
            href
        ):
            continue
        image_url = _normalize_image_url(href, entry_base)
        if image_url:
            return image_url

    for link in entry.get("links", []) or []:
        if str(link.get("rel", "")).lower() != "enclosure":
            continue
        media_type = str(link.get("type", "")).lower()
        if not media_type.startswith("image/"):
            continue
        image_url = _normalize_image_url(link.get("href"), entry_base)
        if image_url:
            return image_url

    raw_description = entry.get("summary", "") or entry.get("description", "")
    return _first_html_image_url(raw_description, entry_base) or feed_logo


def _ical_value_text(value) -> str:
    try:
        raw_value = value.to_ical()
    except AttributeError:
        raw_value = value
    if isinstance(raw_value, bytes):
        return raw_value.decode("utf-8", "ignore")
    return str(raw_value)


def _ical_image_url(component, feed_url: str) -> str | None:
    for property_name in ("X-IMAGE", "ATTACH"):
        values = component.get(property_name)
        if values is None:
            continue
        if not isinstance(values, list):
            values = [values]

        for value in values:
            media_type = ""
            if property_name == "ATTACH":
                params = getattr(value, "params", {}) or {}
                value_type = str(params.get("VALUE", "")).upper()
                media_type = str(params.get("FMTTYPE", "")).lower()
                if value_type == "BINARY" or (
                    media_type and not media_type.startswith("image/")
                ):
                    continue

            raw_url = _ical_value_text(value)
            if (
                property_name == "ATTACH"
                and not media_type
                and not _has_image_file_extension(raw_url)
            ):
                continue

            image_url = _normalize_image_url(raw_url, feed_url)
            if image_url:
                return image_url
    return None


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


def _parse_dcr_event_page(html: str, page_url: str) -> tuple[list[dict], int | None]:
    """Parse one rendered DCR results page into real event cards."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    page_text = soup.get_text(" ", strip=True)
    count_match = _DCR_RESULTS_COUNT_RE.search(page_text)
    reported_count = int(count_match.group("count")) if count_match else None
    events = []
    event_blocks = []
    seen_urls = set()

    for details_link in soup.find_all("a", href=True):
        if not _is_details_link(details_link):
            continue

        source_url = urljoin(page_url, details_link["href"])
        if urlparse(source_url).scheme not in {"http", "https"} or source_url in seen_urls:
            continue

        block = _find_dcr_event_block(details_link)
        if block is None:
            continue
        event_blocks.append(block)

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
        event_data = {
            "title": title[:255],
            "description": description[:2000] if description else None,
            "start_date": start_date,
            "end_date": end_date,
            "location": location[:255] if location else None,
            "source_url": source_url,
            "status": "cancelled" if cancelled else "active",
        }
        image_url = _image_url_from_element(block.find("img"), page_url)
        if image_url:
            event_data["image_url"] = image_url
        events.append(event_data)
        seen_urls.add(source_url)

    page_image_url = _page_image_url(soup, page_url, event_blocks)
    if page_image_url:
        for event in events:
            event.setdefault("image_url", page_image_url)

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
    def __init__(self, db: AsyncSession):
        self.db = db
        self.event_repo = EventRepository(db)
        self.connector_repo = ConnectorRepository(db)
        self.image_cache = EventImageCache()

    async def _cache_event_image(self, source_url: str) -> str | None:
        """Cache an imported image without allowing media failures to stop sync."""
        try:
            return await self.image_cache.cache(source_url)
        except Exception:
            # Image caching is optional. Avoid logging the URL because approved
            # Flickr download URLs contain a source-provided secret query value.
            return None

    async def sync_connector(self, connector_id: UUID) -> dict:
        """Sync events from a single connector."""
        connector = await self.connector_repo.get_by_id(connector_id)
        if not connector:
            raise ValueError("Connector not found")

        try:
            events = await self._parse_source(connector)
            saved = 0
            images_updated = 0
            for event_data in events:
                # Dedup by source_url + connector_id
                if event_data.get("source_url"):
                    existing = await self.event_repo.find_by_source_url(
                        event_data["source_url"], connector_id
                    )
                    if existing:
                        existing_image = getattr(existing, "image_url", None)
                        imported_image = event_data.get("image_url")
                        if (
                            imported_image
                            and existing_image == imported_image
                            and is_cacheable_event_image(imported_image)
                        ):
                            cached_image = await self._cache_event_image(imported_image)
                            if (
                                cached_image
                                and await self.event_repo.update_image_if_matches(
                                    existing.id,
                                    imported_image,
                                    cached_image,
                                )
                            ):
                                images_updated += 1
                            continue
                        if imported_image and not str(existing_image or "").strip():
                            stored_image = imported_image
                            if is_cacheable_event_image(imported_image):
                                stored_image = await self._cache_event_image(
                                    imported_image
                                )
                            if (
                                stored_image
                                and await self.event_repo.update_image_if_blank(
                                    existing.id, stored_image
                                )
                            ):
                                images_updated += 1
                        continue

                imported_image = event_data.get("image_url")
                if is_cacheable_event_image(imported_image):
                    cached_image = await self._cache_event_image(imported_image)
                    if cached_image:
                        event_data["image_url"] = cached_image
                    else:
                        event_data.pop("image_url", None)
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
            await self.connector_repo.update(connector_id, {
                "last_synced_at": datetime.utcnow(),
                "last_sync_count": saved,
                "last_sync_error": None,
            })
            return {
                "synced": saved,
                "images_updated": images_updated,
                "total_parsed": len(events),
            }

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

        async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=_FEED_HEADERS) as client:
            resp = await client.get(url)
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
            image_url = _ical_image_url(component, url)

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
            event_link = next(
                (s for s in (url_prop, description)
                 if s.lower().startswith(("http://", "https://"))),
                "",
            )
            if uid:
                source_url = f"{event_link}#uid={uid}" if event_link else f"uid:{uid}"
            else:
                source_url = event_link or None

            # If DESCRIPTION is just the event's own URL (common in CivicPlus
            # exports), don't echo it back as body text.
            desc_out = None if (description and description == event_link) else (description or None)

            event_data = {
                "title": summary.strip(),
                "description": desc_out,
                "start_date": start,
                "end_date": end,
                "location": location.strip() if location else None,
                "source_url": source_url,
                "status": "active",
            }
            if image_url:
                event_data["image_url"] = image_url
            events.append(event_data)

        return events

    async def _parse_rss(self, url: str) -> list[dict]:
        """Parse an RSS/Atom feed for event-like entries."""
        import feedparser

        async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=_FEED_HEADERS) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        feed = feedparser.parse(resp.text)
        feed_logo = _feed_image_url(feed, url)
        events = []

        for entry in feed.entries:
            title = entry.get("title", "").strip()
            if not title:
                continue

            link = entry.get("link", "")
            description = entry.get("summary", "") or entry.get("description", "")
            image_url = _rss_entry_image_url(entry, feed_logo, url)
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
                        start_date = datetime(*parsed[:6])
                    except (TypeError, ValueError):
                        pass
                    break

            if not start_date:
                start_date = datetime.utcnow()

            event_data = {
                "title": title[:255],
                "description": description[:2000] if description else None,
                "start_date": start_date,
                "end_date": None,
                "location": None,
                "source_url": link or None,
                "status": "active",
            }
            if image_url:
                event_data["image_url"] = image_url
            events.append(event_data)

        return events

    async def _parse_html(self, url: str, config: dict) -> list[dict]:
        """Scrape events from an HTML page using CSS selectors."""
        from bs4 import BeautifulSoup

        title_sel = config.get("title_selector", "h2")
        date_sel = config.get("date_selector", "time")
        desc_sel = config.get("description_selector", "p")
        link_sel = config.get("link_selector", "a")

        async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=_FEED_HEADERS) as client:
            resp = await client.get(url)
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
                    page_resp = await client.get(page_url)
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
        event_containers = []

        # Find all title elements as event anchors
        title_elements = soup.select(title_sel)

        for title_el in title_elements:
            title = title_el.get_text(" ", strip=True)
            if not title or _looks_like_results_summary(title):
                continue

            # Look for sibling/parent context
            parent = title_el.parent or title_el
            event_containers.append(parent)

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
            source_url = None
            if link_el and link_el.get("href"):
                source_url = urljoin(url, link_el["href"])

            # HTML imports are deduplicated by source_url. Saving a linkless
            # card would create a duplicate on every scheduled sync.
            if not source_url or urlparse(source_url).scheme not in {"http", "https"}:
                continue

            image_el = parent.select_one("img")
            image_url = _image_url_from_element(image_el, url)

            event_data = {
                "title": title[:255],
                "description": description[:2000] if description else None,
                "start_date": start_date,
                "end_date": None,
                "location": None,
                "source_url": source_url,
                "status": "active",
            }
            if image_url:
                event_data["image_url"] = image_url
            events.append(event_data)

        page_image_url = _page_image_url(soup, url, event_containers)
        if page_image_url:
            for event in events:
                event.setdefault("image_url", page_image_url)

        return events
