"""Tenant and outbound URL boundaries for event connector administration."""

from __future__ import annotations

import asyncio
import inspect
from pathlib import Path
import tomllib
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID, uuid4

import aiohttp
import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select

from app.api.deps import get_db
from app.api.v1.admin import router as admin_router
from app.core.exceptions import AppException
from app.core.permissions import get_current_tenant, get_current_user
from app.database import async_session, engine
from app.models.enums import ConnectorType, EventCategory, EventStatus, UserRole
from app.models.event import Event, EventConnector
from app.models.tenant import Tenant
from app.models.user import User
from app.services.connector_service import ConnectorService
from app.services import connector_service
from app.services.safe_external_fetcher import _PeerRecordingConnector


SAFE_CONNECTOR_URL = "https://93.184.216.34/events.xml"


@pytest_asyncio.fixture
async def admin_security_rows():
    await engine.dispose()
    ids = {
        name: uuid4()
        for name in (
            "tenant_a",
            "tenant_b",
            "admin_a",
            "admin_b",
            "event_a",
            "event_b",
            "connector_a",
            "connector_b",
        )
    }
    marker = uuid4().hex
    async with async_session() as db:
        db.add_all(
            [
                Tenant(
                    id=ids["tenant_a"],
                    slug=f"connector-a-{marker}",
                    subdomain=f"connector-a-{marker}",
                    display_name="Connector tenant A",
                ),
                Tenant(
                    id=ids["tenant_b"],
                    slug=f"connector-b-{marker}",
                    subdomain=f"connector-b-{marker}",
                    display_name="Connector tenant B",
                ),
            ]
        )
        await db.flush()
        db.add_all(
            [
                User(
                    id=ids["admin_a"],
                    tenant_id=ids["tenant_a"],
                    email=f"connector-a-{marker}@example.test",
                    password_hash="x",
                    name="Tenant A admin",
                    role=UserRole.COMMUNITY_ADMIN,
                ),
                User(
                    id=ids["admin_b"],
                    tenant_id=ids["tenant_b"],
                    email=f"connector-b-{marker}@example.test",
                    password_hash="x",
                    name="Tenant B admin",
                    role=UserRole.COMMUNITY_ADMIN,
                ),
            ]
        )
        await db.flush()
        starts = datetime.utcnow() + timedelta(days=7)
        db.add_all(
            [
                Event(
                    id=ids["event_a"],
                    tenant_id=ids["tenant_a"],
                    title="Tenant A private admin event",
                    start_date=starts,
                    category=EventCategory.COMMUNITY,
                    status=EventStatus.ACTIVE,
                    source="manual",
                ),
                Event(
                    id=ids["event_b"],
                    tenant_id=ids["tenant_b"],
                    title="Tenant B admin event",
                    start_date=starts,
                    category=EventCategory.COMMUNITY,
                    status=EventStatus.ACTIVE,
                    source="manual",
                ),
                EventConnector(
                    id=ids["connector_a"],
                    tenant_id=ids["tenant_a"],
                    name="Tenant A private connector",
                    type=ConnectorType.RSS,
                    url=SAFE_CONNECTOR_URL,
                    category=EventCategory.COMMUNITY,
                    is_active=True,
                ),
                EventConnector(
                    id=ids["connector_b"],
                    tenant_id=ids["tenant_b"],
                    name="Tenant B connector",
                    type=ConnectorType.RSS,
                    url=SAFE_CONNECTOR_URL,
                    category=EventCategory.COMMUNITY,
                    is_active=True,
                ),
            ]
        )
        await db.commit()

    try:
        yield ids
    finally:
        async with async_session() as db:
            await db.execute(
                delete(Event).where(
                    Event.tenant_id.in_([ids["tenant_a"], ids["tenant_b"]])
                )
            )
            await db.execute(
                delete(EventConnector).where(
                    EventConnector.tenant_id.in_([ids["tenant_a"], ids["tenant_b"]])
                )
            )
            await db.execute(
                delete(User).where(User.id.in_([ids["admin_a"], ids["admin_b"]]))
            )
            await db.execute(
                delete(Tenant).where(Tenant.id.in_([ids["tenant_a"], ids["tenant_b"]]))
            )
            await db.commit()
        await engine.dispose()


