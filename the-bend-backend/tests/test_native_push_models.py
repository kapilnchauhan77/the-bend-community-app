from datetime import datetime
from uuid import uuid4

import pytest
from sqlalchemy import delete, insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base
from app.models.device_installation import DeviceInstallation
from app.models.notification_outbox import NotificationOutbox
from app.models.notification_preference import NotificationPreference
from app.models.enums import NotificationType, UserRole
from app.models.notification import Notification
from app.models.tenant import Tenant
from app.models.user import User
from app.database import engine


def test_notification_preferences_default_to_required_categories_enabled():
    prefs = NotificationPreference(user_id=uuid4(), tenant_id=uuid4())

    assert prefs.push_enabled is True
    assert prefs.message_received is True
    assert prefs.listing_interest_received is True
    assert prefs.registration_decision is True
    assert prefs.urgent_listing_published is True


def test_outbox_starts_pending():
    row = NotificationOutbox(notification_id=uuid4(), tenant_id=uuid4())

    assert row.status == "pending"
    assert row.attempts == 0


def test_device_installation_has_tenant_scoped_fields_and_safe_defaults():
    row = DeviceInstallation(
        user_id=uuid4(),
        tenant_id=uuid4(),
        platform="ios",
        provider_token="provider-token",
        revocation_secret_hash="a" * 64,
        app_version="1.0.0",
        build_number="1",
    )

    assert row.locale == "en-US"
    assert row.enabled is True
    assert isinstance(row.last_seen_at, datetime)
    assert isinstance(row.created_at, datetime)
    assert isinstance(row.updated_at, datetime)


def test_native_push_columns_use_uuid_fks_and_jsonb_without_enum_status():
    for model in (DeviceInstallation, NotificationPreference, NotificationOutbox):
        table = model.__table__
        assert isinstance(table.c.id.type, UUID)
        assert all(column.type.__class__.__name__ != "ENUM" for column in table.c)

    outbox = NotificationOutbox.__table__
    assert isinstance(outbox.c.provider_results.type, JSONB)
    assert str(outbox.c.status.type).upper().startswith("VARCHAR")
    assert outbox.c.last_error_code.type.length <= 128

    for table, target in (
        (DeviceInstallation.__table__, {"users.id", "users.tenant_id", "tenants.id"}),
        (NotificationPreference.__table__, {"users.id", "users.tenant_id", "tenants.id"}),
        (NotificationOutbox.__table__, {"notifications.id", "notifications.tenant_id", "tenants.id"}),
    ):
        assert {
            f"{fk.column.table.name}.{fk.column.name}"
            for fk in table.foreign_keys
        } == target
        assert all(fk.ondelete == "CASCADE" for fk in table.foreign_keys)


def test_native_push_uniques_and_indexes_are_tenant_safe():
    installation = DeviceInstallation.__table__
    assert {column.name for constraint in installation.constraints if constraint.__class__.__name__ == "UniqueConstraint" for column in constraint.columns} >= {"provider_token"}
    assert {index.name for index in installation.indexes} >= {"idx_device_installations_user", "idx_device_installations_tenant"}

    preferences = NotificationPreference.__table__
    preference_uniques = [
        {column.name for column in constraint.columns}
        for constraint in preferences.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    ]
    assert {"user_id", "tenant_id"} in preference_uniques
    assert {index.name for index in preferences.indexes} >= {"idx_notification_preferences_user", "idx_notification_preferences_tenant"}

    outbox = NotificationOutbox.__table__
    outbox_uniques = [
        {column.name for column in constraint.columns}
        for constraint in outbox.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    ]
    assert {"notification_id"} in outbox_uniques
    assert {index.name for index in outbox.indexes} >= {"idx_notification_outbox_tenant_status", "idx_notification_outbox_available"}


def test_native_models_are_registered_in_metadata():
    assert {"device_installations", "notification_preferences", "notification_outbox"} <= set(Base.metadata.tables)


def test_tenant_integrity_uses_composite_parent_keys():
    for model, target in (
        (DeviceInstallation, {"users.id,users.tenant_id", "tenants.id"}),
        (NotificationPreference, {"users.id,users.tenant_id", "tenants.id"}),
        (NotificationOutbox, {"notifications.id,notifications.tenant_id", "tenants.id"}),
    ):
        table = model.__table__
        actual = {
            ",".join(f"{element.column.table.name}.{element.column.name}" for element in fk.elements)
            for fk in table.foreign_key_constraints
        }
        assert actual == target

    assert {"id", "tenant_id"} in [
        {column.name for column in constraint.columns}
        for constraint in DeviceInstallation.metadata.tables["users"].constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    ]


