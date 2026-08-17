from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.repositories.notification_repo import NotificationRepository
from app.models.enums import NotificationType
from app.models.push_subscription import PushSubscription
from app.models.notification_preference import NotificationPreference
from app.models.notification_outbox import NotificationOutbox
from app.models.user import User
from app.core.exceptions import NotFoundError, ValidationError


REQUIRED_NOTIFICATION_CATEGORIES = {
    NotificationType.NEW_MESSAGE: "message_received",
    NotificationType.LISTING_INTEREST: "listing_interest_received",
    NotificationType.REGISTRATION_APPROVED: "registration_decision",
    NotificationType.REGISTRATION_REJECTED: "registration_decision",
    NotificationType.NEW_URGENT_LISTING: "urgent_listing_published",
}


class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = NotificationRepository(db)

    async def get_notifications(self, user_id: UUID, cursor=None, limit=20, unread_only=False):
        result = await self.repo.get_for_user(user_id, cursor, limit, unread_only)
        items = [{
            "id": str(n.id),
            "type": n.type.value,
            "title": n.title,
            "body": n.body,
            "data": n.data,
            "is_read": n.is_read,
            "read_at": str(n.read_at) if n.read_at else None,
            "created_at": str(n.created_at),
        } for n in result.items]
        return {"items": items, "next_cursor": result.next_cursor, "has_more": result.has_more}

    async def mark_read(self, notification_id: UUID, user_id: UUID):
        await self.repo.mark_read(notification_id, user_id)

    async def mark_all_read(self, user_id: UUID) -> int:
        return await self.repo.mark_all_read(user_id)

    async def get_unread_count(self, user_id: UUID) -> int:
        return await self.repo.get_unread_count(user_id)

    async def notify(
        self,
        user_id: UUID,
        type: NotificationType,
        title: str,
        body: str,
        data: dict | None = None,
        category: str | None = None,
        tenant_id: UUID | None = None,
    ):
        """Create an in-app notification and, for native types, its outbox row.

        This method deliberately never commits.  Both rows therefore share the
        caller transaction and a notification failure rolls back its domain
        operation as well.
        """
        recipient_result = await self.db.execute(select(User).where(User.id == user_id))
        recipient = recipient_result.scalar_one_or_none()
        if recipient is None:
            raise NotFoundError("User")
        recipient_tenant = recipient.tenant_id
        if tenant_id is None:
            tenant_id = recipient_tenant
        if tenant_id is None or recipient_tenant != tenant_id:
            raise ValidationError("Notification recipient is not in the requested tenant")

        expected_category = REQUIRED_NOTIFICATION_CATEGORIES.get(type)
        if expected_category is None and category is not None:
            raise ValidationError("Notification category is only valid for native notification types")
        if expected_category and category is not None and category != expected_category:
            raise ValidationError("Notification category does not match notification type")
        if category is not None and category not in set(REQUIRED_NOTIFICATION_CATEGORIES.values()):
            raise ValidationError("Invalid notification category")
        if expected_category:
            category = expected_category

        # Keep repository available for read APIs; create directly so tenant is
        # populated before the first flush.
        from app.models.notification import Notification
        notification = Notification(
            id=uuid4(), user_id=user_id, tenant_id=tenant_id, type=type,
            title=title, body=body, data=data,
        )
        self.db.add(notification)
        await self.db.flush()
        if expected_category:
            self.db.add(NotificationOutbox(
                notification_id=notification.id,
                tenant_id=tenant_id,
            ))
            await self.db.flush()
        # TODO: WebSocket delivery if online
        return notification

    async def register_push_subscription(
        self, user_id: UUID, endpoint: str, p256dh_key: str, auth_key: str
    ):
        result = await self.db.execute(
            select(PushSubscription).where(PushSubscription.endpoint == endpoint)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.user_id = user_id
            existing.p256dh_key = p256dh_key
            existing.auth_key = auth_key
        else:
            sub = PushSubscription(
                id=uuid4(),
                user_id=user_id,
                endpoint=endpoint,
                p256dh_key=p256dh_key,
                auth_key=auth_key,
            )
            self.db.add(sub)
        await self.db.flush()

    async def get_preferences(self, user_id: UUID, tenant_id: UUID | None):
        if tenant_id is None:
            raise NotFoundError("Tenant")
        result = await self.db.execute(
            select(NotificationPreference).where(
                NotificationPreference.user_id == user_id,
                NotificationPreference.tenant_id == tenant_id,
            )
        )
        preference = result.scalar_one_or_none()
        if preference is None:
            preference = NotificationPreference(user_id=user_id, tenant_id=tenant_id)
            self.db.add(preference)
            await self.db.flush()
        return preference

    async def update_preferences(self, user_id: UUID, tenant_id: UUID | None, preferences: dict):
        preference = await self.get_preferences(user_id, tenant_id)
        for field in (
            "push_enabled",
            "message_received",
            "listing_interest_received",
            "registration_decision",
            "urgent_listing_published",
        ):
            if field in preferences:
                setattr(preference, field, preferences[field])
        await self.db.flush()
        return preference
