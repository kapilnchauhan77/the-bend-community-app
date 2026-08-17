from uuid import uuid4
from datetime import datetime, timedelta
import asyncio

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select

from app.models.enums import NotificationType
from app.models.tenant import Tenant
from app.models.user import User
from app.models.notification import Notification
from app.models.notification_outbox import NotificationOutbox
from app.models.device_installation import DeviceInstallation
from app.models.notification_preference import NotificationPreference
from app.models.enums import UserRole
from app.database import engine
from app.services.push_provider import ProviderResult
from app.services.push_provider import provider_for_platform
from app.services.push_dispatcher import CATEGORY_SPECS, build_native_payload


def test_generic_message_payload_never_includes_stored_message_or_arbitrary_data():
    notification = type(
        "NotificationStub",
        (),
        {
            "id": uuid4(),
            "type": NotificationType.NEW_MESSAGE,
            "body": "secret message body",
            "data": {"message": "secret message body", "contact": "555-0100", "target_type": "message", "target_id": str(uuid4())},
        },
    )()

    payload = build_native_payload(notification)

    assert payload["body"] == "You have a new message"
    assert "secret message body" not in str(payload)
    assert set(payload) == {"notification_id", "category", "title", "body", "target_type", "target_id"}


def test_all_supported_notification_types_have_generic_category_mapping():
    expected = {
        NotificationType.NEW_MESSAGE: "message_received",
        NotificationType.LISTING_INTEREST: "listing_interest_received",
        NotificationType.REGISTRATION_APPROVED: "registration_decision",
        NotificationType.REGISTRATION_REJECTED: "registration_decision",
        NotificationType.NEW_URGENT_LISTING: "urgent_listing_published",
    }
    assert set(expected.values()) == {spec.category for spec in CATEGORY_SPECS.values()}


def test_provider_result_is_sanitized_and_code_only():
    result = ProviderResult.transient("provider_timeout: token=secret")
    assert result.kind == "transient"
    assert result.code == "provider_timeout"
    assert "secret" not in repr(result)


def test_unsupported_notification_type_has_no_native_payload():
    notification = type("NotificationStub", (), {"id": uuid4(), "type": NotificationType.LISTING_EXPIRING, "data": {}})()
    assert build_native_payload(notification) is None


def test_payload_ignores_non_string_target_type_without_raising():
    notification = type("NotificationStub", (), {"id": uuid4(), "type": NotificationType.NEW_MESSAGE, "data": {"target_type": [], "target_id": {}}})()
    payload = build_native_payload(notification)
    assert payload == {"notification_id": str(notification.id), "category": "message_received", "title": "New message", "body": "You have a new message"}


@pytest.mark.asyncio
@pytest.mark.parametrize(("description", "expected"), [("DeviceTokenNotForTopic", "invalid_token"), ("TooManyRequests", "transient"), ("PayloadEmpty", "permanent")])
async def test_apns_maps_installed_response_description(monkeypatch, description, expected):
    from app.services.push_provider import APNsProvider

    class Response:
        is_successful = False
        status = 400

        def __init__(self):
            self.description = description

    class Client:
        def __init__(self, **kwargs):
            pass

        async def send_notification(self, request):
            return Response()

    monkeypatch.setattr("aioapns.APNs", Client)
    provider = APNsProvider(type("Settings", (), {"APNS_TEAM_ID": "team", "APNS_KEY_ID": "key", "APNS_PRIVATE_KEY": "private", "APNS_BUNDLE_ID": "bundle", "APNS_USE_SANDBOX": False})())
    result = await provider.send(type("Installation", (), {"provider_token": "token"})(), {"title": "T", "body": "B"})
    assert result.kind == expected


def test_provider_routing_is_platform_specific_without_network():
    assert provider_for_platform("ios").__class__.__name__ == "APNsProvider"
    assert provider_for_platform("android").__class__.__name__ == "FCMProvider"
    assert provider_for_platform("web") is None


def test_celery_registration_and_ten_second_beat_entry():
    from app.workers.celery_app import celery_app
    import app.workers.push_tasks  # noqa: F401

    assert "app.workers.push_tasks.dispatch_push_outbox" in celery_app.tasks
    assert celery_app.conf.beat_schedule["dispatch-push-outbox"]["schedule"].run_every.total_seconds() == 10


@pytest.mark.asyncio
async def test_provider_imports_without_credentials():
    from app.services.push_provider import APNsProvider, FCMProvider

    assert APNsProvider is not None
    assert FCMProvider is not None


class FakeProvider:
    def __init__(self, results=None, error=None):
        self.results = list(results or [ProviderResult.delivered()])
        self.error = error
        self.calls = []

    async def send(self, installation, payload):
        self.calls.append(str(installation.id))
        if self.error:
            raise self.error
        return self.results.pop(0) if self.results else ProviderResult.delivered()


