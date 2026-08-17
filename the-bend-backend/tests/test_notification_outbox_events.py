"""Focused Task 4 contract tests.

The production integration suite supplies real PostgreSQL coverage; these small
tests pin the service's transaction boundary and are intentionally independent
of the repository fixture lifecycle.
"""
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.exceptions import ValidationError
from app.models.enums import NotificationType
from app.models.notification_outbox import NotificationOutbox
from app.services.notification_service import NotificationService


class _Result:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _Session:
    def __init__(self, user):
        self.user = user
        self.added = []
        self.flushes = 0

    async def execute(self, _query):
        return _Result(self.user)

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        self.flushes += 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "notification_type,category",
    [
        (NotificationType.NEW_MESSAGE, "message_received"),
        (NotificationType.LISTING_INTEREST, "listing_interest_received"),
        (NotificationType.REGISTRATION_APPROVED, "registration_decision"),
        (NotificationType.NEW_URGENT_LISTING, "urgent_listing_published"),
    ],
)
async def test_required_notification_adds_outbox_in_same_session(notification_type, category):
    tenant_id = uuid4()
    session = _Session(SimpleNamespace(id=uuid4(), tenant_id=tenant_id))
    notification = await NotificationService(session).notify(
        user_id=session.user.id,
        type=notification_type,
        title="title",
        body="body",
        data={"target_type": "listing", "target_id": str(uuid4())},
        category=category,
        tenant_id=tenant_id,
    )

    outboxes = [row for row in session.added if isinstance(row, NotificationOutbox)]
    assert notification.tenant_id == tenant_id
    assert len(outboxes) == 1
    assert outboxes[0].notification_id == notification.id
    assert session.flushes == 2


@pytest.mark.asyncio
async def test_category_mismatch_is_controlled_validation_error():
    tenant_id = uuid4()
    session = _Session(SimpleNamespace(id=uuid4(), tenant_id=tenant_id))
    with pytest.raises(ValidationError):
        await NotificationService(session).notify(
            user_id=session.user.id,
            type=NotificationType.NEW_MESSAGE,
            title="title",
            body="body",
            category="urgent_listing_published",
            tenant_id=tenant_id,
        )
    assert session.added == []


@pytest.mark.asyncio
async def test_non_native_notification_has_no_outbox():
    tenant_id = uuid4()
    session = _Session(SimpleNamespace(id=uuid4(), tenant_id=tenant_id))
    await NotificationService(session).notify(
        user_id=session.user.id,
        type=NotificationType.REGISTRATION_SUBMITTED,
        title="title",
        body="body",
        tenant_id=tenant_id,
    )
    assert not any(isinstance(row, NotificationOutbox) for row in session.added)
