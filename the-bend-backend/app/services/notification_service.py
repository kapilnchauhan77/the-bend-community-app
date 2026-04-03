from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.repositories.notification_repo import NotificationRepository
from app.models.enums import NotificationType
from app.models.push_subscription import PushSubscription
from app.core.exceptions import NotFoundError


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
        self, user_id: UUID, type: NotificationType, title: str, body: str, data: dict | None = None
    ):
        notification = await self.repo.create(user_id, type, title, body, data)
        # TODO: WebSocket delivery if online
        # TODO: Queue push notification task
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

    async def update_preferences(self, user_id: UUID, preferences: dict):
        # Store in user record as JSONB (simplified - would need migration for column)
        # For now, just return success
        pass
