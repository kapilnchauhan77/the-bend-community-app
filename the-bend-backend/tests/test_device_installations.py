from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device_installation import DeviceInstallation
from app.models.tenant import Tenant
from app.models.user import User
from app.models.enums import UserRole
from app.schemas.device import DeviceInstallationRequest, DeviceInstallationResponse
from app.schemas.notification import NotificationPreferencesRequest
from app.services.notification_service import NotificationService
from app.services.device_service import DeviceService
from app.api.v1.devices import router as devices_router
from app.database import engine


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeDB:
    def __init__(self, rows=()):
        self.rows = list(rows)
        self.added = []

    async def execute(self, statement):
        installation_id = getattr(statement, "_installation_id", None)
        user_id = getattr(statement, "_user_id", None)
        tenant_id = getattr(statement, "_tenant_id", None)
        for row in self.rows:
            if installation_id is not None and row.id != installation_id:
                continue
            if user_id is not None and row.user_id != user_id:
                continue
            if tenant_id is not None and row.tenant_id != tenant_id:
                continue
            return FakeResult(row)
        return FakeResult(None)

    def add(self, row):
        self.added.append(row)
        self.rows.append(row)

    async def flush(self):
        return None


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


async def make_user(db, tenant_id=None):
    tenant = Tenant(
        id=tenant_id or uuid4(),
        slug=f"test-{uuid4().hex}",
        subdomain=f"test-{uuid4().hex}",
        display_name="Test Tenant",
    )
    db.add(tenant)
    await db.flush()
    user = User(
        id=uuid4(),
        email=f"{uuid4().hex}@example.com",
        password_hash="hash",
        name="Test User",
        role=UserRole.INDIVIDUAL,
        tenant_id=tenant.id,
    )
    db.add(user)
    await db.flush()
    return tenant, user


@pytest.mark.asyncio
async def test_registration_rotates_provider_token_and_returns_one_time_secret():
    user = SimpleNamespace(id=uuid4(), tenant_id=uuid4())
    installation_id = uuid4()
    db = FakeDB()
    service = DeviceService(db)

    installation, secret = await service.register(
        installation_id=installation_id,
        user=user,
        payload={
            "platform": "ios",
            "provider_token": "apns-token-1",
            "app_version": "1.0.0",
            "build_number": "1",
            "locale": "en-US",
        },
    )

    assert installation.id == installation_id
    assert installation.provider_token == "apns-token-1"
    assert secret
    assert secret != installation.revocation_secret_hash
    assert service._verify_secret(secret, installation.revocation_secret_hash)

    previous_hash = installation.revocation_secret_hash
    installation, next_secret = await service.register(
        installation_id=installation_id,
        user=user,
        payload={
            "platform": "ios",
            "provider_token": "apns-token-2",
            "app_version": "1.0.1",
            "build_number": "2",
            "locale": "en-US",
        },
    )
    assert installation.provider_token == "apns-token-2"
    assert installation.revocation_secret_hash != previous_hash
    assert not service._verify_secret(secret, installation.revocation_secret_hash)
    assert service._verify_secret(next_secret, installation.revocation_secret_hash)


@pytest.mark.asyncio
async def test_revoke_with_invalid_secret_is_generic_and_does_not_change_installation():
    installation = DeviceInstallation(
        id=uuid4(),
        user_id=uuid4(),
        tenant_id=uuid4(),
        platform="ios",
        provider_token="provider-token",
        revocation_secret_hash="not-a-valid-hash",
        app_version="1",
        build_number="1",
    )
    service = DeviceService(FakeDB([installation]))

    with pytest.raises(Exception) as exc_info:
        await service.revoke_with_secret(installation.id, "wrong-secret")

    assert getattr(exc_info.value, "status_code", None) == 404
    assert installation.enabled is True
    assert installation.provider_token == "provider-token"


@pytest.mark.asyncio
async def test_authenticated_disablement_requires_matching_user_and_tenant():
    installation = DeviceInstallation(
        id=uuid4(),
        user_id=uuid4(),
        tenant_id=uuid4(),
        platform="android",
        provider_token="fcm-token",
        revocation_secret_hash="hash",
        app_version="1",
        build_number="1",
    )
    service = DeviceService(FakeDB([installation]))
    wrong_user = SimpleNamespace(id=uuid4(), tenant_id=installation.tenant_id)

    with pytest.raises(Exception) as exc_info:
        await service.disable(installation.id, wrong_user)

    assert getattr(exc_info.value, "status_code", None) == 404
    assert installation.enabled is True


@pytest.mark.asyncio
async def test_provider_token_transfer_is_global_across_tenants(postgres_db):
    old_tenant, old_user = await make_user(postgres_db)
    new_tenant, new_user = await make_user(postgres_db)
    old_installation = DeviceInstallation(
        user_id=old_user.id,
        tenant_id=old_tenant.id,
        platform="ios",
        provider_token="globally-owned-token",
        revocation_secret_hash="hash",
        app_version="1",
        build_number="1",
    )
    postgres_db.add(old_installation)
    await postgres_db.flush()

    new_installation, _ = await DeviceService(postgres_db).register(
        uuid4(),
        new_user,
        {
            "platform": "android",
            "provider_token": "globally-owned-token",
            "app_version": "2",
            "build_number": "2",
        },
    )

    await postgres_db.refresh(old_installation)
    assert new_installation.provider_token == "globally-owned-token"
    assert old_installation.enabled is False
    assert old_installation.provider_token == f"revoked:{old_installation.id}"


def test_preferences_put_requires_all_native_flags():
    with pytest.raises(PydanticValidationError):
        NotificationPreferencesRequest(push_enabled=False)


@pytest.mark.asyncio
async def test_preferences_reject_tenantless_users_before_persistence(postgres_db):
    user = SimpleNamespace(id=uuid4(), tenant_id=None)
    with pytest.raises(Exception) as exc_info:
        await NotificationService(postgres_db).get_preferences(user.id, user.tenant_id)
    assert getattr(exc_info.value, "status_code", None) == 404


@pytest.mark.asyncio
async def test_invalid_platform_is_rejected_before_registration():
    user = SimpleNamespace(id=uuid4(), tenant_id=uuid4())
    with pytest.raises(Exception) as exc_info:
        await DeviceService(FakeDB()).register(
            uuid4(),
            user,
            {"platform": "windows", "provider_token": "token", "app_version": "1", "build_number": "1"},
        )
    assert getattr(exc_info.value, "status_code", None) == 400


@pytest.mark.asyncio
async def test_valid_revoke_disables_only_named_installation():
    service = DeviceService(FakeDB())
    secret = "correct-secret"
    installation = DeviceInstallation(
        id=uuid4(),
        user_id=uuid4(),
        tenant_id=uuid4(),
        platform="ios",
        provider_token="provider-token",
        revocation_secret_hash=service._hash_secret(secret),
        app_version="1",
        build_number="1",
    )
    service.db.rows.append(installation)
    await service.revoke_with_secret(installation.id, secret)
    assert installation.enabled is False
    assert installation.provider_token == f"revoked:{installation.id}"


def test_device_response_excludes_provider_token_and_routes_are_registered():
    response = DeviceInstallationResponse(
        id=uuid4(),
        platform="ios",
        app_version="1",
        build_number="1",
        locale="en-US",
        enabled=True,
        provider_token="must-not-be-returned",
    )
    assert "provider_token" not in response.model_dump()
    assert {route.path for route in devices_router.routes} == {
        "/devices/installations/{installation_id}",
        "/devices/installations/{installation_id}/revoke",
    }
    assert DeviceInstallationRequest.model_fields["platform"].is_required()