@pytest.fixture
async def db():
    await engine.dispose()
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(bind=connection, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()
            await engine.dispose()


async def _parents(session: AsyncSession):
    tenant = Tenant(id=uuid4(), slug=f"native-{uuid4().hex[:12]}", subdomain=f"native-{uuid4().hex[:12]}", display_name="Native Test")
    user = User(id=uuid4(), email=f"native-{uuid4().hex}@example.com", password_hash="hash", name="Native", role=UserRole.INDIVIDUAL, tenant_id=tenant.id)
    notification = Notification(id=uuid4(), user_id=user.id, tenant_id=tenant.id, type=NotificationType.NEW_MESSAGE, title="Test", body="Body")
    session.add_all([tenant, user, notification])
    await session.flush()
    return tenant, user, notification


@pytest.mark.asyncio
async def test_postgres_server_defaults_jsonb_and_nullable_timestamps(db):
    tenant, user, notification = await _parents(db)
    installation_id = uuid4()
    preference_id = uuid4()
    outbox_id = uuid4()
    await db.execute(insert(DeviceInstallation).values(id=installation_id, user_id=user.id, tenant_id=tenant.id, platform="ios", provider_token=f"token-{uuid4().hex}", revocation_secret_hash="a" * 64, app_version="1", build_number="1"))
    await db.execute(insert(NotificationPreference).values(id=preference_id, user_id=user.id, tenant_id=tenant.id))
    await db.execute(insert(NotificationOutbox).values(id=outbox_id, notification_id=notification.id, tenant_id=tenant.id, locked_at=None, delivered_at=None))
    installation = await db.get(DeviceInstallation, installation_id)
    preference = await db.get(NotificationPreference, preference_id)
    outbox = await db.get(NotificationOutbox, outbox_id)
    assert installation.locale == "en-US" and installation.enabled is True
    assert preference.push_enabled is True and preference.urgent_listing_published is True
    assert outbox.status == "pending" and outbox.attempts == 0 and outbox.provider_results == {}
    assert outbox.locked_at is None and outbox.delivered_at is None
    outbox.provider_results = {"provider": "apns", "accepted": True}
    await db.flush()
    await db.refresh(outbox)
    assert outbox.provider_results == {"provider": "apns", "accepted": True}


@pytest.mark.asyncio
async def test_postgres_constraints_reject_invalid_status_and_duplicates(db):
    tenant, user, notification = await _parents(db)
    token = f"token-{uuid4().hex}"
    db.add(DeviceInstallation(user_id=user.id, tenant_id=tenant.id, platform="ios", provider_token=token, revocation_secret_hash="a" * 64, app_version="1", build_number="1"))
    await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(DeviceInstallation(user_id=user.id, tenant_id=tenant.id, platform="ios", provider_token=token, revocation_secret_hash="b" * 64, app_version="1", build_number="1"))
            await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(NotificationOutbox(notification_id=notification.id, tenant_id=tenant.id, status="not-a-status"))
            await db.flush()


@pytest.mark.asyncio
async def test_postgres_constraints_reject_cross_tenant_child_rows(db):
    tenant, user, notification = await _parents(db)
    other = Tenant(id=uuid4(), slug=f"native-{uuid4().hex[:12]}", subdomain=f"native-{uuid4().hex[:12]}", display_name="Other")
    await db.flush()
    db.add(other)
    await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(DeviceInstallation(user_id=user.id, tenant_id=other.id, platform="ios", provider_token=f"token-{uuid4().hex}", revocation_secret_hash="a" * 64, app_version="1", build_number="1"))
            await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(NotificationPreference(user_id=user.id, tenant_id=other.id))
            await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(NotificationOutbox(notification_id=notification.id, tenant_id=other.id))
            await db.flush()


@pytest.mark.asyncio
async def test_postgres_preference_is_unique_per_user_tenant_and_cascades(db):
    tenant, user, notification = await _parents(db)
    db.add(NotificationPreference(user_id=user.id, tenant_id=tenant.id))
    await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(NotificationPreference(user_id=user.id, tenant_id=tenant.id))
            await db.flush()
    db.add(DeviceInstallation(user_id=user.id, tenant_id=tenant.id, platform="ios", provider_token=f"token-{uuid4().hex}", revocation_secret_hash="a" * 64, app_version="1", build_number="1"))
    db.add(NotificationOutbox(notification_id=notification.id, tenant_id=tenant.id))
    await db.flush()
    await db.execute(delete(Tenant).where(Tenant.id == tenant.id))
    await db.flush()
    assert await db.scalar(select(DeviceInstallation.id).where(DeviceInstallation.tenant_id == tenant.id)) is None
    assert await db.scalar(select(NotificationOutbox.id).where(NotificationOutbox.tenant_id == tenant.id)) is None
