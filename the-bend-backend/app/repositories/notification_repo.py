from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.enums import NotificationType
from app.core.pagination import encode_cursor, decode_cursor, PaginatedResult


class NotificationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_for_user(
        self, user_id: UUID, cursor: str | None = None, limit: int = 20, unread_only: bool = False
    ) -> PaginatedResult:
        query = select(Notification).where(Notification.user_id == user_id).order_by(Notification.created_at.desc())
        if unread_only:
            query = query.where(Notification.is_read == False)
        if cursor:
            cursor_data = decode_cursor(cursor)
            if "created_at" in cursor_data:
                cursor_time = datetime.fromisoformat(cursor_data["created_at"])
                query = query.where(Notification.created_at < cursor_time)
        query = query.limit(limit + 1)
        result = await self.session.execute(query)
        items = list(result.scalars().all())
        has_more = len(items) > limit
        if has_more:
            items = items[:limit]
        next_cursor = None
        if has_more and items:
            next_cursor = encode_cursor({"created_at": items[-1].created_at})
        return PaginatedResult(items=items, next_cursor=next_cursor, has_more=has_more)

    async def mark_read(self, notification_id: UUID, user_id: UUID):
        await self.session.execute(
            update(Notification).where(
                Notification.id == notification_id, Notification.user_id == user_id
            ).values(is_read=True, read_at=datetime.utcnow())
        )
        await self.session.flush()

    async def mark_all_read(self, user_id: UUID) -> int:
        result = await self.session.execute(
            update(Notification).where(
                Notification.user_id == user_id, Notification.is_read == False
            ).values(is_read=True, read_at=datetime.utcnow())
        )
        await self.session.flush()
        return result.rowcount

    async def get_unread_count(self, user_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count()).select_from(Notification).where(
                Notification.user_id == user_id, Notification.is_read == False
            )
        )
        return result.scalar_one()

    async def create(
        self, user_id: UUID, type: NotificationType, title: str, body: str, data: dict | None = None
    ) -> Notification:
        notification = Notification(
            id=uuid4(), user_id=user_id, type=type, title=title, body=body, data=data
        )
        self.session.add(notification)
        await self.session.flush()
        await self.session.refresh(notification)
        return notification
