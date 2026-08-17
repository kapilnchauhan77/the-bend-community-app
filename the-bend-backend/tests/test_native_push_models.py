from datetime import datetime
from uuid import uuid4

from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base
from app.models.device_installation import DeviceInstallation
from app.models.notification_outbox import NotificationOutbox
from app.models.notification_preference import NotificationPreference


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
        (DeviceInstallation.__table__, {"users.id", "tenants.id"}),
        (NotificationPreference.__table__, {"users.id", "tenants.id"}),
        (NotificationOutbox.__table__, {"notifications.id", "tenants.id"}),
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
