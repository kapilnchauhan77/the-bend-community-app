from datetime import datetime
from types import SimpleNamespace
from typing import ClassVar
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.repositories.event_repo import EventRepository
from app.services import connector_service
from app.services.connector_service import (
    ConnectorService,
    _normalize_image_url,
    _parse_dcr_event_page,
)


class _FakeResponse:
    def __init__(self, text: str, content_type: str = "text/html"):
        self.text = text
        self.headers = {"content-type": content_type}

    def raise_for_status(self):
        return None


class _FakeClient:
    pages: ClassVar[dict[str, _FakeResponse]] = {}

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return None

    async def get(self, url: str):
        return self.pages[url]


def test_dcr_parser_imports_the_event_card_image():
    page_url = "https://www.dcr.virginia.gov/state-parks/events?park=westmoreland"
    html = """
        <html><body>
          <h2>(1) Events Found For All Event Types</h2>
          <article class="event-card">
            <img data-src="/media/westmoreland/reptile-feeding.jpg"
                 alt="Image: Westmoreland State Park">
            <h3>Reptile Feeding: What's for Lunch?</h3>
            <p>August 23, 2026. 1:00 p.m. - 1:30 p.m.</p>
            <p>Westmoreland State Park</p>
            <p>Visitor Center</p>
            <p>Watch a ranger feed the park's reptiles.</p>
            <a href="/state-parks/event?id=reptile-feeding">View Details</a>
          </article>
        </body></html>
    """

    events, reported_count = _parse_dcr_event_page(html, page_url)

    assert reported_count == 1
    assert events[0]["image_url"] == (
        "https://www.dcr.virginia.gov/media/westmoreland/reptile-feeding.jpg"
    )


def test_dcr_parser_does_not_import_unsafe_image_urls():
    page_url = "https://www.dcr.virginia.gov/state-parks/events"
    html = """
        <html><head>
          <meta property="og:image" content="file:///etc/passwd">
        </head><body>
          <h2>(1) Events Found For All Event Types</h2>
          <article class="event-card">
            <img src="javascript:alert('not-an-image')">
            <h3>Safe Event</h3>
            <p>August 23, 2026. 1:00 p.m. - 1:30 p.m.</p>
            <p>Westmoreland State Park</p>
            <p>Visitor Center</p>
            <a href="/state-parks/event?id=safe-event">View Details</a>
          </article>
        </body></html>
    """

    events, _ = _parse_dcr_event_page(html, page_url)

    assert "image_url" not in events[0]


