"""PostgreSQL transaction and outbox contracts for Task 4."""
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from app.database import async_session, engine
from app.core.exceptions import ValidationError
from app.models.enums import NotificationType, UserRole
from app.models.notification import Notification
from app.models.notification_outbox import NotificationOutbox
from app.models.tenant import Tenant
from app.models.user import User
from app.models.message import MessageThread, Message
from app.services.message_service import MessageService
from app.core.security import create_access_token
from fastapi import WebSocketDisconnect
from app.api.ws import chat as chat_ws
from app.services.notification_service import NotificationService
from app.services.push_dispatcher import build_native_payload, CATEGORY_SPECS


@pytest_asyncio.fixture
async def pg_subject():
    tenant_id, user_id = uuid4(), uuid4()
    async with async_session() as db:
        db.add(Tenant(id=tenant_id, slug=f"task4-{tenant_id.hex[:12]}", subdomain=f"task4-{tenant_id.hex[:12]}", display_name="Task 4"))
        db.add(User(id=user_id, tenant_id=tenant_id, email=f"task4-{user_id}@example.test", password_hash="x", name="Task 4", role=UserRole.INDIVIDUAL))
        await db.commit()
    try:
        yield tenant_id, user_id
    finally:
        async with async_session() as db:
            await db.execute(delete(NotificationOutbox).where(NotificationOutbox.tenant_id == tenant_id))
            await db.execute(delete(Notification).where(Notification.tenant_id == tenant_id))
            await db.execute(delete(User).where(User.id == user_id, User.tenant_id == tenant_id))
            await db.execute(delete(Tenant).where(Tenant.id == tenant_id))
            await db.commit()
        async with async_session() as db:
            assert (await db.execute(select(NotificationOutbox).where(NotificationOutbox.tenant_id == tenant_id))).scalar_one_or_none() is None
            assert (await db.execute(select(Notification).where(Notification.tenant_id == tenant_id))).scalar_one_or_none() is None
            assert (await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id))).scalar_one_or_none() is None
            assert (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none() is None
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("notification_type", list(CATEGORY_SPECS))
async def test_required_types_create_tenant_scoped_outbox_and_safe_payload(pg_subject, notification_type):
    tenant_id, user_id = pg_subject
    category = CATEGORY_SPECS[notification_type].category
    target_type = "message" if notification_type == NotificationType.NEW_MESSAGE else ("shop" if notification_type in (NotificationType.REGISTRATION_APPROVED, NotificationType.REGISTRATION_REJECTED) else "listing")
    target_id = uuid4()
    async with async_session() as db:
        notification = await NotificationService(db).notify(user_id, notification_type, "Title", "private rejection reason", {"target_type": target_type, "target_id": str(target_id), "_idempotency_key": "private"}, category, tenant_id)
        await db.commit()
    async with async_session() as db:
        row = (await db.execute(select(NotificationOutbox).where(NotificationOutbox.notification_id == notification.id, NotificationOutbox.tenant_id == tenant_id))).scalar_one()
        persisted = (await db.execute(select(Notification).where(Notification.id == notification.id, Notification.tenant_id == tenant_id))).scalar_one()
        assert row.notification_id == persisted.id
        assert persisted.tenant_id == tenant_id
        payload = build_native_payload(persisted)
        assert payload["category"] == category
        assert payload["target_type"] == target_type and payload["target_id"] == str(target_id)
        assert "private rejection reason" not in str(payload)


@pytest.mark.asyncio
async def test_non_native_and_invalid_categories_do_not_create_outbox(pg_subject):
    tenant_id, user_id = pg_subject
    async with async_session() as db:
        await NotificationService(db).notify(user_id, NotificationType.REGISTRATION_SUBMITTED, "t", "b", tenant_id=tenant_id)
        with pytest.raises(ValidationError):
            await NotificationService(db).notify(user_id, NotificationType.REGISTRATION_SUBMITTED, "t", "b", category="registration_decision", tenant_id=tenant_id)
        with pytest.raises(ValidationError):
            await NotificationService(db).notify(user_id, NotificationType.NEW_MESSAGE, "t", "b", category="bad", tenant_id=tenant_id)
        await db.commit()
    async with async_session() as db:
        assert (await db.execute(select(NotificationOutbox).where(NotificationOutbox.tenant_id == tenant_id))).scalars().all() == []


@pytest.mark.asyncio
async def test_rollback_removes_notification_and_outbox(pg_subject):
    tenant_id, user_id = pg_subject
    async with async_session() as db:
        notification = await NotificationService(db).notify(user_id, NotificationType.NEW_MESSAGE, "t", "b", {"target_type": "message", "target_id": str(uuid4())}, tenant_id=tenant_id)
        notification_id = notification.id
        await db.rollback()
    async with async_session() as db:
        assert (await db.execute(select(Notification).where(Notification.id == notification_id))).scalar_one_or_none() is None
        assert (await db.execute(select(NotificationOutbox).where(NotificationOutbox.notification_id == notification_id))).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_legacy_direct_thread_derives_recipient_tenant_and_notification_id(pg_subject):
    tenant_id, recipient_id = pg_subject
    sender_id, thread_id = uuid4(), uuid4()
    async with async_session() as db:
        db.add(User(id=sender_id, tenant_id=tenant_id, email=f"task4-sender-{sender_id}@example.test", password_hash="x", name="Sender", role=UserRole.INDIVIDUAL))
        db.add(MessageThread(id=thread_id, participant_a=sender_id, participant_b=recipient_id, tenant_id=None))
        await db.commit()
    try:
        async with async_session() as db:
            message = await MessageService(db).send_message(thread_id, sender_id, "private text", caller_tenant_id=tenant_id)
            await db.commit()
            notification = (await db.execute(select(Notification).where(Notification.user_id == recipient_id, Notification.tenant_id == tenant_id).order_by(Notification.created_at.desc()))).scalars().first()
            assert message.content == "private text"
            assert notification is not None
            assert notification.body == "You have a new message"
            assert notification.data == {"target_type": "message", "target_id": str(thread_id)}
            assert (await db.execute(select(NotificationOutbox).where(NotificationOutbox.notification_id == notification.id, NotificationOutbox.tenant_id == tenant_id))).scalar_one_or_none() is not None
    finally:
        async with async_session() as db:
            await db.execute(delete(NotificationOutbox).where(NotificationOutbox.tenant_id == tenant_id))
            await db.execute(delete(Notification).where(Notification.tenant_id == tenant_id))
            await db.execute(delete(Message).where(Message.thread_id == thread_id))
            await db.execute(delete(MessageThread).where(MessageThread.id == thread_id))
            await db.execute(delete(User).where(User.id == sender_id, User.tenant_id == tenant_id))
            await db.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_websocket_handler_legacy_thread_without_caller_tenant(pg_subject):
    tenant_id, recipient_id = pg_subject
    sender_id, thread_id = uuid4(), uuid4()
    async with async_session() as db:
        db.add(User(id=sender_id, tenant_id=tenant_id, email=f"task4-ws-{sender_id}@example.test", password_hash="x", name="WS Sender", role=UserRole.INDIVIDUAL))
        db.add(MessageThread(id=thread_id, participant_a=sender_id, participant_b=recipient_id, tenant_id=None))
        await db.commit()

    class _Socket:
        def __init__(self, token, incoming=None):
            self.query_params = {"token": token}
            self.incoming = incoming
            self.sent = []
            self.accepted = False
        async def accept(self):
            self.accepted = True
        async def receive_text(self):
            if self.incoming is not None:
                value, self.incoming = self.incoming, None
                return value
            raise WebSocketDisconnect()
        async def send_json(self, payload):
            self.sent.append(payload)
        async def close(self, **kwargs):
            pass

    recipient_socket = _Socket(create_access_token(recipient_id, UserRole.INDIVIDUAL.value))
    sender_socket = _Socket(create_access_token(sender_id, UserRole.INDIVIDUAL.value), __import__("json").dumps({"type": "message", "thread_id": str(thread_id), "content": "secret"}))
    chat_ws.manager.active.setdefault(str(recipient_id), set()).add(recipient_socket)
    try:
        await chat_ws.websocket_chat(sender_socket)
        assert recipient_socket.sent
        event = recipient_socket.sent[-1]
        assert event["type"] == "message"
        assert event["data"]["notification_id"]
        async with async_session() as db:
            notification = (await db.execute(select(Notification).where(Notification.user_id == recipient_id, Notification.tenant_id == tenant_id).order_by(Notification.created_at.desc()))).scalars().first()
            assert notification is not None
            assert (await db.execute(select(NotificationOutbox).where(NotificationOutbox.notification_id == notification.id))).scalar_one_or_none() is not None
    finally:
        chat_ws.manager.active.pop(str(recipient_id), None)
        async with async_session() as db:
            await db.execute(delete(NotificationOutbox).where(NotificationOutbox.tenant_id == tenant_id))
            await db.execute(delete(Notification).where(Notification.tenant_id == tenant_id))
            await db.execute(delete(Message).where(Message.thread_id == thread_id))
            await db.execute(delete(MessageThread).where(MessageThread.id == thread_id))
            await db.execute(delete(User).where(User.id == sender_id, User.tenant_id == tenant_id))
            await db.commit()
        await engine.dispose()
