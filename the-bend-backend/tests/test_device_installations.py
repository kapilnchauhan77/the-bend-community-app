from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.device_installation import DeviceInstallation
from app.services.device_service import DeviceService


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