def _admin_app(db, tenant: Tenant | None, user: User) -> FastAPI:
    tenant_id = tenant.id if tenant is not None else None
    user_id = user.id
    app = FastAPI()

    @app.exception_handler(AppException)
    async def app_exception_handler(_, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    app.include_router(admin_router, prefix="/api/v1")

    async def db_override():
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    async def tenant_override():
        return await db.get(Tenant, tenant_id) if tenant_id is not None else None

    async def user_override():
        return await db.get(User, user_id)

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_tenant] = tenant_override
    app.dependency_overrides[get_current_user] = user_override
    return app


async def _request(app: FastAPI, method: str, path: str, **kwargs):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.request(method, path, **kwargs)


EVENT_PAYLOAD = {
    "title": "Created through tenant admin",
    "description": "Tenant-owned event",
    "start_date": "2031-01-01T10:00:00",
    "category": "community",
}

CONNECTOR_PAYLOAD = {
    "name": "Created through tenant admin",
    "type": "rss",
    "url": SAFE_CONNECTOR_URL,
    "category": "community",
}


def _admin_requests(ids: dict[str, UUID]):
    return [
        ("GET", "/api/v1/admin/events", None),
        ("POST", "/api/v1/admin/events", EVENT_PAYLOAD),
        ("PUT", f"/api/v1/admin/events/{ids['event_a']}", {"title": "Changed"}),
        ("DELETE", f"/api/v1/admin/events/{ids['event_a']}", None),
        ("GET", "/api/v1/admin/connectors", None),
        ("POST", "/api/v1/admin/connectors", CONNECTOR_PAYLOAD),
        (
            "PUT",
            f"/api/v1/admin/connectors/{ids['connector_a']}",
            {"name": "Changed"},
        ),
        ("DELETE", f"/api/v1/admin/connectors/{ids['connector_a']}", None),
        ("POST", f"/api/v1/admin/connectors/{ids['connector_a']}/test", None),
        ("POST", f"/api/v1/admin/connectors/{ids['connector_a']}/sync", None),
        ("POST", "/api/v1/admin/connectors/sync-all", None),
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("tenant_mode", ["unresolved", "mismatched"])
async def test_every_event_connector_admin_route_requires_matching_request_tenant(
    admin_security_rows, tenant_mode
):
    ids = admin_security_rows
    async with async_session() as db:
        admin_a = await db.get(User, ids["admin_a"])
        tenant = (
            None
            if tenant_mode == "unresolved"
            else await db.get(Tenant, ids["tenant_b"])
        )
        app = _admin_app(db, tenant, admin_a)

        for method, path, payload in _admin_requests(ids):
            response = await _request(app, method, path, json=payload)
            assert response.status_code == 404, (
                tenant_mode,
                method,
                path,
                response.text,
            )

        event_a = await db.get(Event, ids["event_a"])
        connector_a = await db.get(EventConnector, ids["connector_a"])
        assert event_a.title == "Tenant A private admin event"
        assert connector_a.name == "Tenant A private connector"
        assert connector_a.last_synced_at is None


@pytest.mark.asyncio
async def test_tenant_admin_lists_and_creates_only_inside_request_tenant(
    admin_security_rows,
):
    ids = admin_security_rows
    async with async_session() as db:
        tenant_b = await db.get(Tenant, ids["tenant_b"])
        admin_b = await db.get(User, ids["admin_b"])
        app = _admin_app(db, tenant_b, admin_b)

        events = await _request(app, "GET", "/api/v1/admin/events")
        assert events.status_code == 200
        assert {item["id"] for item in events.json()["items"]} == {str(ids["event_b"])}

        connectors = await _request(app, "GET", "/api/v1/admin/connectors")
        assert connectors.status_code == 200
        assert {item["id"] for item in connectors.json()["items"]} == {
            str(ids["connector_b"])
        }

        created_event = await _request(
            app, "POST", "/api/v1/admin/events", json=EVENT_PAYLOAD
        )
        created_connector = await _request(
            app, "POST", "/api/v1/admin/connectors", json=CONNECTOR_PAYLOAD
        )
        assert created_event.status_code == created_connector.status_code == 200
        assert (await db.get(Event, UUID(created_event.json()["id"]))).tenant_id == ids[
            "tenant_b"
        ]
        assert (
            await db.get(EventConnector, UUID(created_connector.json()["id"]))
        ).tenant_id == ids["tenant_b"]


@pytest.mark.asyncio
async def test_connector_create_and_update_reject_unsafe_urls_before_persistence(
    admin_security_rows,
):
    ids = admin_security_rows
    async with async_session() as db:
        tenant_b = await db.get(Tenant, ids["tenant_b"])
        admin_b = await db.get(User, ids["admin_b"])
        app = _admin_app(db, tenant_b, admin_b)
        before = (
            (
                await db.execute(
                    select(EventConnector).where(
                        EventConnector.tenant_id == ids["tenant_b"]
                    )
                )
            )
            .scalars()
            .all()
        )

        created = await _request(
            app,
            "POST",
            "/api/v1/admin/connectors",
            json={
                **CONNECTOR_PAYLOAD,
                "url": "http://169.254.169.254/latest/meta-data/",
            },
        )
        updated = await _request(
            app,
            "PUT",
            f"/api/v1/admin/connectors/{ids['connector_b']}",
            json={"url": "http://127.0.0.1/private"},
        )

        assert created.status_code == updated.status_code == 400
        after = (
            (
                await db.execute(
                    select(EventConnector).where(
                        EventConnector.tenant_id == ids["tenant_b"]
                    )
                )
            )
            .scalars()
            .all()
        )
        assert {row.id for row in after} == {row.id for row in before}
        assert (
            await db.get(EventConnector, ids["connector_b"])
        ).url == SAFE_CONNECTOR_URL


@pytest.mark.asyncio
async def test_tenant_admin_cannot_target_another_tenants_event_or_connector(
    admin_security_rows, monkeypatch
):
    ids = admin_security_rows

    async def external_fetch_must_not_run(*args, **kwargs):
        raise AssertionError("cross-tenant route reached connector parsing")

    monkeypatch.setattr(ConnectorService, "_parse_source", external_fetch_must_not_run)

    async with async_session() as db:
        tenant_b = await db.get(Tenant, ids["tenant_b"])
        admin_b = await db.get(User, ids["admin_b"])
        app = _admin_app(db, tenant_b, admin_b)
        targeted = [
            ("PUT", f"/api/v1/admin/events/{ids['event_a']}", {"title": "Stolen"}),
            ("DELETE", f"/api/v1/admin/events/{ids['event_a']}", None),
            (
                "PUT",
                f"/api/v1/admin/connectors/{ids['connector_a']}",
                {"name": "Stolen"},
            ),
            ("DELETE", f"/api/v1/admin/connectors/{ids['connector_a']}", None),
            ("POST", f"/api/v1/admin/connectors/{ids['connector_a']}/test", None),
            ("POST", f"/api/v1/admin/connectors/{ids['connector_a']}/sync", None),
        ]
        for method, path, payload in targeted:
            response = await _request(app, method, path, json=payload)
            assert response.status_code == 404, (method, path, response.text)

        assert (
            await db.get(Event, ids["event_a"])
        ).title == "Tenant A private admin event"
        connector_a = await db.get(EventConnector, ids["connector_a"])
        assert connector_a.name == "Tenant A private connector"
        assert connector_a.last_synced_at is None


@pytest.mark.asyncio
async def test_sync_all_processes_only_the_matching_tenants_active_connectors(
    admin_security_rows, monkeypatch
):
    ids = admin_security_rows
    parsed_connector_ids: list[UUID] = []

    async def empty_feed(self, connector):
        parsed_connector_ids.append(connector.id)
        return []

    monkeypatch.setattr(ConnectorService, "_parse_source", empty_feed)

    async with async_session() as db:
        tenant_b = await db.get(Tenant, ids["tenant_b"])
        admin_b = await db.get(User, ids["admin_b"])
        app = _admin_app(db, tenant_b, admin_b)
        response = await _request(app, "POST", "/api/v1/admin/connectors/sync-all")

        assert response.status_code == 200, response.text
        assert parsed_connector_ids == [ids["connector_b"]]
        assert (await db.get(EventConnector, ids["connector_a"])).last_synced_at is None
        assert (
            await db.get(EventConnector, ids["connector_b"])
        ).last_synced_at is not None


@pytest.mark.asyncio
async def test_sync_count_matches_the_number_of_persisted_event_rows(
    admin_security_rows, monkeypatch
):
    ids = admin_security_rows
    starts = datetime(2031, 1, 1, 10, 0)

    async def two_events(self, connector):
        return [
            {
                "title": "First imported event",
                "start_date": starts,
                "source_url": "https://example.com/events/first",
                "status": "active",
            },
            {
                "title": "Second imported event",
                "start_date": starts + timedelta(hours=1),
                "source_url": "https://example.com/events/second",
                "status": "active",
            },
        ]

    monkeypatch.setattr(ConnectorService, "_parse_source", two_events)
    async with async_session() as db:
        service = ConnectorService(db, tenant_id=ids["tenant_b"])
        result = await service.sync_connector(ids["connector_b"])
        persisted_count = len(
            (
                await db.execute(
                    select(Event).where(
                        Event.connector_id == ids["connector_b"],
                        Event.tenant_id == ids["tenant_b"],
                    )
                )
            )
            .scalars()
            .all()
        )
        connector = await db.get(EventConnector, ids["connector_b"])

        assert result == {"synced": 2, "total_parsed": 2}
        assert connector.last_sync_count == persisted_count == 2


def _normalize_external_url(value: str) -> str:
    normalizer = getattr(connector_service, "normalize_external_url", None)
    assert callable(normalizer), "shared outbound URL policy is missing"
    return normalizer(value)


def _safe_fetcher_class():
    fetcher_class = getattr(connector_service, "SafeExternalFetcher", None)
    assert fetcher_class is not None, "safe external fetcher is missing"
    return fetcher_class


def test_peer_verification_hook_is_locked_to_the_tested_aiohttp_minor():
    pyproject = tomllib.loads(
        (Path(__file__).parents[1] / "pyproject.toml").read_text(encoding="utf-8")
    )

    assert pyproject["tool"]["poetry"]["dependencies"]["aiohttp"] == (
        ">=3.14.0,<3.15.0"
    )
    assert aiohttp.__version__.startswith("3.14.")
    assert inspect.iscoroutinefunction(_PeerRecordingConnector._wrap_create_connection)


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "ftp://example.com/events",
        "https://user:secret@example.com/events",
        "https://example.com:22/events",
        "http://localhost/events",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://127.0.0.1/events",
        "http://127.1/events",
        "http://2130706433/events",
        "http://0x7f000001/events",
        "http://017700000001/events",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/events",
        "http://172.16.0.1/events",
        "http://192.168.0.1/events",
        "http://100.64.0.1/events",
        "http://224.0.0.1/events",
        "http://[::1]/events",
        "http://[::ffff:127.0.0.1]/events",
        "http://[ff02::1]/events",
        "http://[64:ff9b::1]/events",
        "https://example.com\\@127.0.0.1/events",
        "https://example.com\\127.0.0.1/events",
        "https://example.com/" + ("a" * 600),
    ],
)
def test_outbound_url_policy_rejects_non_public_destinations(url):
    with pytest.raises(ValueError):
        _normalize_external_url(url)