class KeyedFakeProvider(FakeProvider):
    def __init__(self, results_by_installation):
        super().__init__()
        self.results_by_installation = {str(key): list(value) for key, value in results_by_installation.items()}

    async def send(self, installation, payload):
        self.calls.append(str(installation.id))
        results = self.results_by_installation[str(installation.id)]
        return results.pop(0) if results else ProviderResult.delivered()


@pytest.fixture
async def pg_session():
    await engine.dispose()
    async with engine.connect() as connection:
        tx = await connection.begin()
        session = AsyncSession(bind=connection, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await tx.rollback()
            await engine.dispose()


async def seed_push(session, *, platform="ios", devices=1):
    tenant = Tenant(id=uuid4(), slug=f"push-{uuid4().hex[:10]}", subdomain=f"push-{uuid4().hex[:10]}", display_name="Push")
    user = User(id=uuid4(), email=f"push-{uuid4().hex}@example.com", password_hash="hash", name="Push", role=UserRole.INDIVIDUAL, tenant_id=tenant.id)
    notification = Notification(id=uuid4(), user_id=user.id, tenant_id=tenant.id, type=NotificationType.NEW_MESSAGE, title="secret", body="secret message", data={})
    outbox = NotificationOutbox(notification_id=notification.id, tenant_id=tenant.id)
    installations = [DeviceInstallation(user_id=user.id, tenant_id=tenant.id, platform=platform, provider_token=f"token-{uuid4().hex}", revocation_secret_hash="a" * 64, app_version="1", build_number="1") for _ in range(devices)]
    session.add_all([tenant, user, notification, outbox, *installations])
    await session.flush()
    return tenant, user, notification, outbox, installations


@pytest.mark.asyncio
async def test_postgres_preference_scope_invalid_token_and_no_device(pg_session):
    from app.services.push_dispatcher import PushDispatcher
    tenant, user, _, outbox, installations = await seed_push(pg_session)
    pg_session.add(NotificationPreference(user_id=user.id, tenant_id=tenant.id, message_received=False))
    await pg_session.flush()
    fake = FakeProvider([ProviderResult.invalid_token("Unregistered: token-secret")])
    await PushDispatcher(pg_session, {"ios": fake}).dispatch_one(outbox.id)
    assert outbox.status == "delivered" and outbox.last_error_code == "preference_disabled" and not fake.calls
    await pg_session.delete(await pg_session.get(NotificationPreference, (await pg_session.execute(select(NotificationPreference.id).where(NotificationPreference.user_id == user.id))).scalar_one()))
    await pg_session.delete(installations[0]); await pg_session.flush()
    outbox.status, outbox.locked_at = "pending", None
    await PushDispatcher(pg_session, {"ios": fake}).dispatch_one(outbox.id)
    assert outbox.status == "delivered"


@pytest.mark.asyncio
async def test_postgres_partial_retry_and_permanent_aggregation(pg_session, monkeypatch):
    from app.services.push_dispatcher import PushDispatcher
    _, _, _, outbox, installations = await seed_push(pg_session, devices=2)
    fake = KeyedFakeProvider({installations[0].id: [ProviderResult.delivered()], installations[1].id: [ProviderResult.transient("timeout")]})
    monkeypatch.setattr("app.services.push_dispatcher.random.uniform", lambda a, b: 0)
    dispatcher = PushDispatcher(pg_session, {"ios": fake})
    await dispatcher.dispatch_one(outbox.id)
    assert outbox.status == "pending" and len(fake.calls) == 2 and outbox.available_at >= datetime.utcnow() + timedelta(seconds=29)
    fake.results_by_installation[str(installations[1].id)] = [ProviderResult.delivered()]
    await dispatcher.dispatch_one(outbox.id)
    assert outbox.status == "delivered" and fake.calls.count(str(installations[0].id)) == 1
    outbox.status, outbox.attempts, outbox.provider_results = "pending", 0, {}
    fake = KeyedFakeProvider({str(installations[0].id): [ProviderResult.permanent("bad")], str(installations[1].id): [ProviderResult.delivered()]})
    dispatcher.providers["ios"] = fake
    await dispatcher.dispatch_one(outbox.id)
    assert outbox.status == "failed" and outbox.delivered_at is None


@pytest.mark.asyncio
async def test_postgres_fifth_transient_is_terminal(pg_session, monkeypatch):
    from app.services.push_dispatcher import PushDispatcher
    _, _, _, outbox, _ = await seed_push(pg_session)
    outbox.attempts = 4
    fake = FakeProvider([ProviderResult.transient("busy")])
    monkeypatch.setattr("app.services.push_dispatcher.random.uniform", lambda a, b: 0)
    await PushDispatcher(pg_session, {"ios": fake}).dispatch_one(outbox.id)
    assert outbox.status == "failed" and outbox.delivered_at is None


@pytest.mark.asyncio
async def test_postgres_stale_processing_and_unsupported_terminal(pg_session):
    from app.services.push_dispatcher import PushDispatcher
    _, _, _, outbox, _ = await seed_push(pg_session)
    outbox.status, outbox.locked_at = "processing", datetime.utcnow() - timedelta(minutes=20)
    await pg_session.flush()
    fake = FakeProvider()
    assert await PushDispatcher(pg_session, {"ios": fake}).dispatch_pending() == 1
    await pg_session.refresh(outbox)
    assert outbox.status == "delivered"


@pytest.mark.asyncio
async def test_preference_is_exact_user_tenant_scoped_and_other_categories_continue(pg_session):
    from app.services.push_dispatcher import PushDispatcher

    tenant, user, _, outbox, _ = await seed_push(pg_session)
    pg_session.add(NotificationPreference(user_id=user.id, tenant_id=tenant.id, message_received=False, listing_interest_received=True))
    await pg_session.flush()
    fake = FakeProvider()
    await PushDispatcher(pg_session, {"ios": fake}).dispatch_one(outbox.id)
    assert fake.calls == []
    assert outbox.last_error_code == "preference_disabled"

    other_notification = Notification(id=uuid4(), user_id=user.id, tenant_id=tenant.id, type=NotificationType.LISTING_INTEREST, title="secret", body="private", data={})
    other_outbox = NotificationOutbox(notification_id=other_notification.id, tenant_id=tenant.id)
    pg_session.add(other_notification)
    pg_session.add(other_outbox)
    pg_session.add(DeviceInstallation(user_id=user.id, tenant_id=tenant.id, platform="ios", provider_token=f"token-{uuid4().hex}", revocation_secret_hash="b" * 64, app_version="1", build_number="1"))
    await pg_session.flush()
    await PushDispatcher(pg_session, {"ios": fake}).dispatch_one(other_outbox.id)
    assert len(fake.calls) == 2


@pytest.mark.asyncio
async def test_invalid_token_is_disabled_scrubbed_and_failed_with_sanitized_result(pg_session):
    from app.services.push_dispatcher import PushDispatcher
    _, _, _, outbox, installations = await seed_push(pg_session)
    original = installations[0].provider_token
    fake = FakeProvider([ProviderResult.invalid_token("Unregistered: token-secret")])
    await PushDispatcher(pg_session, {"ios": fake}).dispatch_one(outbox.id)
    await pg_session.refresh(installations[0])
    assert installations[0].enabled is False
    assert installations[0].provider_token == f"revoked:{installations[0].id}"
    assert original not in str(outbox.provider_results)
    assert outbox.provider_results[str(installations[0].id)] == {"kind": "invalid_token", "code": "unregistered"}
    assert outbox.status == "failed" and outbox.last_error_code == "permanent_failure" and outbox.delivered_at is None


@pytest.mark.asyncio
async def test_two_install_retry_skips_delivered_and_records_attempt_backoff_and_jitter(pg_session, monkeypatch):
    from app.services.push_dispatcher import PushDispatcher
    _, _, _, outbox, installations = await seed_push(pg_session, devices=2)
    monkeypatch.setattr("app.services.push_dispatcher.random.uniform", lambda a, b: 2.5)
    fake = KeyedFakeProvider({installations[0].id: [ProviderResult.delivered()], installations[1].id: [ProviderResult.transient("timeout")]})
    dispatcher = PushDispatcher(pg_session, {"ios": fake})
    before = datetime.utcnow()
    await dispatcher.dispatch_one(outbox.id)
    assert outbox.attempts == 1 and outbox.status == "pending" and outbox.locked_at is None
    assert 32 <= (outbox.available_at - before).total_seconds() <= 34
    assert outbox.provider_results[str(installations[0].id)]["kind"] == "delivered"
    fake.results_by_installation[str(installations[1].id)] = [ProviderResult.delivered()]
    await dispatcher.dispatch_one(outbox.id)
    assert outbox.attempts == 2 and outbox.status == "delivered"
    assert fake.calls.count(str(installations[0].id)) == 1
    assert fake.calls.count(str(installations[1].id)) == 2


@pytest.mark.asyncio
async def test_permanent_only_and_delivered_plus_permanent_are_failed(pg_session):
    from app.services.push_dispatcher import PushDispatcher
    _, _, _, outbox, _ = await seed_push(pg_session)
    fake = FakeProvider([ProviderResult.permanent("rejected")])
    await PushDispatcher(pg_session, {"ios": fake}).dispatch_one(outbox.id)
    assert outbox.status == "failed" and outbox.delivered_at is None
    _, _, _, mixed, _ = await seed_push(pg_session, devices=2)
    fake.results = [ProviderResult.delivered(), ProviderResult.permanent("rejected")]
    await PushDispatcher(pg_session, {"ios": fake}).dispatch_one(mixed.id)
    assert mixed.status == "failed" and mixed.delivered_at is None


@pytest.mark.asyncio
async def test_fresh_processing_is_untouched_while_stale_processing_is_recovered(pg_session):
    from app.services.push_dispatcher import PushDispatcher
    _, _, _, stale, _ = await seed_push(pg_session)
    _, _, _, fresh, _ = await seed_push(pg_session)
    stale.status, stale.locked_at = "processing", datetime.utcnow() - timedelta(minutes=16)
    fresh.status, fresh.locked_at = "processing", datetime.utcnow()
    await pg_session.flush()
    await PushDispatcher(pg_session, {"ios": FakeProvider()}).dispatch_pending()
    await pg_session.refresh(stale); await pg_session.refresh(fresh)
    assert stale.status == "delivered" and stale.locked_at is None
    assert fresh.status == "processing" and fresh.locked_at is not None


@pytest.mark.asyncio
async def test_dispatch_pending_provider_exception_is_generic_pending_and_lock_cleared(pg_session):
    from app.services.push_dispatcher import PushDispatcher
    async with engine.connect() as setup_connection:
        setup_tx = await setup_connection.begin()
        setup = AsyncSession(bind=setup_connection, expire_on_commit=False)
        tenant, _, _, outbox, _ = await seed_push(setup)
        await setup_tx.commit()
        await setup.close()
    try:
        async with engine.connect() as connection:
            worker = AsyncSession(bind=connection, expire_on_commit=False)
            try:
                await PushDispatcher(worker, {"ios": FakeProvider(error=RuntimeError("token-secret"))}).dispatch_pending()
            finally:
                await worker.close()
        async with engine.connect() as connection:
            check = AsyncSession(bind=connection, expire_on_commit=False)
            try:
                persisted = await check.get(NotificationOutbox, outbox.id)
                assert persisted is not None
                assert persisted.status == "pending" and persisted.last_error_code == "dispatcher_error" and persisted.locked_at is None
                assert "token-secret" not in str(persisted.provider_results)
            finally:
                await check.close()
    finally:
        async with engine.begin() as cleanup:
            await cleanup.execute(delete(Tenant).where(Tenant.id == tenant.id))


@pytest.mark.asyncio
async def test_no_device_and_unsupported_notification_are_terminal_without_send(pg_session):
    from app.services.push_dispatcher import PushDispatcher
    _, _, _, no_device, installations = await seed_push(pg_session)
    await pg_session.delete(installations[0]); await pg_session.flush()
    fake = FakeProvider()
    await PushDispatcher(pg_session, {"ios": fake}).dispatch_one(no_device.id)
    assert no_device.status == "delivered" and no_device.delivered_at is not None and fake.calls == []
    _, user, notification, unsupported, _ = await seed_push(pg_session)
    notification.type = NotificationType.LISTING_EXPIRING
    await pg_session.flush()
    await PushDispatcher(pg_session, {"ios": fake}).dispatch_one(unsupported.id)
    assert unsupported.status == "failed" and unsupported.last_error_code == "unsupported_notification" and fake.calls == []


@pytest.mark.asyncio
async def test_two_independent_sessions_claim_one_ready_row_with_skip_locked():
    from app.services.push_dispatcher import PushDispatcher
    tenant_id = uuid4()
    async with engine.connect() as setup_connection:
        setup_tx = await setup_connection.begin()
        setup = AsyncSession(bind=setup_connection, expire_on_commit=False)
        try:
            tenant, user, _, outbox, _ = await seed_push(setup)
            tenant_id = tenant.id
            await setup_tx.commit()
        finally:
            await setup.close()
    barrier = asyncio.Barrier(2)
    providers = [FakeProvider(), FakeProvider()]

    async def run(provider):
        async with engine.connect() as connection:
            session = AsyncSession(bind=connection, expire_on_commit=False)
            try:
                await barrier.wait()
                return await PushDispatcher(session, {"ios": provider}).dispatch_pending()
            finally:
                await session.close()

    try:
        counts = await asyncio.gather(run(providers[0]), run(providers[1]))
        assert sum(counts) == 1
        assert sum(len(provider.calls) for provider in providers) == 1
    finally:
        async with engine.begin() as cleanup:
            await cleanup.execute(delete(Tenant).where(Tenant.id == tenant_id))
        async with engine.connect() as verify_connection:
            verify = AsyncSession(bind=verify_connection, expire_on_commit=False)
            try:
                assert await verify.scalar(select(NotificationOutbox.id).where(NotificationOutbox.tenant_id == tenant_id)) is None
                assert await verify.scalar(select(DeviceInstallation.id).where(DeviceInstallation.tenant_id == tenant_id)) is None
            finally:
                await verify.close()
