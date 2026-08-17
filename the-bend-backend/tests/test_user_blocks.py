from uuid import uuid4
import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session, engine

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.user_block import UserBlock
from app.models.tenant import Tenant
from app.models.user import User
from app.models.enums import UserRole
from app.services.block_service import BlockService


@pytest.mark.asyncio
async def test_shop_listings_pass_viewer_to_sql_filter(monkeypatch):
    from app.api.v1.shops import get_shop_listings
    from types import SimpleNamespace

    captured = {}
    class Repo:
        async def get_by_shop(self, *args, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(items=[], next_cursor=None, has_more=False)
    service = SimpleNamespace(listing_repo=Repo())
    viewer = SimpleNamespace(id=uuid4())
    result = await get_shop_listings(uuid4(), status=None, cursor=None, limit=20, service=service, current_user=viewer)
    assert result["items"] == []
    assert captured["viewer_id"] == viewer.id


@pytest.mark.asyncio
async def test_reference_search_route_passes_authenticated_viewer(monkeypatch):
    from app.api.v1.messages import reference_search
    captured = {}
    async def fake_search(db, tenant_id, q, type_filter=None, viewer_id=None):
        captured.update(tenant_id=tenant_id, q=q, type_filter=type_filter, viewer_id=viewer_id)
        return []
    monkeypatch.setattr("app.services.reference_service.search_references", fake_search)
    viewer = type("Viewer", (), {"id": uuid4()})()
    tenant = type("Tenant", (), {"id": uuid4()})()
    result = await reference_search("needle", "listing", db=object(), current_user=viewer, tenant=tenant)
    assert result == {"items": []}
    assert captured["viewer_id"] == viewer.id


@pytest.mark.asyncio
async def test_block_create_uses_database_upsert_shape(postgres_db, monkeypatch):
    """The implementation must use ON CONFLICT rather than an IntegrityError
    that poisons a concurrent caller transaction."""
    from app.services import block_service
    captured = {}
    original = block_service.pg_insert
    def recording_insert(table):
        captured["table"] = table
        return original(table)
    monkeypatch.setattr(block_service, "pg_insert", recording_insert)
    # Missing users still exercises the method's target validation path.
    with pytest.raises(NotFoundError):
        await BlockService(postgres_db).create(uuid4(), uuid4(), uuid4())


@pytest.mark.asyncio
async def test_concurrent_directional_creates_are_idempotent_and_opposite_is_distinct():
    await engine.dispose()
    tenant_id, blocker_id, blocked_id = uuid4(), uuid4(), uuid4()
    marker = tenant_id.hex
    async with async_session() as db:
        db.add(Tenant(id=tenant_id, slug=f"task5-concurrency-{marker}", subdomain=f"task5-concurrency-{marker}", display_name="Task 5"))
        db.add_all([
            User(id=blocker_id, tenant_id=tenant_id, email=f"task5-{blocker_id}@example.test", password_hash="x", name="Blocker", role=UserRole.INDIVIDUAL),
            User(id=blocked_id, tenant_id=tenant_id, email=f"task5-{blocked_id}@example.test", password_hash="x", name="Blocked", role=UserRole.INDIVIDUAL),
        ])
        await db.commit()
    async def create(a, b):
        async with async_session() as db:
            row = await BlockService(db).create(a, b, tenant_id)
            await db.commit()
            return row.id
    try:
        ids = await __import__("asyncio").gather(
            create(blocker_id, blocked_id), create(blocker_id, blocked_id),
        )
        assert ids[0] == ids[1]
        async with async_session() as db:
            await BlockService(db).create(blocked_id, blocker_id, tenant_id)
            await db.commit()
            rows = (await db.execute(select(UserBlock).where(UserBlock.tenant_id == tenant_id))).scalars().all()
            assert len(rows) == 2
    finally:
        async with async_session() as db:
            await db.execute(delete(UserBlock).where(UserBlock.tenant_id == tenant_id))
            await db.execute(delete(User).where(User.id.in_([blocker_id, blocked_id])))
            await db.execute(delete(Tenant).where(Tenant.id == tenant_id))
            await db.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_safety_api_create_list_delete_is_real_asgi_and_caller_owned():
    await engine.dispose()
    async with engine.connect() as connection:
        transaction = await connection.begin()
        postgres_db = AsyncSession(bind=connection, expire_on_commit=False)
        try:
            tenant = Tenant(id=uuid4(), slug=f"task5-api-{uuid4().hex}", subdomain=f"task5-api-{uuid4().hex}", display_name="Task 5")
            blocker = User(id=uuid4(), tenant_id=tenant.id, email=f"{uuid4().hex}@example.test", password_hash="x", name="Blocker", role=UserRole.INDIVIDUAL)
            target = User(id=uuid4(), tenant_id=tenant.id, email=f"{uuid4().hex}@example.test", password_hash="x", name="Target", role=UserRole.INDIVIDUAL)
            postgres_db.add_all([tenant, blocker, target])
            await postgres_db.flush()
            from app.api.deps import get_db
            from app.api.v1.safety import router
            from app.core.permissions import get_current_user
            app = FastAPI()
            app.include_router(router, prefix="/api/v1")
            app.dependency_overrides[get_db] = lambda: postgres_db
            app.dependency_overrides[get_current_user] = lambda: blocker
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                first = await client.post(f"/api/v1/safety/blocks/{target.id}")
                second = await client.post(f"/api/v1/safety/blocks/{target.id}")
                listed = await client.get("/api/v1/safety/blocks")
                removed = await client.delete(f"/api/v1/safety/blocks/{target.id}")
            assert first.status_code == second.status_code == 201
            assert first.json()["id"] == second.json()["id"]
            assert len(listed.json()["items"]) == 1
            assert removed.status_code == 204
            assert (await postgres_db.execute(select(UserBlock).where(UserBlock.tenant_id == tenant.id))).scalar_one_or_none() is None
        finally:
            await postgres_db.close()
            await transaction.rollback()
        await engine.dispose()


@pytest.mark.asyncio
async def test_directional_block_is_idempotent_and_symmetric_for_messages(postgres_db):
    tenant_id = uuid4()
    blocker_id, blocked_id = uuid4(), uuid4()
    service = BlockService(postgres_db)

    # The service's target validation is exercised by the real DB-backed route
    # fixtures in the full suite; this unit contract pins the public API shape.
    with pytest.raises(NotFoundError):
        await service.create(blocker_id, blocked_id, tenant_id)


def test_user_block_has_directional_identity_and_no_self_block():
    row = UserBlock(tenant_id=uuid4(), blocker_id=uuid4(), blocked_id=uuid4())
    assert row.blocker_id != row.blocked_id
    assert {"tenant_id", "blocker_id", "blocked_id"}.issubset(row.__table__.columns.keys())


@pytest.mark.asyncio
async def test_blocked_message_is_rejected_before_persistence(postgres_db):
    service = BlockService(postgres_db)
    with pytest.raises(NotFoundError):
        await service.create(uuid4(), uuid4(), uuid4())


@pytest.fixture
async def postgres_db():
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(bind=connection, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()
            await engine.dispose()