def test_outbound_url_policy_normalizes_public_http_urls():
    assert _normalize_external_url(" HTTPS://Example.COM:443/events?q=1 ") == (
        "https://example.com/events?q=1"
    )
    assert _normalize_external_url("http://93.184.216.34/events") == (
        "http://93.184.216.34/events"
    )
    assert _normalize_external_url("https://example.com/events#section") == (
        "https://example.com/events#section"
    )


def test_deterministic_source_url_respects_the_database_column_limit():
    source_url = connector_service.deterministic_source_url(
        "https://example.com/" + ("a" * 470),
        None,
        "stable imported event",
    )

    assert len(source_url) <= 500
    assert source_url.startswith("https://example.com/")
    assert "#event-" in source_url


@dataclass
class _FetchHop:
    status_code: int
    headers: dict[str, str]
    body: bytes
    peer_ip: str


@pytest.mark.asyncio
async def test_safe_fetcher_rejects_mixed_public_and_private_dns_answers():
    request_count = 0

    async def resolver(host, port):
        assert (host, port) == ("example.com", 443)
        return ["93.184.216.34", "127.0.0.1"]

    async def requester(*args):
        nonlocal request_count
        request_count += 1
        raise AssertionError("mixed DNS answer reached the network")

    fetcher = _safe_fetcher_class()(resolver=resolver, requester=requester)
    with pytest.raises(ValueError):
        await fetcher.fetch_text("https://example.com/events")
    assert request_count == 0


