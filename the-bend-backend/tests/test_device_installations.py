from __future__ import annotations

import asyncio
from types import SimpleNamespace
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_db
from app.api.v1.devices import router as devices_router
from app.api.v1.notifications import router as notifications_router
from app.core.exceptions import AppException
from app.core.permissions import get_current_user
from app.config import get_settings

# This module creates one transaction per test across pytest event loops.
# NullPool ensures no asyncpg connection is reused by a later loop.
test_engine = create_async_engine(get_settings().DATABASE_URL, poolclass=NullPool)
from app.models.device_installation import DeviceInstallation
from app.models.enums import UserRole
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.device import DeviceInstallationResponse
from app.services.device_service import DeviceService


@pytest.fixture
async def postgres_db():
    async with test_engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(bind=connection, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()


async def make_user(db: AsyncSession, tenant_id: UUID | None = None):
    tenant = Tenant(id=tenant_id or uuid4(), slug=f"test-{uuid4().hex}", subdomain=f"test-{uuid4().hex}", display_name="Test Tenant")
    db.add(tenant)
    await db.flush()
    user = User(id=uuid4(), email=f"{uuid4().hex}@example.com", password_hash="hash", name="Test User", role=UserRole.INDIVIDUAL, tenant_id=tenant.id)
    db.add(user)
    await db.flush()
    return tenant, user


async def make_committed_user():
    async with test_engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(bind=connection, expire_on_commit=False)
        try:
            tenant, user = await make_user(session)
            await transaction.commit()
            return SimpleNamespace(id=user.id, tenant_id=user.tenant_id), tenant.id
        finally:
            await session.close()


def make_app(db: AsyncSession, current_user: User | None = None) -> FastAPI:
    app = FastAPI()

    @app.exception_handler(AppException)
    async def app_exception_handler(_, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    app.include_router(devices_router, prefix="/api/v1")
    app.include_router(notifications_router, prefix="/api/v1")

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    if current_user is not None:
        async def override_user():
            return current_user
        app.dependency_overrides[get_current_user] = override_user
    return app


async def request(app: FastAPI, method: str, path: str, **kwargs):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, path, **kwargs)


@pytest.mark.asyncio
async def test_registration_http_returns_secret_without_provider_token(postgres_db):
    _, user = await make_user(postgres_db)
    response = await request(make_app(postgres_db, user), "PUT", f"/api/v1/devices/installations/{uuid4()}", json={"platform": "ios", "provider_token": "http-token", "app_version": "1", "build_number": "1"})
    assert response.status_code == 200
    assert response.json()["revocation_secret"]
    assert "provider_token" not in response.json()


@pytest.mark.asyncio
async def test_authenticated_installation_access_is_non_disclosing(postgres_db):
    tenant_a, user_a = await make_user(postgres_db)
    tenant_b, user_b = await make_user(postgres_db)
    installation = DeviceInstallation(user_id=user_a.id, tenant_id=tenant_a.id, platform="ios", provider_token="owned", revocation_secret_hash="invalid", app_version="1", build_number="1")
    postgres_db.add(installation)
    await postgres_db.flush()
    payload = {"platform": "ios", "provider_token": "new", "app_version": "2", "build_number": "2"}
    other_user = User(id=uuid4(), email=f"{uuid4().hex}@example.com", password_hash="hash", name="Other", role=UserRole.INDIVIDUAL, tenant_id=tenant_a.id)
    for user in (user_b, other_user):
        response = await request(make_app(postgres_db, user), "PUT", f"/api/v1/devices/installations/{installation.id}", json=payload)
        assert response.status_code == 404
    delete_response = await request(make_app(postgres_db, user_b), "DELETE", f"/api/v1/devices/installations/{installation.id}")
    assert delete_response.status_code == 404
    await postgres_db.refresh(installation)
    assert installation.enabled is True


@pytest.mark.asyncio
async def test_owner_can_disable_installation_and_provider_token_is_scrubbed(postgres_db):
    _, user = await make_user(postgres_db)
    installation_id = uuid4()
    response = await request(make_app(postgres_db, user), "PUT", f"/api/v1/devices/installations/{installation_id}", json={"platform": "android", "provider_token": "owner-delete-token", "app_version": "1", "build_number": "1"})
    assert response.status_code == 200
    disabled = await request(make_app(postgres_db, user), "DELETE", f"/api/v1/devices/installations/{installation_id}")
    assert disabled.status_code == 200 and disabled.json() == {"status": "disabled"}
    row = await postgres_db.get(DeviceInstallation, installation_id)
    assert row.enabled is False and row.provider_token == f"revoked:{installation_id}"


@pytest.mark.asyncio
async def test_secret_rotation_invalidates_old_secret_and_keeps_new_secret(postgres_db):
    _, user = await make_user(postgres_db)
    installation_id = uuid4()
    payload = {"platform": "ios", "provider_token": "rotation-token", "app_version": "1", "build_number": "1"}
    first = await request(make_app(postgres_db, user), "PUT", f"/api/v1/devices/installations/{installation_id}", json=payload)
    second = await request(make_app(postgres_db, user), "PUT", f"/api/v1/devices/installations/{installation_id}", json={**payload, "app_version": "2"})
    assert first.status_code == second.status_code == 200
    old_secret, new_secret = first.json()["revocation_secret"], second.json()["revocation_secret"]
    assert old_secret != new_secret
    assert "provider_token" not in first.json() and "provider_token" not in second.json()
    old_revoke = await request(make_app(postgres_db), "POST", f"/api/v1/devices/installations/{installation_id}/revoke", json={"revocation_secret": old_secret})
    assert old_revoke.status_code == 404
    row = await postgres_db.get(DeviceInstallation, installation_id)
    assert row.enabled is True
    new_revoke = await request(make_app(postgres_db), "POST", f"/api/v1/devices/installations/{installation_id}/revoke", json={"revocation_secret": new_secret})
    assert new_revoke.status_code == 200


@pytest.mark.asyncio
async def test_revoke_valid_and_invalid_requests_are_scoped_and_generic(postgres_db):
    _, user = await make_user(postgres_db)
    service = DeviceService(postgres_db)
    installation, secret = await service.register(uuid4(), user, {"platform": "ios", "provider_token": "revoke-token", "app_version": "1", "build_number": "1"})
    valid = await request(make_app(postgres_db), "POST", f"/api/v1/devices/installations/{installation.id}/revoke", json={"revocation_secret": secret})
    assert valid.status_code == 200
    await postgres_db.refresh(installation)
    assert installation.enabled is False
    second, second_secret = await service.register(uuid4(), user, {"platform": "ios", "provider_token": "second-token", "app_version": "1", "build_number": "1"})
    invalid_id = await request(make_app(postgres_db), "POST", f"/api/v1/devices/installations/{uuid4()}/revoke", json={"revocation_secret": second_secret})
    invalid_secret = await request(make_app(postgres_db), "POST", f"/api/v1/devices/installations/{second.id}/revoke", json={"revocation_secret": "wrong"})
    assert invalid_id.status_code == invalid_secret.status_code == 404
    assert invalid_id.json() == invalid_secret.json()
    await postgres_db.refresh(second)
    assert second.enabled is True


@pytest.mark.asyncio
async def test_preferences_http_defaults_update_and_isolate_by_user_tenant(postgres_db):
    tenant_a, user_a = await make_user(postgres_db)
    _, user_b = await make_user(postgres_db)
    app_a = make_app(postgres_db, user_a)
    defaults = await request(app_a, "GET", "/api/v1/notifications/preferences")
    expected = {"push_enabled": True, "message_received": True, "listing_interest_received": True, "registration_decision": True, "urgent_listing_published": True}
    assert defaults.status_code == 200 and defaults.json() == expected
    values = {"push_enabled": False, "message_received": False, "listing_interest_received": True, "registration_decision": False, "urgent_listing_published": True}
    updated = await request(app_a, "PUT", "/api/v1/notifications/preferences", json=values)
    assert updated.status_code == 200 and updated.json() == values
    other = await request(make_app(postgres_db, user_b), "GET", "/api/v1/notifications/preferences")
    assert other.status_code == 200 and other.json() == expected
    partial = await request(app_a, "PUT", "/api/v1/notifications/preferences", json={"push_enabled": True})
    assert partial.status_code == 422
    assert tenant_a.id == user_a.tenant_id


@pytest.mark.asyncio
async def test_http_validation_and_authentication(postgres_db):
    _, user = await make_user(postgres_db)
    invalid_platform = await request(make_app(postgres_db, user), "PUT", f"/api/v1/devices/installations/{uuid4()}", json={"platform": "windows", "provider_token": "x", "app_version": "1", "build_number": "1"})
    assert invalid_platform.status_code in (400, 422)
    missing_auth = await request(make_app(postgres_db), "DELETE", f"/api/v1/devices/installations/{uuid4()}")
    assert missing_auth.status_code == 401


@pytest.mark.asyncio
async def test_concurrent_unowned_provider_token_claims_are_serialized(postgres_db):
    user_a, tenant_a_id = await make_committed_user()
    user_b, tenant_b_id = await make_committed_user()
    created_tenant_ids = [tenant_a_id, tenant_b_id]
    token = f"concurrent-{uuid4().hex}"
    claims = [(user_a.id, user_a.tenant_id), (user_b.id, user_b.tenant_id)]
    barrier = asyncio.Barrier(2)

    async def claim(user_data):
        await barrier.wait()
        async with test_engine.connect() as connection:
            transaction = await connection.begin()
            session = AsyncSession(bind=connection, expire_on_commit=False)
            try:
                detached_user = SimpleNamespace(id=user_data[0], tenant_id=user_data[1])
                result = await DeviceService(session).register(uuid4(), detached_user, {"platform": "ios", "provider_token": token, "app_version": "1", "build_number": "1"})
                await transaction.commit()
                return result
            finally:
                await session.close()

    try:
        results = await asyncio.gather(*(claim(user_data) for user_data in claims), return_exceptions=True)
        assert not any(isinstance(result, Exception) for result in results), results
        async with test_engine.connect() as connection:
            check = AsyncSession(bind=connection, expire_on_commit=False)
            rows = (await check.execute(select(DeviceInstallation).where(DeviceInstallation.provider_token == token))).scalars().all()
            all_rows = (await check.execute(select(DeviceInstallation).where(DeviceInstallation.user_id.in_([claim[0] for claim in claims])))).scalars().all()
            await check.close()
        assert len(rows) == 1 and rows[0].enabled is True
        assert sum(row.enabled for row in all_rows) == 1
    finally:
        async with test_engine.begin() as connection:
            await connection.execute(delete(Tenant).where(Tenant.id.in_(created_tenant_ids)))
        async with test_engine.connect() as connection:
            check = AsyncSession(bind=connection, expire_on_commit=False)
            leaked = (await check.execute(select(DeviceInstallation).where(DeviceInstallation.provider_token == token))).scalars().all()
            await check.close()
        assert leaked == []


def test_response_schema_excludes_provider_token():
    response = DeviceInstallationResponse(id=uuid4(), platform="ios", app_version="1", build_number="1", locale="en-US", enabled=True)
    assert "provider_token" not in response.model_dump()