@pytest.mark.asyncio
async def test_generic_html_prefers_card_image_then_uses_page_banner(monkeypatch):
    url = "https://events.example.org/calendar"
    _FakeClient.pages = {
        url: _FakeResponse(
            """
            <html><head>
              <meta property="og:image" content="/assets/site-banner.png">
            </head><body>
              <article>
                <img data-src="/assets/paddle.jpg">
                <h2>Sunset Paddle</h2>
                <time datetime="2026-08-19T18:00:00">August 19</time>
                <p>Meet at the boathouse.</p>
                <a href="/events/sunset-paddle">Details</a>
              </article>
              <article>
                <h2>Campfire Kickoff</h2>
                <time datetime="2026-08-21T19:00:00">August 21</time>
                <p>Meet at Campground A.</p>
                <a href="/events/campfire-kickoff">Details</a>
              </article>
            </body></html>
            """
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_html(url, {})

    assert [event["image_url"] for event in events] == [
        "https://events.example.org/assets/paddle.jpg",
        "https://events.example.org/assets/site-banner.png",
    ]


@pytest.mark.asyncio
async def test_html_srcset_uses_strongest_candidate_not_author_order(monkeypatch):
    url = "https://events.example.org/calendar"
    _FakeClient.pages = {
        url: _FakeResponse(
            """
            <html><body>
              <article>
                <img src="/assets/tiny-fallback.jpg"
                     srcset="/assets/large.jpg 1200w,
                             /assets/small.jpg 320w,
                             /assets/medium.jpg 640w">
                <h2>Sunset Paddle</h2>
                <time datetime="2026-08-19T18:00:00">August 19</time>
                <a href="/events/sunset-paddle">Details</a>
              </article>
            </body></html>
            """
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_html(url, {})

    assert events[0]["image_url"] == (
        "https://events.example.org/assets/large.jpg"
    )


@pytest.mark.asyncio
async def test_unsupported_data_srcset_uses_safe_src_fallback(monkeypatch):
    url = "https://events.example.org/calendar"
    _FakeClient.pages = {
        url: _FakeResponse(
            """
            <html><body>
              <article>
                <img src="/assets/safe-fallback.jpg"
                     srcset="data:image/gif;base64,AAAA 1x">
                <h2>Community Cleanup</h2>
                <time datetime="2026-08-24T09:00:00">August 24</time>
                <a href="/events/community-cleanup">Details</a>
              </article>
            </body></html>
            """
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_html(url, {})

    assert events[0]["image_url"] == (
        "https://events.example.org/assets/safe-fallback.jpg"
    )


@pytest.mark.asyncio
async def test_malformed_srcset_does_not_break_sync_and_uses_page_fallback(
    monkeypatch,
):
    url = "https://events.example.org/calendar"
    _FakeClient.pages = {
        url: _FakeResponse(
            """
            <html><head>
              <meta property="og:image" content="/assets/site-banner.png">
            </head><body>
              <article>
                <img srcset=",">
                <h2>Community Cleanup</h2>
                <time datetime="2026-08-24T09:00:00">August 24</time>
                <a href="/events/community-cleanup">Details</a>
              </article>
            </body></html>
            """
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_html(url, {})

    assert events[0]["image_url"] == (
        "https://events.example.org/assets/site-banner.png"
    )


@pytest.mark.asyncio
async def test_malformed_html_image_url_is_skipped_without_losing_event(monkeypatch):
    url = "https://events.example.org/calendar"
    _FakeClient.pages = {
        url: _FakeResponse(
            """
            <html><body>
              <article>
                <img src="http://[not-an-ip]/broken.jpg">
                <h2>Community Cleanup</h2>
                <time datetime="2026-08-24T09:00:00">August 24</time>
                <a href="/events/community-cleanup">Details</a>
              </article>
            </body></html>
            """
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_html(url, {})

    assert len(events) == 1
    assert events[0]["title"] == "Community Cleanup"
    assert "image_url" not in events[0]


@pytest.mark.parametrize(
    "candidate",
    [
        "http://2130706433/image.jpg",
        "http://0177.0.0.1/image.jpg",
        "http://0x7f000001/image.jpg",
        "http://127.1/image.jpg",
        r"https:\\127.0.0.1\image.jpg",
        "http://１２７。０。０。１/image.jpg",
        "http://１２７.０.０.１/image.jpg",
        "https://events.example.org:not-a-port/image.jpg",
        "https://events.example.org:99999/image.jpg",
    ],
)
def test_image_url_validation_rejects_unsafe_or_malformed_browser_urls(candidate):
    assert _normalize_image_url(candidate, "https://events.example.org/") is None


@pytest.mark.asyncio
async def test_page_fallback_prefers_a_visible_logo_over_a_tiny_favicon(monkeypatch):
    url = "https://events.example.org/calendar"
    _FakeClient.pages = {
        url: _FakeResponse(
            """
            <html><head>
              <link rel="icon" href="/favicon.ico">
            </head><body>
              <header><img class="site-logo" src="/assets/site-logo.png"></header>
              <article>
                <h2>Community Concert</h2>
                <time datetime="2026-08-25T19:00:00">August 25</time>
                <a href="/events/community-concert">Details</a>
              </article>
            </body></html>
            """
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_html(url, {})

    assert events[0]["image_url"] == (
        "https://events.example.org/assets/site-logo.png"
    )


@pytest.mark.asyncio
async def test_one_events_banner_is_not_reused_for_another_event(monkeypatch):
    url = "https://events.example.org/calendar"
    _FakeClient.pages = {
        url: _FakeResponse(
            """
            <html><body>
              <article>
                <img class="event-banner" src="/assets/concert.jpg">
                <h2>Community Concert</h2>
                <time datetime="2026-08-25T19:00:00">August 25</time>
                <a href="/events/community-concert">Details</a>
              </article>
              <article>
                <h2>Community Cleanup</h2>
                <time datetime="2026-08-26T09:00:00">August 26</time>
                <a href="/events/community-cleanup">Details</a>
              </article>
            </body></html>
            """
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_html(url, {})

    assert events[0]["image_url"] == (
        "https://events.example.org/assets/concert.jpg"
    )
    assert "image_url" not in events[1]


@pytest.mark.asyncio
async def test_skipped_cards_banner_is_not_used_as_page_fallback(monkeypatch):
    url = "https://events.example.org/calendar"
    _FakeClient.pages = {
        url: _FakeResponse(
            """
            <html><body>
              <article>
                <img class="event-banner" src="/assets/undated-card.jpg">
                <h2>Undated Listing</h2>
                <a href="/events/undated">Details</a>
              </article>
              <article>
                <h2>Community Cleanup</h2>
                <time datetime="2026-08-26T09:00:00">August 26</time>
                <a href="/events/community-cleanup">Details</a>
              </article>
            </body></html>
            """
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_html(url, {})

    assert [event["title"] for event in events] == ["Community Cleanup"]
    assert "image_url" not in events[0]


@pytest.mark.asyncio
async def test_rss_image_priority_is_entry_media_summary_image_then_feed_logo(
    monkeypatch,
):
    url = "https://events.example.org/calendar.xml"
    _FakeClient.pages = {
        url: _FakeResponse(
            """<?xml version="1.0" encoding="UTF-8"?>
            <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
              <channel>
                <title>Community Events</title>
                <link>https://events.example.org/</link>
                <image>
                  <url>/assets/community-logo.png</url>
                  <title>Community Events</title>
                  <link>https://events.example.org/</link>
                </image>
                <item>
                  <title>Media Event</title>
                  <link>https://events.example.org/events/media</link>
                  <pubDate>Wed, 19 Aug 2026 18:00:00 GMT</pubDate>
                  <media:content url="/assets/media-event.jpg" type="image/jpeg" />
                  <description><![CDATA[<img src="/assets/lower-priority.jpg">Details]]></description>
                </item>
                <item>
                  <title>Summary Image Event</title>
                  <link>https://events.example.org/events/summary</link>
                  <pubDate>Fri, 21 Aug 2026 19:00:00 GMT</pubDate>
                  <description><![CDATA[<p>Details</p><img src="/assets/summary-event.jpg">]]></description>
                </item>
                <item>
                  <title>Enclosure Image Event</title>
                  <link>https://events.example.org/events/enclosure</link>
                  <pubDate>Sat, 22 Aug 2026 11:00:00 GMT</pubDate>
                  <enclosure url="/assets/enclosure-event.webp" type="image/webp" />
                  <description>No inline image here.</description>
                </item>
                <item>
                  <title>Logo Fallback Event</title>
                  <link>https://events.example.org/events/logo</link>
                  <pubDate>Sat, 22 Aug 2026 13:00:00 GMT</pubDate>
                  <description>No event image here.</description>
                </item>
                <item>
                  <title>Malformed Image Event</title>
                  <link>https://events.example.org/events/malformed</link>
                  <pubDate>Sun, 23 Aug 2026 13:00:00 GMT</pubDate>
                  <enclosure url="http://[not-an-ip]/broken.jpg" type="image/jpeg" />
                  <description>The event remains importable.</description>
                </item>
              </channel>
            </rss>
            """,
            "application/rss+xml",
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_rss(url)

    assert [event["image_url"] for event in events] == [
        "https://events.example.org/assets/media-event.jpg",
        "https://events.example.org/assets/summary-event.jpg",
        "https://events.example.org/assets/enclosure-event.webp",
        "https://events.example.org/assets/community-logo.png",
        "https://events.example.org/assets/community-logo.png",
    ]


@pytest.mark.asyncio
async def test_atom_resolves_relative_entry_media_and_feed_logo(monkeypatch):
    url = "https://events.example.org/feeds/calendar.xml"
    _FakeClient.pages = {
        url: _FakeResponse(
            """<?xml version="1.0" encoding="UTF-8"?>
            <feed xmlns="http://www.w3.org/2005/Atom"
                  xmlns:media="http://search.yahoo.com/mrss/">
              <id>https://events.example.org/calendar</id>
              <title>Community Events</title>
              <updated>2026-08-18T12:00:00Z</updated>
              <link href="/calendar" />
              <logo>/assets/community-logo.png</logo>
              <entry>
                <id>relative-media</id>
                <title>Relative Media Event</title>
                <updated>2026-08-19T18:00:00Z</updated>
                <link href="/events/relative-media" />
                <media:content url="/assets/relative-media.jpg" type="image/jpeg" />
              </entry>
              <entry>
                <id>relative-logo</id>
                <title>Relative Logo Event</title>
                <updated>2026-08-21T19:00:00Z</updated>
                <link href="/events/relative-logo" />
                <summary>No event image here.</summary>
              </entry>
            </feed>
            """,
            "application/atom+xml",
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_rss(url)

    assert [event["image_url"] for event in events] == [
        "https://events.example.org/assets/relative-media.jpg",
        "https://events.example.org/assets/community-logo.png",
    ]


@pytest.mark.asyncio
async def test_ics_imports_an_http_image_attachment(monkeypatch):
    url = "https://events.example.org/calendar.ics"
    _FakeClient.pages = {
        url: _FakeResponse(
            """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//The Bend Test//EN
BEGIN:VEVENT
UID:reptile-feeding-2026@example.org
DTSTAMP:20260801T120000Z
DTSTART:20260823T170000Z
DTEND:20260823T173000Z
SUMMARY:Reptile Feeding
URL:https://events.example.org/events/reptile-feeding
ATTACH;FMTTYPE=image/jpeg:https://cdn.example.org/events/reptile-feeding.jpg
END:VEVENT
END:VCALENDAR
""",
            "text/calendar",
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_ics(url)

    assert events[0]["image_url"] == (
        "https://cdn.example.org/events/reptile-feeding.jpg"
    )


@pytest.mark.asyncio
async def test_ics_prefers_x_image_and_ignores_non_image_attachments(monkeypatch):
    url = "https://events.example.org/calendar.ics"
    _FakeClient.pages = {
        url: _FakeResponse(
            """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//The Bend Test//EN
BEGIN:VEVENT
UID:community-concert-2026@example.org
DTSTAMP:20260801T120000Z
DTSTART:20260825T230000Z
SUMMARY:Community Concert
URL:https://events.example.org/events/community-concert
ATTACH;FMTTYPE=application/pdf:https://cdn.example.org/events/program.pdf
X-IMAGE:https://cdn.example.org/events/community-concert.webp
END:VEVENT
END:VCALENDAR
""",
            "text/calendar",
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_ics(url)

    assert events[0]["image_url"] == (
        "https://cdn.example.org/events/community-concert.webp"
    )


@pytest.mark.asyncio
async def test_ics_does_not_use_a_non_image_attachment_as_event_image(monkeypatch):
    url = "https://events.example.org/calendar.ics"
    _FakeClient.pages = {
        url: _FakeResponse(
            """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//The Bend Test//EN
BEGIN:VEVENT
UID:community-concert-program-2026@example.org
DTSTAMP:20260801T120000Z
DTSTART:20260825T230000Z
SUMMARY:Community Concert Program
URL:https://events.example.org/events/community-concert
ATTACH;FMTTYPE=application/pdf:https://cdn.example.org/events/program.pdf
END:VEVENT
END:VCALENDAR
""",
            "text/calendar",
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_ics(url)

    assert len(events) == 1
    assert "image_url" not in events[0]


@pytest.mark.asyncio
async def test_malformed_ics_image_attachment_is_skipped_without_losing_event(
    monkeypatch,
):
    url = "https://events.example.org/calendar.ics"
    _FakeClient.pages = {
        url: _FakeResponse(
            """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//The Bend Test//EN
BEGIN:VEVENT
UID:community-cleanup-2026@example.org
DTSTAMP:20260801T120000Z
DTSTART:20260824T130000Z
SUMMARY:Community Cleanup
URL:https://events.example.org/events/community-cleanup
ATTACH:http://[not-an-ip]/broken.jpg
END:VEVENT
END:VCALENDAR
""",
            "text/calendar",
        )
    }
    monkeypatch.setattr(connector_service.httpx, "AsyncClient", _FakeClient)

    events = await ConnectorService(None)._parse_ics(url)

    assert len(events) == 1
    assert events[0]["title"] == "Community Cleanup"
    assert "image_url" not in events[0]


class _FakeConnectorRepository:
    def __init__(self, connector):
        self.connector = connector
        self.updates = []

    async def get_by_id(self, connector_id):
        return self.connector if connector_id == self.connector.id else None

    async def update(self, connector_id, data):
        self.updates.append((connector_id, data))


class _FakeEventRepository:
    def __init__(self, existing_by_url):
        self.existing_by_url = existing_by_url
        self.updates = []
        self.creates = []

    async def find_by_source_url(self, source_url, connector_id):
        return self.existing_by_url.get(source_url)

    async def update_image_if_blank(self, event_id, image_url):
        self.updates.append((event_id, {"image_url": image_url}))
        for event in self.existing_by_url.values():
            if event.id == event_id:
                if str(event.image_url or "").strip():
                    return False
                event.image_url = image_url
                return True
        return False

    async def update_image_if_matches(self, event_id, current_url, image_url):
        for event in self.existing_by_url.values():
            if event.id == event_id and event.image_url == current_url:
                self.updates.append((event_id, {"image_url": image_url}))
                event.image_url = image_url
                return True
        return False

    async def create(self, data):
        self.creates.append(data)


class _FakeEventImageCache:
    def __init__(self, cached_url):
        self.cached_url = cached_url
        self.seen = []

    async def cache(self, source_url):
        self.seen.append(source_url)
        return self.cached_url


class _ExplodingEventImageCache:
    async def cache(self, source_url):
        raise RuntimeError("unexpected image processor failure")


@pytest.mark.asyncio
async def test_resync_caches_flickr_and_atomically_replaces_the_matching_url():
    connector_id = uuid4()
    source_url = "https://events.example.org/events/paddle"
    flickr_url = (
        "https://www.flickr.com/photo_download.gne?"
        "id=123&secret=public-token&size=w"
    )
    local_url = "/uploads/images/event-paddle.jpg"
    existing = SimpleNamespace(id=uuid4(), image_url=flickr_url)
    connector = SimpleNamespace(
        id=connector_id,
        name="Westmoreland State Park",
        category="outdoor",
        tenant_id=uuid4(),
    )
    event_repo = _FakeEventRepository({source_url: existing})
    image_cache = _FakeEventImageCache(local_url)
    service = ConnectorService(None)
    service.connector_repo = _FakeConnectorRepository(connector)
    service.event_repo = event_repo
    service.image_cache = image_cache

    async def parse_source(_connector):
        return [
            {
                "title": "Sunset Paddle",
                "start_date": datetime(2026, 8, 19, 18, 0),
                "source_url": source_url,
                "image_url": flickr_url,
            }
        ]

    service._parse_source = parse_source

    result = await service.sync_connector(connector_id)

    assert result == {"synced": 0, "images_updated": 1, "total_parsed": 1}
    assert existing.image_url == local_url
    assert image_cache.seen == [flickr_url]


@pytest.mark.asyncio
async def test_resync_caches_flickr_for_blank_images_and_preserves_manual_images():
    connector_id = uuid4()
    blank_source_url = "https://events.example.org/events/blank"
    manual_source_url = "https://events.example.org/events/manual"
    flickr_url = (
        "https://www.flickr.com/photo_download.gne?"
        "id=123&secret=public-token&size=w"
    )
    local_url = "/uploads/images/event-paddle.jpg"
    blank_event = SimpleNamespace(id=uuid4(), image_url=None)
    manual_event = SimpleNamespace(
        id=uuid4(), image_url="/uploads/images/admin-choice.jpg"
    )
    connector = SimpleNamespace(
        id=connector_id,
        name="Westmoreland State Park",
        category="outdoor",
        tenant_id=uuid4(),
    )
    event_repo = _FakeEventRepository(
        {blank_source_url: blank_event, manual_source_url: manual_event}
    )
    image_cache = _FakeEventImageCache(local_url)
    service = ConnectorService(None)
    service.connector_repo = _FakeConnectorRepository(connector)
    service.event_repo = event_repo
    service.image_cache = image_cache

    async def parse_source(_connector):
        return [
            {
                "title": "Blank Event",
                "start_date": datetime(2026, 8, 19, 18, 0),
                "source_url": blank_source_url,
                "image_url": flickr_url,
            },
            {
                "title": "Manual Event",
                "start_date": datetime(2026, 8, 21, 18, 0),
                "source_url": manual_source_url,
                "image_url": flickr_url,
            },
        ]

    service._parse_source = parse_source

    result = await service.sync_connector(connector_id)

    assert result == {"synced": 0, "images_updated": 1, "total_parsed": 2}
    assert blank_event.image_url == local_url
    assert manual_event.image_url == "/uploads/images/admin-choice.jpg"
    assert image_cache.seen == [flickr_url]


@pytest.mark.asyncio
async def test_new_connector_event_stores_a_locally_cached_flickr_image():
    connector_id = uuid4()
    source_url = "https://events.example.org/events/new"
    flickr_url = (
        "https://www.flickr.com/photo_download.gne?"
        "id=123&secret=public-token&size=w"
    )
    local_url = "/uploads/images/event-new.jpg"
    connector = SimpleNamespace(
        id=connector_id,
        name="Westmoreland State Park",
        category="outdoor",
        tenant_id=uuid4(),
    )
    event_repo = _FakeEventRepository({})
    image_cache = _FakeEventImageCache(local_url)
    service = ConnectorService(None)
    service.connector_repo = _FakeConnectorRepository(connector)
    service.event_repo = event_repo
    service.image_cache = image_cache

    async def parse_source(_connector):
        return [
            {
                "title": "New Event",
                "start_date": datetime(2026, 8, 23, 13, 0),
                "source_url": source_url,
                "image_url": flickr_url,
            }
        ]

    service._parse_source = parse_source

    result = await service.sync_connector(connector_id)

    assert result == {"synced": 1, "images_updated": 0, "total_parsed": 1}
    assert event_repo.creates[0]["image_url"] == local_url
    assert image_cache.seen == [flickr_url]


@pytest.mark.asyncio
async def test_unexpected_image_cache_failure_does_not_abort_connector_sync():
    connector_id = uuid4()
    source_url = "https://events.example.org/events/new"
    flickr_url = (
        "https://www.flickr.com/photo_download.gne?"
        "id=123&secret=public-token&size=w"
    )
    connector = SimpleNamespace(
        id=connector_id,
        name="Westmoreland State Park",
        category="outdoor",
        tenant_id=uuid4(),
    )
    event_repo = _FakeEventRepository({})
    service = ConnectorService(None)
    service.connector_repo = _FakeConnectorRepository(connector)
    service.event_repo = event_repo
    service.image_cache = _ExplodingEventImageCache()

    async def parse_source(_connector):
        return [
            {
                "title": "New Event",
                "start_date": datetime(2026, 8, 23, 13, 0),
                "source_url": source_url,
                "image_url": flickr_url,
            }
        ]

    service._parse_source = parse_source

    result = await service.sync_connector(connector_id)

    assert result == {"synced": 1, "images_updated": 0, "total_parsed": 1}
    assert "image_url" not in event_repo.creates[0]


@pytest.mark.asyncio
async def test_resync_backfills_only_blank_images_and_preserves_manual_images():
    connector_id = uuid4()
    connector = SimpleNamespace(
        id=connector_id,
        name="Source Calendar",
        category="community",
        tenant_id=uuid4(),
    )
    blank_event = SimpleNamespace(id=uuid4(), image_url="\t")
    manual_event = SimpleNamespace(
        id=uuid4(), image_url="https://bend.example.org/uploads/manual-choice.jpg"
    )
    blank_url = "https://events.example.org/events/blank"
    manual_url = "https://events.example.org/events/manual"

    connector_repo = _FakeConnectorRepository(connector)
    event_repo = _FakeEventRepository(
        {blank_url: blank_event, manual_url: manual_event}
    )
    service = ConnectorService(None)
    service.connector_repo = connector_repo
    service.event_repo = event_repo

    async def parse_source(_connector):
        return [
            {
                "title": "Blank Image Event",
                "start_date": datetime(2026, 8, 19, 18, 0),
                "source_url": blank_url,
                "image_url": "https://events.example.org/assets/backfill.jpg",
            },
            {
                "title": "Manual Image Event",
                "start_date": datetime(2026, 8, 21, 19, 0),
                "source_url": manual_url,
                "image_url": "https://events.example.org/assets/replacement.jpg",
            },
        ]

    service._parse_source = parse_source

    result = await service.sync_connector(connector_id)

    assert result == {"synced": 0, "images_updated": 1, "total_parsed": 2}
    assert event_repo.updates == [
        (
            blank_event.id,
            {"image_url": "https://events.example.org/assets/backfill.jpg"},
        )
    ]
    assert event_repo.creates == []

    second_result = await service.sync_connector(connector_id)

    assert second_result == {
        "synced": 0,
        "images_updated": 0,
        "total_parsed": 2,
    }
    assert len(event_repo.updates) == 1


class _RacingEventRepository(_FakeEventRepository):
    async def update_image_if_blank(self, event_id, image_url):
        for event in self.existing_by_url.values():
            if event.id == event_id:
                event.image_url = "https://bend.example.org/uploads/admin-won-race.jpg"
        return await super().update_image_if_blank(event_id, image_url)


@pytest.mark.asyncio
async def test_resync_does_not_overwrite_an_admin_image_saved_during_sync():
    connector_id = uuid4()
    source_url = "https://events.example.org/events/race"
    existing = SimpleNamespace(id=uuid4(), image_url=None)
    connector = SimpleNamespace(
        id=connector_id,
        name="Source Calendar",
        category="community",
        tenant_id=uuid4(),
    )
    service = ConnectorService(None)
    service.connector_repo = _FakeConnectorRepository(connector)
    service.event_repo = _RacingEventRepository({source_url: existing})

    async def parse_source(_connector):
        return [
            {
                "title": "Race Event",
                "start_date": datetime(2026, 8, 26, 18, 0),
                "source_url": source_url,
                "image_url": "https://events.example.org/assets/imported.jpg",
            }
        ]

    service._parse_source = parse_source

    result = await service.sync_connector(connector_id)

    assert result["images_updated"] == 0
    assert existing.image_url == (
        "https://bend.example.org/uploads/admin-won-race.jpg"
    )


class _NoRowResult:
    def scalar_one_or_none(self):
        return None


class _CapturingSession:
    def __init__(self):
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return _NoRowResult()


@pytest.mark.asyncio
async def test_repository_backfill_is_one_atomic_blank_only_update():
    session = _CapturingSession()
    repository = EventRepository(session)

    updated = await repository.update_image_if_blank(
        uuid4(), "https://events.example.org/assets/imported.jpg"
    )

    compiled = str(
        session.statement.compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )
    assert updated is False
    assert "UPDATE events" in compiled
    assert "events.image_url IS NULL" in compiled
    assert "btrim(events.image_url," in compiled
    assert "btrim(events.image_url) = ''" not in compiled
    assert "RETURNING events.id" in compiled


@pytest.mark.asyncio
async def test_repository_replaces_only_the_matching_imported_image_url():
    session = _CapturingSession()
    repository = EventRepository(session)
    source_url = (
        "https://www.flickr.com/photo_download.gne?"
        "id=123&secret=public-token&size=w"
    )

    updated = await repository.update_image_if_matches(
        uuid4(), source_url, "/uploads/images/event-123.jpg"
    )

    compiled = str(
        session.statement.compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )
    assert updated is False
    assert "UPDATE events" in compiled
    assert f"events.image_url = '{source_url}'" in compiled
    assert "RETURNING events.id" in compiled