@pytest.mark.asyncio
async def test_safe_fetcher_pins_the_connection_to_the_validated_dns_answer():
    async def resolver(host, port):
        return ["93.184.216.34"]

    async def rebound_request(url, resolved_ips, max_bytes, timeout_seconds):
        assert resolved_ips == ("93.184.216.34",)
        return _FetchHop(200, {"content-type": "text/plain"}, b"events", "127.0.0.1")

    fetcher = _safe_fetcher_class()(resolver=resolver, requester=rebound_request)
    with pytest.raises(ValueError):
        await fetcher.fetch_text("https://example.com/events")


@pytest.mark.asyncio
async def test_safe_fetcher_compares_equivalent_ipv6_addresses_canonically():
    async def resolver(host, port):
        return ["2606:4700:4700:0:0:0:0:1111"]

    async def public_ipv6_request(url, resolved_ips, max_bytes, timeout_seconds):
        assert resolved_ips == ("2606:4700:4700::1111",)
        return _FetchHop(
            200,
            {"content-type": "text/plain"},
            b"events",
            "2606:4700:4700::1111",
        )

    fetcher = _safe_fetcher_class()(resolver=resolver, requester=public_ipv6_request)
    response = await fetcher.fetch_text("https://example.com/events")

    assert response.text == "events"


