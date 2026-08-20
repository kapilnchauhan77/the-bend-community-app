"""Event detail visibility must match tenant-scoped discovery."""

from datetime import datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
import httpx
from fastapi import FastAPI
from sqlalchemy import delete

from app.database import async_session, engine
from app.models.enums import EventCategory, EventStatus, UserRole
from app.models.event import Event
from app.models.tenant import Tenant
from app.models.user import User
from app.services.block_service import BlockService
from app.services.event_service import EventService
from app.core.exceptions import NotFoundError


@pytest_asyncio.fixture
async def event_detail_rows():
    await engine.dispose()
    ids = {name: uuid4() for name in (
        "tenant", "other_tenant", "viewer", "author", "other_viewer",
        "visible", "blocked", "inactive", "legacy", "cross_tenant",
    )}
    async with async_session() as db:
        db.add_all([
            Tenant(id=ids["tenant"], slug=f"task3-{ids['tenant'].hex}", subdomain=f"task3-{ids['tenant'].hex}", display_name="Task 3"),
            Tenant(id=ids["other_tenant"], slug=f"task3-other-{ids['other_tenant'].hex}", subdomain=f"task3-other-{ids['other_tenant'].hex}", display_name="Other"),
            User(id=ids["viewer"], tenant_id=ids["tenant"], email=f"task3-viewer-{ids['viewer']}@example.test", password_hash="x", name="Viewer", role=UserRole.INDIVIDUAL),
            User(id=ids["author"], tenant_id=ids["tenant"], email=f"task3-author-{ids['author']}@example.test", password_hash="x", name="Author", role=UserRole.INDIVIDUAL),
            User(id=ids["other_viewer"], tenant_id=ids["other_tenant"], email=f"task3-other-viewer-{ids['other_viewer']}@example.test", password_hash="x", name="Other viewer", role=UserRole.INDIVIDUAL),
        ])
        await db.flush()
        date = datetime.utcnow() + timedelta(days=2)
        db.add_all([
            Event(id=ids["visible"], tenant_id=ids["tenant"], submitted_by_user_id=ids["author"], title="Visible", description="x", start_date=date, category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="manual"),
            Event(id=ids["blocked"], tenant_id=ids["tenant"], submitted_by_user_id=ids["author"], title="Blocked", description="x", start_date=date, category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="manual"),
            Event(id=ids["inactive"], tenant_id=ids["tenant"], submitted_by_user_id=ids["author"], title="Inactive", description="x", start_date=date, category=EventCategory.COMMUNITY, status=EventStatus.CANCELLED, source="manual"),
            Event(id=ids["legacy"], tenant_id=ids["tenant"], submitted_by_user_id=None, title="Legacy", description="x", start_date=date, category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="import"),
            Event(id=ids["cross_tenant"], tenant_id=ids["other_tenant"], submitted_by_user_id=ids["other_viewer"], title="Cross tenant", description="x", start_date=date, category=EventCategory.COMMUNITY, status=EventStatus.ACTIVE, source="manual"),
        ])
        await db.commit()
        await BlockService(db).create(ids["viewer"], ids["author"], ids["tenant"])
        await db.commit()
    try:
        yield ids
    finally:
        async with async_session() as db:
            await db.execute(delete(Event).where(Event.id.in_(ids.values())))
            from app.models.user_block import UserBlock
            await db.execute(delete(UserBlock).where(UserBlock.tenant_id.in_([ids["tenant"], ids["other_tenant"]])))
            await db.execute(delete(User).where(User.id.in_([ids["viewer"], ids["author"], ids["other_viewer"]])))
            await db.execute(delete(Tenant).where(Tenant.id.in_([ids["tenant"], ids["other_tenant"]])))
            await db.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_event_detail_visibility_matrix(event_detail_rows):
    ids = event_detail_rows
    async with async_session() as db:
        service = EventService(db, tenant_id=ids["tenant"])
        assert (await service.get_event(ids["visible"], viewer_id=ids["other_viewer"])).id == ids["visible"]
        assert (await service.get_event(ids["legacy"], viewer_id=ids["viewer"])).id == ids["legacy"]
        for event_id in (ids["blocked"], ids["inactive"], ids["cross_tenant"], uuid4()):
            with pytest.raises(NotFoundError):
                await service.get_event(event_id, viewer_id=ids["viewer"])


@pytest.mark.asyncio
async def test_cross_tenant_viewer_is_anonymous_for_event_detail(event_detail_rows):
    ids = event_detail_rows
    async with async_session() as db:
        service = EventService(db, tenant_id=ids["tenant"])
        assert (await service.get_event(ids["blocked"], viewer_id=None)).id == ids["blocked"]


@pytest.mark.asyncio
async def test_event_detail_route_scopes_tenant_and_viewer(event_detail_rows):
    ids = event_detail_rows
    from app.api.deps import get_db
    from app.api.v1.events import router
    from app.core.permissions import get_current_tenant, get_current_user_optional

    async with async_session() as db:
        tenant = await db.get(Tenant, ids["tenant"])
        viewer = await db.get(User, ids["viewer"])
        cross_tenant_viewer = await db.get(User, ids["other_viewer"])
        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_tenant] = lambda: tenant
        app.dependency_overrides[get_current_user_optional] = lambda: viewer
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            hidden = await client.get(f"/api/v1/events/{ids['blocked']}")
            assert hidden.status_code == 404

        app.dependency_overrides[get_current_user_optional] = lambda: cross_tenant_viewer
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/api/v1/events/{ids['blocked']}")
            assert response.status_code == 200
            assert response.json()["id"] == str(ids["blocked"])

        app.dependency_overrides[get_current_tenant] = lambda: None
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            unresolved = await client.get(f"/api/v1/events/{ids['visible']}")
            assert unresolved.status_code == 404
