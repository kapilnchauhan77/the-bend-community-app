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


def _committing_admin_app(tenant_id: UUID, user_id: UUID) -> FastAPI:
    """Build an admin app whose concurrent requests use independent sessions."""
    app = FastAPI()

    @app.exception_handler(AppException)
    async def app_exception_handler(_, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    app.include_router(admin_router, prefix="/api/v1")

    async def db_override():
        async with async_session() as db:
            try:
                yield db
                await db.commit()
            except Exception:
                await db.rollback()
                raise

    async def tenant_override():
        async with async_session() as db:
            return await db.get(Tenant, tenant_id)

    async def user_override():
        async with async_session() as db:
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


@pytest.mark.asyncio
async def test_concurrent_asgi_syncs_serialize_one_connector_import(
    admin_security_rows, monkeypatch
):
    """Removing connector serialization must recreate the duplicate-insert race."""
    ids = admin_security_rows
    both_parsing = asyncio.Barrier(2)
    start = datetime(2031, 1, 2, 10, 0)

    async def one_event(self, connector):
        await both_parsing.wait()
        return [
            {
                "title": "One concurrent import",
                "start_date": start,
                "source_url": "https://example.com/events/concurrent-import",
                "status": "active",
            }
        ]

    monkeypatch.setattr(ConnectorService, "_parse_source", one_event)
    app = _committing_admin_app(ids["tenant_b"], ids["admin_b"])
    path = f"/api/v1/admin/connectors/{ids['connector_b']}/sync"

    responses = await asyncio.wait_for(
        asyncio.gather(
            _request(app, "POST", path),
            _request(app, "POST", path),
            return_exceptions=True,
        ),
        timeout=10,
    )

    assert not any(isinstance(response, Exception) for response in responses), responses
    assert [response.status_code for response in responses] == [200, 200]
    assert sorted(response.json()["synced"] for response in responses) == [0, 1]
    assert all(response.json()["total_parsed"] == 1 for response in responses)

    async with async_session() as db:
        persisted = (
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

    assert [(event.title, event.source_url) for event in persisted] == [
        (
            "One concurrent import",
            "https://example.com/events/concurrent-import",
        )
    ]
    assert connector.last_sync_error is None
    assert connector.last_sync_count == 0


@pytest.mark.asyncio
async def test_sync_all_recovers_after_one_connector_flush_failure(
    admin_security_rows, monkeypatch
):
    """Removing the savepoint must poison the shared sync-all session."""
    ids = admin_security_rows
    broken_connector_id = uuid4()
    working_source_url = "https://example.com/events/after-failed-connector"

    async with async_session() as db:
        working = await db.get(EventConnector, ids["connector_b"])
        working.name = "B working connector"
        db.add(
            EventConnector(
                id=broken_connector_id,
                tenant_id=ids["tenant_b"],
                name="A broken connector",
                type=ConnectorType.RSS,
                url="https://example.com/broken-events.xml",
                category=EventCategory.COMMUNITY,
                is_active=True,
            )
        )
        await db.commit()

    async def connector_events(self, connector):
        if connector.id == broken_connector_id:
            return [
                {
                    "title": "Invalid imported event",
                    "start_date": None,
                    "source_url": "https://example.com/events/invalid",
                    "status": "active",
                }
            ]
        return [
            {
                "title": "Imported after connector failure",
                "start_date": datetime(2031, 1, 3, 10, 0),
                "source_url": working_source_url,
                "status": "active",
            }
        ]

    monkeypatch.setattr(ConnectorService, "_parse_source", connector_events)

    async with async_session() as db:
        tenant_b = await db.get(Tenant, ids["tenant_b"])
        admin_b = await db.get(User, ids["admin_b"])
        response = await _request(
            _admin_app(db, tenant_b, admin_b),
            "POST",
            "/api/v1/admin/connectors/sync-all",
        )

    assert response.status_code == 200, response.text
    broken_result = response.json()["A broken connector"]
    assert broken_result["status"] == "error"
    assert "NotNullViolationError" in broken_result["error"]
    assert "PendingRollbackError" not in broken_result["error"]
    assert response.json()["B working connector"] == {
        "status": "ok",
        "synced": 1,
        "total_parsed": 1,
    }

    async with async_session() as db:
        broken = await db.get(EventConnector, broken_connector_id)
        working = await db.get(EventConnector, ids["connector_b"])
        persisted = (
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

    assert broken.last_sync_count == 0
    assert "NotNullViolationError" in broken.last_sync_error
    assert "PendingRollbackError" not in broken.last_sync_error
    assert working.last_sync_count == 1
    assert [(event.title, event.source_url) for event in persisted] == [
        ("Imported after connector failure", working_source_url)
    ]


@pytest.mark.asyncio
async def test_sync_migrates_a_legacy_plain_source_key_without_duplicating_the_event(
    admin_security_rows, monkeypatch
):
    ids = admin_security_rows
    legacy_event_id = uuid4()
    legacy_url = "https://example.com/events/legacy"
    stable_key = f"{legacy_url}#event-6c2783d79d2511e2c4cebd386e22f12a"

    async def parsed_event(self, connector):
        return [
            {
                "title": "Legacy imported event",
                "start_date": datetime(2031, 1, 1, 10, 0),
                "source_url": stable_key,
                "status": "active",
            }
        ]

    monkeypatch.setattr(ConnectorService, "_parse_source", parsed_event)
    async with async_session() as db:
        db.add(
            Event(
                id=legacy_event_id,
                tenant_id=ids["tenant_b"],
                title="Legacy imported event",
                start_date=datetime(2031, 1, 1, 10, 0),
                category=EventCategory.COMMUNITY,
                status=EventStatus.ACTIVE,
                source="Tenant B connector",
                source_url=legacy_url,
                connector_id=ids["connector_b"],
            )
        )
        await db.flush()

        result = await ConnectorService(db, tenant_id=ids["tenant_b"]).sync_connector(
            ids["connector_b"]
        )
        persisted = (
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

        assert result == {"synced": 0, "total_parsed": 1}
        assert [(event.id, event.source_url) for event in persisted] == [
            (legacy_event_id, stable_key)
        ]


@pytest.mark.asyncio
async def test_sync_migrates_the_exact_b68_rss_key_in_place(admin_security_rows):
    ids = admin_security_rows
    event_id = uuid4()
    old_key = (
        "https://example.com/events/intrinsic#event-3e329dc5019a92d20ed019ea317f0162"
    )
    _ParserFetcher.response = _ParserResponse(
        """<rss><channel><item>
          <guid>rss-stable-1</guid><title>RSS legacy event</title>
          <link>https://example.com/events/intrinsic</link>
          <pubDate>Tue, 1 Jan 2031 10:00:00 GMT</pubDate>
        </item></channel></rss>""",
        "application/rss+xml",
    )

    async with async_session() as db:
        db.add(
            Event(
                id=event_id,
                tenant_id=ids["tenant_b"],
                title="RSS legacy event",
                start_date=datetime(2031, 1, 1, 10, 0),
                category=EventCategory.COMMUNITY,
                status=EventStatus.ACTIVE,
                source="Tenant B connector",
                source_url=old_key,
                connector_id=ids["connector_b"],
            )
        )
        await db.flush()

        result = await ConnectorService(
            db,
            tenant_id=ids["tenant_b"],
            fetcher=_ParserFetcher(),
        ).sync_connector(ids["connector_b"])
        persisted = (
            (
                await db.execute(
                    select(Event).where(Event.connector_id == ids["connector_b"])
                )
            )
            .scalars()
            .all()
        )

        assert result == {"synced": 0, "total_parsed": 1}
        assert len(persisted) == 1
        assert persisted[0].id == event_id
        assert persisted[0].source_url == (
            "https://example.com/events/intrinsic"
            "#event-df3c9a40fecaa155bf61e884eb7c8e75"
        )


@pytest.mark.asyncio
async def test_sync_migrates_the_exact_b68_html_key_in_place(admin_security_rows):
    ids = admin_security_rows
    event_id = uuid4()
    page_url = "https://example.com/events"
    old_key = (
        "https://example.com/events/html-legacy#event-35673daf4d7a23f644c1bac51fedb09c"
    )
    _ParserFetcher.response = _ParserResponse(
        """<html><body><article>
          <h2>HTML legacy event</h2>
          <time datetime="2031-01-01T10:00:00">January 1</time>
          <a href="https://example.com/events/html-legacy">Details</a>
        </article></body></html>""",
        "text/html",
    )

    async with async_session() as db:
        connector = await db.get(EventConnector, ids["connector_b"])
        connector.type = ConnectorType.HTML
        connector.url = page_url
        connector.config = {}
        db.add(
            Event(
                id=event_id,
                tenant_id=ids["tenant_b"],
                title="HTML legacy event",
                start_date=datetime(2031, 1, 1, 10, 0),
                category=EventCategory.COMMUNITY,
                status=EventStatus.ACTIVE,
                source="Tenant B connector",
                source_url=old_key,
                connector_id=ids["connector_b"],
            )
        )
        await db.flush()

        result = await ConnectorService(
            db,
            tenant_id=ids["tenant_b"],
            fetcher=_ParserFetcher(),
        ).sync_connector(ids["connector_b"])
        persisted = (
            (
                await db.execute(
                    select(Event).where(Event.connector_id == ids["connector_b"])
                )
            )
            .scalars()
            .all()
        )

        assert result == {"synced": 0, "total_parsed": 1}
        assert [(event.id, event.source_url) for event in persisted] == [
            (
                event_id,
                "https://example.com/events/html-legacy"
                "#event-8c8be177c13d558277754e40c82fdfcf",
            )
        ]


@pytest.mark.asyncio
async def test_rss_guid_migrates_one_event_when_its_permalink_changes(
    admin_security_rows,
):
    ids = admin_security_rows
    old_link = "https://example.com/events/old-rss-link"
    new_link = "https://example.com/events/new-rss-link"

    def rss_body(link: str) -> str:
        return f"""<rss><channel><item>
          <guid>permalink-stable-rss-guid</guid>
          <title>RSS permalink event</title><link>{link}</link>
          <pubDate>Tue, 1 Jan 2031 10:00:00 GMT</pubDate>
        </item></channel></rss>"""

    async with async_session() as db:
        service = ConnectorService(
            db,
            tenant_id=ids["tenant_b"],
            fetcher=_ParserFetcher(),
        )
        _ParserFetcher.response = _ParserResponse(
            rss_body(old_link), "application/rss+xml"
        )
        first = await service.sync_connector(ids["connector_b"])
        original = (
            await db.execute(
                select(Event).where(Event.connector_id == ids["connector_b"])
            )
        ).scalar_one()
        original_id = original.id

        _ParserFetcher.response = _ParserResponse(
            rss_body(new_link), "application/rss+xml"
        )
        second = await service.sync_connector(ids["connector_b"])
        persisted = (
            (
                await db.execute(
                    select(Event).where(Event.connector_id == ids["connector_b"])
                )
            )
            .scalars()
            .all()
        )

        assert first == {"synced": 1, "total_parsed": 1}
        assert second == {"synced": 0, "total_parsed": 1}
        assert [(event.id, event.source_url.split("#", 1)[0]) for event in persisted] == [
            (original_id, new_link)
        ]


@pytest.mark.asyncio
async def test_ics_uid_migrates_one_event_when_its_permalink_changes(
    admin_security_rows,
):
    ids = admin_security_rows
    old_link = "https://example.com/events/old-ics-link"
    new_link = "https://example.com/events/new-ics-link"

    def ics_body(link: str) -> str:
        return f"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:permalink-stable-ics-uid
DTSTART:20310101T100000
SUMMARY:ICS permalink event
URL:{link}
END:VEVENT
END:VCALENDAR
"""

    async with async_session() as db:
        connector = await db.get(EventConnector, ids["connector_b"])
        connector.type = ConnectorType.ICS
        connector.url = "https://93.184.216.34/calendar.ics"
        await db.flush()
        service = ConnectorService(
            db,
            tenant_id=ids["tenant_b"],
            fetcher=_ParserFetcher(),
        )
        _ParserFetcher.response = _ParserResponse(ics_body(old_link), "text/calendar")
        first = await service.sync_connector(ids["connector_b"])
        original = (
            await db.execute(
                select(Event).where(Event.connector_id == ids["connector_b"])
            )
        ).scalar_one()
        original_id = original.id

        _ParserFetcher.response = _ParserResponse(ics_body(new_link), "text/calendar")
        second = await service.sync_connector(ids["connector_b"])
        persisted = (
            (
                await db.execute(
                    select(Event).where(Event.connector_id == ids["connector_b"])
                )
            )
            .scalars()
            .all()
        )

        assert first == {"synced": 1, "total_parsed": 1}
        assert second == {"synced": 0, "total_parsed": 1}
        assert [(event.id, event.source_url.split("#", 1)[0]) for event in persisted] == [
            (original_id, new_link)
        ]


@pytest.mark.asyncio
async def test_undated_rss_migrates_one_unmatched_same_base_hash_in_place(
    admin_security_rows, monkeypatch
):
    ids = admin_security_rows
    event_id = uuid4()
    base = "https://example.com/events/undated-legacy"
    old_key = f"{base}#event-11111111111111111111111111111111"
    _ParserFetcher.response = _ParserResponse(
        f"""<rss><channel><item>
          <title>Undated legacy notice</title><link>{base}</link>
          <description>Stable content</description>
        </item></channel></rss>""",
        "application/rss+xml",
    )

    class FixedDatetime(datetime):
        @classmethod
        def utcnow(cls):
            return datetime(2031, 1, 5, 12, 0)

    monkeypatch.setattr(connector_service, "datetime", FixedDatetime)
    async with async_session() as db:
        db.add(
            Event(
                id=event_id,
                tenant_id=ids["tenant_b"],
                title="Undated legacy notice",
                start_date=datetime(2031, 1, 4, 12, 0),
                category=EventCategory.COMMUNITY,
                status=EventStatus.ACTIVE,
                source="Tenant B connector",
                source_url=old_key,
                connector_id=ids["connector_b"],
            )
        )
        await db.flush()

        result = await ConnectorService(
            db,
            tenant_id=ids["tenant_b"],
            fetcher=_ParserFetcher(),
        ).sync_connector(ids["connector_b"])
        persisted = (
            (
                await db.execute(
                    select(Event).where(Event.connector_id == ids["connector_b"])
                )
            )
            .scalars()
            .all()
        )

        assert result == {"synced": 0, "total_parsed": 1}
        assert len(persisted) == 1
        assert persisted[0].id == event_id
        assert persisted[0].source_url.startswith(f"{base}#event-")
        assert persisted[0].source_url != old_key


@pytest.mark.asyncio
async def test_sync_rejects_two_unmatched_hashes_without_partial_event_changes(
    admin_security_rows, monkeypatch
):
    ids = admin_security_rows
    base = "https://example.com/events/ambiguous"
    event_ids = [uuid4(), uuid4()]
    current_key = f"{base}#event-00000000000000000000000000000003"

    async def parsed_event(self, connector):
        return [
            {
                "title": "Ambiguous import",
                "start_date": datetime(2031, 1, 1, 10, 0),
                "source_url": current_key,
                "status": "active",
            }
        ]

    monkeypatch.setattr(ConnectorService, "_parse_source", parsed_event)
    async with async_session() as db:
        db.add_all(
            [
                Event(
                    id=event_id,
                    tenant_id=ids["tenant_b"],
                    title=f"Old event {index}",
                    start_date=datetime(2031, 1, index, 10, 0),
                    category=EventCategory.COMMUNITY,
                    status=EventStatus.ACTIVE,
                    source="Tenant B connector",
                    source_url=f"{base}#event-{index:032x}",
                    connector_id=ids["connector_b"],
                )
                for index, event_id in enumerate(event_ids, start=1)
            ]
        )
        await db.flush()

        with pytest.raises(ValueError, match="ambiguous"):
            await ConnectorService(db, tenant_id=ids["tenant_b"]).sync_connector(
                ids["connector_b"]
            )
        persisted = (
            (
                await db.execute(
                    select(Event).where(Event.connector_id == ids["connector_b"])
                )
            )
            .scalars()
            .all()
        )

        assert {event.id for event in persisted} == set(event_ids)
        assert {event.source_url for event in persisted} == {
            f"{base}#event-{index:032x}" for index in (1, 2)
        }


@pytest.mark.asyncio
async def test_sync_rejects_current_and_predecessor_key_conflict(
    admin_security_rows, monkeypatch
):
    ids = admin_security_rows
    base = "https://example.com/events/conflict"
    current_key = f"{base}#event-00000000000000000000000000000001"
    predecessor_source_key = f"{base}#event-00000000000000000000000000000002"
    predecessor_key = f"{base}#event-a18bd49f7e6887ed528753a42acb835d"

    async def parsed_event(self, connector):
        return [
            {
                "title": "Conflicting import",
                "start_date": datetime(2031, 1, 1, 10, 0),
                "source_url": current_key,
                "_predecessor_source_url": predecessor_source_key,
                "status": "active",
            }
        ]

    monkeypatch.setattr(ConnectorService, "_parse_source", parsed_event)
    async with async_session() as db:
        db.add_all(
            [
                Event(
                    id=uuid4(),
                    tenant_id=ids["tenant_b"],
                    title="Existing import",
                    start_date=datetime(2031, 1, 1, 10, 0),
                    category=EventCategory.COMMUNITY,
                    status=EventStatus.ACTIVE,
                    source="Tenant B connector",
                    source_url=source_url,
                    connector_id=ids["connector_b"],
                )
                for source_url in (current_key, predecessor_key)
            ]
        )
        await db.flush()

        with pytest.raises(ValueError, match="conflict"):
            await ConnectorService(db, tenant_id=ids["tenant_b"]).sync_connector(
                ids["connector_b"]
            )

        assert (
            len(
                (
                    (
                        await db.execute(
                            select(Event).where(
                                Event.connector_id == ids["connector_b"]
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
            )
            == 2
        )


@pytest.mark.asyncio
async def test_sync_rejects_current_and_unmatched_same_base_hash_conflict(
    admin_security_rows, monkeypatch
):
    ids = admin_security_rows
    base = "https://example.com/events/current-conflict"
    current_key = f"{base}#event-00000000000000000000000000000001"
    unmatched_key = f"{base}#event-00000000000000000000000000000002"

    async def parsed_event(self, connector):
        return [
            {
                "title": "Current import",
                "start_date": datetime(2031, 1, 1, 10, 0),
                "source_url": current_key,
                "status": "active",
            }
        ]

    monkeypatch.setattr(ConnectorService, "_parse_source", parsed_event)
    async with async_session() as db:
        db.add_all(
            [
                Event(
                    id=uuid4(),
                    tenant_id=ids["tenant_b"],
                    title="Existing import",
                    start_date=datetime(2031, 1, 1, 10, 0),
                    category=EventCategory.COMMUNITY,
                    status=EventStatus.ACTIVE,
                    source="Tenant B connector",
                    source_url=source_url,
                    connector_id=ids["connector_b"],
                )
                for source_url in (current_key, unmatched_key)
            ]
        )
        await db.flush()

        with pytest.raises(ValueError, match="conflict"):
            await ConnectorService(db, tenant_id=ids["tenant_b"]).sync_connector(
                ids["connector_b"]
            )

        persisted = (
            (
                await db.execute(
                    select(Event).where(Event.connector_id == ids["connector_b"])
                )
            )
            .scalars()
            .all()
        )
        assert {event.source_url for event in persisted} == {
            current_key,
            unmatched_key,
        }


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

    assert "aiohttp>=3.14.0,<3.15.0" in pyproject["project"]["dependencies"]
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


def test_source_url_keys_namespace_distinct_identities_without_changing_destination():
    candidate = "https://example.com/events/shared"

    first = connector_service.deterministic_source_url(
        "https://example.com/feed.xml", candidate, "entry-one"
    )
    second = connector_service.deterministic_source_url(
        "https://example.com/feed.xml", candidate, "entry-two"
    )

    assert first != second
    assert first.split("#", 1)[0] == second.split("#", 1)[0] == candidate
    assert len(first) <= 500
    assert len(second) <= 500


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
async def test_rss_intrinsic_ids_survive_shared_link_insertion_and_reorder():
    feed_url = "https://example.com/events.xml"
    shared_link = "https://example.com/events/shared"
    _ParserFetcher.response = _ParserResponse(
        f"""<rss><channel>
          <item><guid>first-id</guid><title>First title</title><link>{shared_link}</link>
            <pubDate>Tue, 1 Jan 2031 10:00:00 GMT</pubDate></item>
          <item><guid>second-id</guid><title>Second title</title><link>{shared_link}</link>
            <pubDate>Tue, 1 Jan 2031 11:00:00 GMT</pubDate></item>
        </channel></rss>""",
        "application/rss+xml",
    )
    parser = ConnectorService(None, fetcher=_ParserFetcher())
    before = await parser._parse_rss(feed_url)

    _ParserFetcher.response = _ParserResponse(
        f"""<rss><channel>
          <item><guid>inserted-id</guid><title>Inserted title</title><link>{shared_link}</link>
            <pubDate>Tue, 1 Jan 2031 09:00:00 GMT</pubDate></item>
          <item><guid>second-id</guid><title>Second title</title><link>{shared_link}</link>
            <pubDate>Tue, 1 Jan 2031 11:00:00 GMT</pubDate></item>
          <item><guid>first-id</guid><title>First title</title><link>{shared_link}</link>
            <pubDate>Tue, 1 Jan 2031 10:00:00 GMT</pubDate></item>
        </channel></rss>""",
        "application/rss+xml",
    )
    after = await parser._parse_rss(feed_url)

    before_keys = {event["title"]: event["source_url"] for event in before}
    after_keys = {event["title"]: event["source_url"] for event in after}
    assert after_keys["First title"] == before_keys["First title"]
    assert after_keys["Second title"] == before_keys["Second title"]


@pytest.mark.asyncio
async def test_rss_idless_shared_link_fingerprints_survive_insertion_and_reorder():
    feed_url = "https://example.com/events.xml"
    shared_link = "https://example.com/events/shared"
    _ParserFetcher.response = _ParserResponse(
        f"""<rss><channel>
          <item><title>First title</title><link>{shared_link}</link>
            <pubDate>Tue, 1 Jan 2031 10:00:00 GMT</pubDate></item>
          <item><title>Second title</title><link>{shared_link}</link>
            <pubDate>Tue, 1 Jan 2031 11:00:00 GMT</pubDate></item>
        </channel></rss>""",
        "application/rss+xml",
    )
    parser = ConnectorService(None, fetcher=_ParserFetcher())
    before = await parser._parse_rss(feed_url)

    _ParserFetcher.response = _ParserResponse(
        f"""<rss><channel>
          <item><title>Inserted title</title><link>{shared_link}</link>
            <pubDate>Tue, 1 Jan 2031 09:00:00 GMT</pubDate></item>
          <item><title>Second title</title><link>{shared_link}</link>
            <pubDate>Tue, 1 Jan 2031 11:00:00 GMT</pubDate></item>
          <item><title>First title</title><link>{shared_link}</link>
            <pubDate>Tue, 1 Jan 2031 10:00:00 GMT</pubDate></item>
        </channel></rss>""",
        "application/rss+xml",
    )
    after = await parser._parse_rss(feed_url)

    before_keys = {event["title"]: event["source_url"] for event in before}
    after_keys = {event["title"]: event["source_url"] for event in after}
    assert after_keys["First title"] == before_keys["First title"]
    assert after_keys["Second title"] == before_keys["Second title"]


@pytest.mark.asyncio
async def test_html_shared_link_fingerprints_survive_insertion_and_reorder():
    page_url = "https://example.com/events"
    shared_link = "https://example.com/events/shared"
    _ParserFetcher.response = _ParserResponse(
        f"""<html><body>
          <article><h2>First title</h2>
            <time datetime="2031-01-01T10:00:00">January 1</time>
            <a href="{shared_link}">Details</a></article>
          <article><h2>Second title</h2>
            <time datetime="2031-01-01T11:00:00">January 1</time>
            <a href="{shared_link}">Details</a></article>
        </body></html>""",
        "text/html",
    )
    parser = ConnectorService(None, fetcher=_ParserFetcher())
    before = await parser._parse_html(page_url, {})

    _ParserFetcher.response = _ParserResponse(
        f"""<html><body>
          <article><h2>Inserted title</h2>
            <time datetime="2031-01-01T09:00:00">January 1</time>
            <a href="{shared_link}">Details</a></article>
          <article><h2>Second title</h2>
            <time datetime="2031-01-01T11:00:00">January 1</time>
            <a href="{shared_link}">Details</a></article>
          <article><h2>First title</h2>
            <time datetime="2031-01-01T10:00:00">January 1</time>
            <a href="{shared_link}">Details</a></article>
        </body></html>""",
        "text/html",
    )
    after = await parser._parse_html(page_url, {})

    before_keys = {event["title"]: event["source_url"] for event in before}
    after_keys = {event["title"]: event["source_url"] for event in after}
    assert after_keys["First title"] == before_keys["First title"]
    assert after_keys["Second title"] == before_keys["Second title"]


@pytest.mark.asyncio
async def test_ics_intrinsic_uids_survive_shared_link_insertion_and_reorder():
    feed_url = "https://example.com/calendar.ics"
    shared_link = "https://example.com/events/shared"
    _ParserFetcher.response = _ParserResponse(
        f"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:first-uid
DTSTART:20310101T100000
SUMMARY:First title
LOCATION:First location
URL:{shared_link}
END:VEVENT
BEGIN:VEVENT
UID:second-uid
DTSTART:20310101T110000
SUMMARY:Second title
LOCATION:Second location
URL:{shared_link}
END:VEVENT
END:VCALENDAR
""",
        "text/calendar",
    )
    parser = ConnectorService(None, fetcher=_ParserFetcher())
    before = await parser._parse_ics(feed_url)

    _ParserFetcher.response = _ParserResponse(
        f"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:inserted-uid
DTSTART:20310101T090000
SUMMARY:Inserted title
LOCATION:Inserted location
URL:{shared_link}
END:VEVENT
BEGIN:VEVENT
UID:second-uid
DTSTART:20310101T110000
SUMMARY:Second title
LOCATION:Second location
URL:{shared_link}
END:VEVENT
BEGIN:VEVENT
UID:first-uid
DTSTART:20310101T100000
SUMMARY:First title
LOCATION:First location
URL:{shared_link}
END:VEVENT
END:VCALENDAR
""",
        "text/calendar",
    )
    after = await parser._parse_ics(feed_url)

    before_keys = {event["title"]: event["source_url"] for event in before}
    after_keys = {event["title"]: event["source_url"] for event in after}
    assert after_keys["First title"] == before_keys["First title"]
    assert after_keys["Second title"] == before_keys["Second title"]


@pytest.mark.asyncio
async def test_ics_uidless_shared_link_fingerprints_survive_insertion_and_reorder():
    feed_url = "https://example.com/calendar.ics"
    shared_link = "https://example.com/events/shared"
    first_body = f"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20310101T100000
SUMMARY:First title
URL:{shared_link}
END:VEVENT
BEGIN:VEVENT
DTSTART:20310101T110000
SUMMARY:Second title
URL:{shared_link}
END:VEVENT
END:VCALENDAR
"""
    _ParserFetcher.response = _ParserResponse(first_body, "text/calendar")
    parser = ConnectorService(None, fetcher=_ParserFetcher())
    before = await parser._parse_ics(feed_url)

    _ParserFetcher.response = _ParserResponse(
        f"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20310101T090000
SUMMARY:Inserted title
URL:{shared_link}
END:VEVENT
BEGIN:VEVENT
DTSTART:20310101T110000
SUMMARY:Second title
URL:{shared_link}
END:VEVENT
BEGIN:VEVENT
DTSTART:20310101T100000
SUMMARY:First title
URL:{shared_link}
END:VEVENT
END:VCALENDAR
""",
        "text/calendar",
    )
    after = await parser._parse_ics(feed_url)

    before_keys = {event["title"]: event["source_url"] for event in before}
    after_keys = {event["title"]: event["source_url"] for event in after}
    assert after_keys["First title"] == before_keys["First title"]
    assert after_keys["Second title"] == before_keys["Second title"]


@pytest.mark.asyncio
async def test_identical_uidless_ics_entries_with_one_link_fail_safely():
    shared_link = "https://example.com/events/shared"
    entry = f"""BEGIN:VEVENT
DTSTART:20310101T100000
SUMMARY:Indistinguishable title
URL:{shared_link}
END:VEVENT
"""
    _ParserFetcher.response = _ParserResponse(
        f"BEGIN:VCALENDAR\nVERSION:2.0\n{entry}{entry}END:VCALENDAR\n",
        "text/calendar",
    )

    with pytest.raises(ValueError, match="indistinguishable"):
        await ConnectorService(None, fetcher=_ParserFetcher())._parse_ics(
            "https://example.com/calendar.ics"
        )


@pytest.mark.asyncio
async def test_identical_idless_rss_entries_with_one_link_fail_safely():
    shared_link = "https://example.com/events/shared"
    entry = f"""<item><title>Indistinguishable title</title>
      <link>{shared_link}</link>
      <pubDate>Tue, 1 Jan 2031 10:00:00 GMT</pubDate></item>"""
    _ParserFetcher.response = _ParserResponse(
        f"<rss><channel>{entry}{entry}</channel></rss>",
        "application/rss+xml",
    )

    with pytest.raises(ValueError, match="indistinguishable"):
        await ConnectorService(None, fetcher=_ParserFetcher())._parse_rss(
            "https://example.com/events.xml"
        )


@pytest.mark.asyncio
async def test_rss_fallback_without_link_or_id_excludes_synthesized_time(monkeypatch):
    feed_url = "https://example.com/events.xml"
    _ParserFetcher.response = _ParserResponse(
        """<rss><channel><item>
          <title>Undated notice without a link</title>
          <description>Stable source content</description>
        </item></channel></rss>""",
        "application/rss+xml",
    )

    class AdvancingDatetime(datetime):
        values = iter(
            [
                datetime(2031, 1, 1, 10, 0),
                datetime(2031, 1, 2, 10, 0),
            ]
        )

        @classmethod
        def utcnow(cls):
            return next(cls.values)

    monkeypatch.setattr(connector_service, "datetime", AdvancingDatetime)
    parser = ConnectorService(None, fetcher=_ParserFetcher())

    first = await parser._parse_rss(feed_url)
    second = await parser._parse_rss(feed_url)

    assert first[0]["start_date"] != second[0]["start_date"]
    assert first[0]["source_url"] == second[0]["source_url"]
    assert first[0]["source_url"].startswith(feed_url + "#event-")


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


def _public_url_with_length(length: int) -> str:
    prefix = "https://example.com/"
    return prefix + ("a" * (length - len(prefix)))


@pytest.mark.asyncio
@pytest.mark.parametrize("candidate_length", [462, 500])
async def test_ics_identity_keys_never_exceed_the_source_url_column(candidate_length):
    feed_url = "https://93.184.216.34/calendar.ics"
    candidate = _public_url_with_length(candidate_length)
    _ParserFetcher.response = _ParserResponse(
        f"""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:bounded-entry-{candidate_length}
DTSTART:20310101T100000
SUMMARY:Bounded linked event
URL:{candidate}
END:VEVENT
END:VCALENDAR
""",
        "text/calendar",
    )

    event = (
        await ConnectorService(None, fetcher=_ParserFetcher())._parse_ics(feed_url)
    )[0]

    assert len(event["source_url"]) <= 500
    assert event["source_url"].startswith("https://example.com/")
    assert "#event-" in event["source_url"]


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


@pytest.mark.asyncio
async def test_undated_rss_without_id_keeps_one_stable_event_across_resync(
    admin_security_rows, monkeypatch
):
    ids = admin_security_rows
    _ParserFetcher.response = _ParserResponse(
        """<rss><channel><item>
          <title>Undated community notice</title>
          <link>https://example.com/events/undated</link>
          <description>Stable source content</description>
        </item></channel></rss>""",
        "application/rss+xml",
    )

    class AdvancingDatetime(datetime):
        values = iter(
            [
                datetime(2031, 1, 1, 10, 0),
                datetime(2031, 1, 1, 10, 1),
                datetime(2031, 1, 2, 10, 0),
                datetime(2031, 1, 2, 10, 1),
            ]
        )

        @classmethod
        def utcnow(cls):
            return next(cls.values)

    monkeypatch.setattr(connector_service, "datetime", AdvancingDatetime)
    async with async_session() as db:
        service = ConnectorService(
            db,
            tenant_id=ids["tenant_b"],
            fetcher=_ParserFetcher(),
        )

        first = await service.sync_connector(ids["connector_b"])
        second = await service.sync_connector(ids["connector_b"])
        persisted = (
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

        assert first == {"synced": 1, "total_parsed": 1}
        assert second == {"synced": 0, "total_parsed": 1}
        assert len(persisted) == 1
        assert persisted[0].source_url.startswith(
            "https://example.com/events/undated#event-"
        )


@pytest.mark.asyncio
async def test_rss_entries_sharing_a_safe_link_persist_once_each_across_resync(
    admin_security_rows, monkeypatch
):
    ids = admin_security_rows
    feed_url = "https://example.com/shared-link-feed.xml"
    shared_link = "https://example.com/events/shared"
    _ParserFetcher.response = _ParserResponse(
        f"""<rss><channel>
          <item><guid>rss-one</guid><title>RSS event one</title>
            <link>{shared_link}</link>
            <pubDate>Tue, 1 Jan 2031 10:00:00 GMT</pubDate></item>
          <item><guid>rss-two</guid><title>RSS event two</title>
            <link>{shared_link}</link>
            <pubDate>Tue, 1 Jan 2031 11:00:00 GMT</pubDate></item>
        </channel></rss>""",
        "application/rss+xml",
    )
    parser = ConnectorService(None, fetcher=_ParserFetcher())
    parsed = await parser._parse_rss(feed_url)
    parsed_again = await parser._parse_rss(feed_url)

    assert [event["source_url"] for event in parsed] == [
        event["source_url"] for event in parsed_again
    ]
    assert len({event["source_url"] for event in parsed}) == 2
    assert {event["source_url"].split("#", 1)[0] for event in parsed} == {shared_link}

    connector_id = uuid4()
    async with async_session() as db:
        db.add(
            EventConnector(
                id=connector_id,
                tenant_id=ids["tenant_b"],
                name="Shared-link RSS connector",
                type=ConnectorType.RSS,
                url=feed_url,
                category=EventCategory.COMMUNITY,
                is_active=True,
            )
        )
        await db.flush()
        service = ConnectorService(db, tenant_id=ids["tenant_b"])

        async def fresh_parse(_connector):
            return [dict(event) for event in parsed]

        monkeypatch.setattr(service, "_parse_source", fresh_parse)
        first_sync = await service.sync_connector(connector_id)
        second_sync = await service.sync_connector(connector_id)
        persisted = (
            (await db.execute(select(Event).where(Event.connector_id == connector_id)))
            .scalars()
            .all()
        )

        assert first_sync == {"synced": 2, "total_parsed": 2}
        assert second_sync == {"synced": 0, "total_parsed": 2}
        assert len(persisted) == 2


@pytest.mark.asyncio
async def test_html_entries_sharing_a_safe_link_persist_once_each_across_resync(
    admin_security_rows, monkeypatch
):
    ids = admin_security_rows
    page_url = "https://example.com/shared-link-events"
    shared_link = "https://example.com/events/shared"
    _ParserFetcher.response = _ParserResponse(
        f"""<html><body>
          <article><h2>HTML event one</h2>
            <time datetime="2031-01-01T10:00:00">January 1</time>
            <a href="{shared_link}">Details</a></article>
          <article><h2>HTML event two</h2>
            <time datetime="2031-01-01T11:00:00">January 1</time>
            <a href="{shared_link}">Details</a></article>
        </body></html>""",
        "text/html",
    )
    parser = ConnectorService(None, fetcher=_ParserFetcher())
    parsed = await parser._parse_html(page_url, {})
    parsed_again = await parser._parse_html(page_url, {})

    assert [event["source_url"] for event in parsed] == [
        event["source_url"] for event in parsed_again
    ]
    assert len({event["source_url"] for event in parsed}) == 2
    assert {event["source_url"].split("#", 1)[0] for event in parsed} == {shared_link}

    connector_id = uuid4()
    async with async_session() as db:
        db.add(
            EventConnector(
                id=connector_id,
                tenant_id=ids["tenant_b"],
                name="Shared-link HTML connector",
                type=ConnectorType.HTML,
                url=page_url,
                category=EventCategory.COMMUNITY,
                is_active=True,
                config={},
            )
        )
        await db.flush()
        service = ConnectorService(db, tenant_id=ids["tenant_b"])

        async def fresh_parse(_connector):
            return [dict(event) for event in parsed]

        monkeypatch.setattr(service, "_parse_source", fresh_parse)
        first_sync = await service.sync_connector(connector_id)
        second_sync = await service.sync_connector(connector_id)
        persisted = (
            (await db.execute(select(Event).where(Event.connector_id == connector_id)))
            .scalars()
            .all()
        )

        assert first_sync == {"synced": 2, "total_parsed": 2}
        assert second_sync == {"synced": 0, "total_parsed": 2}
        assert len(persisted) == 2


def _connector_payload(
    connector_type: ConnectorType,
    event_count: int,
) -> tuple[str, str]:
    if connector_type == ConnectorType.RSS:
        items = "".join(
            f"""<item><guid>rss-{index}</guid><title>RSS event {index}</title>
              <link>https://example.com/events/rss-{index}</link>
              <pubDate>Tue, 1 Jan 2031 10:00:00 GMT</pubDate></item>"""
            for index in range(event_count)
        )
        return f"<rss><channel>{items}</channel></rss>", "application/rss+xml"

    if connector_type == ConnectorType.ICS:
        events = "\r\n".join(
            "\r\n".join(
                (
                    "BEGIN:VEVENT",
                    f"UID:ics-{index}",
                    f"SUMMARY:ICS event {index}",
                    "DTSTART:20310101T100000",
                    f"URL:https://example.com/events/ics-{index}",
                    "END:VEVENT",
                )
            )
            for index in range(event_count)
        )
        return (
            f"BEGIN:VCALENDAR\r\nVERSION:2.0\r\n{events}\r\nEND:VCALENDAR\r\n",
            "text/calendar",
        )

    articles = "".join(
        f"""<article><h2>HTML event {index}</h2>
          <time datetime="2031-01-01T10:00:00">January 1</time>
          <a href="https://example.com/events/html-{index}">Details</a></article>"""
        for index in range(event_count)
    )
    return f"<html><body>{articles}</body></html>", "text/html"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "connector_type",
    [ConnectorType.RSS, ConnectorType.ICS, ConnectorType.HTML],
)
async def test_connector_accepts_exactly_500_parsed_events(connector_type):
    response_body, content_type = _connector_payload(connector_type, 500)
    _ParserFetcher.response = _ParserResponse(response_body, content_type)

    result = await ConnectorService(
        None,
        fetcher=_ParserFetcher(),
    ).test_connector(
        connector_type.value,
        "https://example.com/events-feed",
        {},
    )

    assert result["count"] == 500


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "connector_type",
    [ConnectorType.RSS, ConnectorType.ICS, ConnectorType.HTML],
)
async def test_connector_rejects_501_parsed_events(connector_type):
    response_body, content_type = _connector_payload(connector_type, 501)
    _ParserFetcher.response = _ParserResponse(response_body, content_type)

    with pytest.raises(ValueError, match="more than 500 events"):
        await ConnectorService(
            None,
            fetcher=_ParserFetcher(),
        ).test_connector(
            connector_type.value,
            "https://example.com/events-feed",
            {},
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "connector_type",
    [ConnectorType.RSS, ConnectorType.ICS, ConnectorType.HTML],
)
async def test_sync_rejects_501_parsed_events_before_event_mutation(
    admin_security_rows,
    connector_type,
):
    ids = admin_security_rows
    response_body, content_type = _connector_payload(connector_type, 501)
    _ParserFetcher.response = _ParserResponse(response_body, content_type)

    async with async_session() as db:
        connector = await db.get(EventConnector, ids["connector_b"])
        connector.type = connector_type
        connector.url = "https://example.com/events-feed"
        connector.config = {}
        await db.flush()

        service = ConnectorService(
            db,
            tenant_id=ids["tenant_b"],
            fetcher=_ParserFetcher(),
        )
        with pytest.raises(ValueError, match="more than 500 events"):
            await service.sync_connector(ids["connector_b"])

        persisted = (
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
        assert persisted == []


@pytest.mark.asyncio
async def test_sync_does_not_read_or_rewrite_another_tenants_legacy_event(
    admin_security_rows,
    monkeypatch,
):
    ids = admin_security_rows
    foreign_event_id = uuid4()
    legacy_url = "https://example.com/events/cross-tenant-legacy"
    stable_key = f"{legacy_url}#event-6c2783d79d2511e2c4cebd386e22f12a"

    async def parsed_event(self, connector):
        return [
            {
                "title": "Tenant B imported event",
                "start_date": datetime(2031, 1, 1, 10, 0),
                "source_url": stable_key,
                "status": "active",
            }
        ]

    monkeypatch.setattr(ConnectorService, "_parse_source", parsed_event)
    async with async_session() as db:
        db.add(
            Event(
                id=foreign_event_id,
                tenant_id=ids["tenant_a"],
                title="Tenant A mismatched legacy event",
                start_date=datetime(2031, 1, 1, 10, 0),
                category=EventCategory.COMMUNITY,
                status=EventStatus.ACTIVE,
                source="Tenant B connector",
                source_url=legacy_url,
                connector_id=ids["connector_b"],
            )
        )
        await db.flush()

        result = await ConnectorService(
            db,
            tenant_id=ids["tenant_b"],
        ).sync_connector(ids["connector_b"])
        foreign_event = await db.get(Event, foreign_event_id)
        tenant_events = (
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

        assert result == {"synced": 1, "total_parsed": 1}
        assert foreign_event.source_url == legacy_url
        assert [(event.title, event.source_url) for event in tenant_events] == [
            ("Tenant B imported event", stable_key)
        ]