@pytest.mark.asyncio
async def test_safe_fetcher_revalidates_every_redirect_destination():
    request_count = 0

    async def resolver(host, port):
        return ["93.184.216.34"]

    async def redirect_to_metadata(url, resolved_ips, max_bytes, timeout_seconds):
        nonlocal request_count
        request_count += 1
        return _FetchHop(
            302,
            {"location": "http://169.254.169.254/latest/meta-data/"},
            b"",
            "93.184.216.34",
        )

    fetcher = _safe_fetcher_class()(resolver=resolver, requester=redirect_to_metadata)
    with pytest.raises(ValueError):
        await fetcher.fetch_text("https://example.com/events")
    assert request_count == 1


@pytest.mark.asyncio
async def test_safe_fetcher_caps_redirects_and_decoded_response_size():
    async def resolver(host, port):
        return ["93.184.216.34"]

    redirect_count = 0

    async def endless_redirect(url, resolved_ips, max_bytes, timeout_seconds):
        nonlocal redirect_count
        redirect_count += 1
        return _FetchHop(
            302,
            {"location": f"https://example.com/events/{redirect_count}"},
            b"",
            "93.184.216.34",
        )

    fetcher = _safe_fetcher_class()(
        resolver=resolver, requester=endless_redirect, max_redirects=2
    )
    with pytest.raises(ValueError):
        await fetcher.fetch_text("https://example.com/events")
    assert redirect_count == 3

    async def oversized(url, resolved_ips, max_bytes, timeout_seconds):
        return _FetchHop(
            200,
            {"content-type": "text/plain"},
            b"123456",
            "93.184.216.34",
        )

    fetcher = _safe_fetcher_class()(resolver=resolver, requester=oversized, max_bytes=5)
    with pytest.raises(ValueError):
        await fetcher.fetch_text("https://example.com/events")


@pytest.mark.asyncio
async def test_safe_fetcher_applies_one_deadline_across_dns_and_requests():
    async def slow_resolver(host, port):
        await asyncio.sleep(0.05)
        return ["93.184.216.34"]

    async def requester(*args):
        raise AssertionError("expired DNS deadline reached the network")

    fetcher = _safe_fetcher_class()(
        resolver=slow_resolver, requester=requester, timeout_seconds=0.01
    )
    with pytest.raises(ValueError):
        await fetcher.fetch_text("https://example.com/events")


class _ParserResponse:
    def __init__(self, text: str, content_type: str = "text/plain"):
        self.text = text
        self.headers = {"content-type": content_type}

    def raise_for_status(self):
        return None


class _ParserFetcher:
    response = _ParserResponse("")

    async def fetch_text(self, url: str):
        return self.response


@pytest.mark.asyncio
async def test_ics_import_replaces_unsafe_entry_urls_with_a_deterministic_safe_key():
    feed_url = "https://93.184.216.34/calendar.ics"
    _ParserFetcher.response = _ParserResponse(
        """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:stable-entry-123
DTSTART:20310101T100000
SUMMARY:Unsafe linked event
DESCRIPTION:http://127.0.0.1/private
URL:http://169.254.169.254/latest/meta-data/
END:VEVENT
END:VCALENDAR
""",
        "text/calendar",
    )
    service = ConnectorService(None, fetcher=_ParserFetcher())

    first = await service._parse_ics(feed_url)
    second = await service._parse_ics(feed_url)

    assert first[0]["source_url"] == second[0]["source_url"]
    assert first[0]["source_url"].startswith(feed_url + "#event-")
    assert "127.0.0.1" not in first[0]["source_url"]
    assert "169.254.169.254" not in first[0]["source_url"]
    assert first[0]["description"] == "http://127.0.0.1/private"


@pytest.mark.asyncio
async def test_rss_and_html_imports_never_persist_unsafe_entry_urls():
    feed_url = "https://93.184.216.34/feed.xml"
    _ParserFetcher.response = _ParserResponse(
        """<rss><channel><item>
          <guid>stable-rss-entry</guid>
          <title>RSS event</title>
          <link>http://127.0.0.1/private</link>
          <pubDate>Tue, 1 Jan 2031 10:00:00 GMT</pubDate>
        </item></channel></rss>""",
        "application/rss+xml",
    )
    service = ConnectorService(None, fetcher=_ParserFetcher())
    rss_first = await service._parse_rss(feed_url)
    rss_second = await service._parse_rss(feed_url)
    assert rss_first[0]["source_url"] == rss_second[0]["source_url"]
    assert rss_first[0]["source_url"].startswith(feed_url + "#event-")
    assert "127.0.0.1" not in rss_first[0]["source_url"]

    page_url = "https://93.184.216.34/events"
    _ParserFetcher.response = _ParserResponse(
        """<html><body><article>
          <h2>HTML event</h2><time datetime="2031-01-01T10:00:00">January 1</time>
          <a href="http://169.254.169.254/latest/meta-data/">Details</a>
        </article></body></html>""",
        "text/html",
    )
    html_events = await service._parse_html(
        page_url,
        {
            "title_selector": "h2",
            "date_selector": "time",
            "link_selector": "a",
        },
    )
    assert len(html_events) == 1
    assert html_events[0]["source_url"].startswith(page_url + "#event-")
    assert "169.254.169.254" not in html_events[0]["source_url"]
