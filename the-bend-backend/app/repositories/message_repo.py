from uuid import UUID
from datetime import datetime
from sqlalchemy import select, func, or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import MessageThread, Message
from app.core.pagination import encode_cursor, decode_cursor, PaginatedResult


class MessageRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_threads(self, user_id: UUID, cursor: str | None = None, limit: int = 20) -> PaginatedResult:
        query = (
            select(MessageThread)
            .where(
                or_(
                    MessageThread.participant_a == user_id,
                    MessageThread.participant_b == user_id,
                )
            )
            .order_by(MessageThread.last_message_at.desc().nullslast())
        )

        if cursor:
            cursor_data = decode_cursor(cursor)
            if "last_message_at" in cursor_data:
                cursor_time = datetime.fromisoformat(cursor_data["last_message_at"])
                query = query.where(MessageThread.last_message_at < cursor_time)

        query = query.limit(limit + 1)
        result = await self.session.execute(query)
        threads = list(result.scalars().all())

        has_more = len(threads) > limit
        if has_more:
            threads = threads[:limit]

        next_cursor = None
        if has_more and threads:
            last = threads[-1]
            next_cursor = encode_cursor({"last_message_at": last.last_message_at})

        return PaginatedResult(items=threads, next_cursor=next_cursor, has_more=has_more)

    async def get_thread_messages(
        self, thread_id: UUID, cursor: str | None = None, limit: int = 50
    ) -> PaginatedResult:
        query = (
            select(Message)
            .where(Message.thread_id == thread_id)
            .order_by(Message.created_at.desc())
        )

        if cursor:
            cursor_data = decode_cursor(cursor)
            if "created_at" in cursor_data:
                cursor_time = datetime.fromisoformat(cursor_data["created_at"])
                query = query.where(Message.created_at < cursor_time)

        query = query.limit(limit + 1)
        result = await self.session.execute(query)
        messages = list(result.scalars().all())

        has_more = len(messages) > limit
        if has_more:
            messages = messages[:limit]

        next_cursor = None
        if has_more and messages:
            last = messages[-1]
            next_cursor = encode_cursor({"created_at": last.created_at})

        return PaginatedResult(items=messages, next_cursor=next_cursor, has_more=has_more)

    async def create_message(self, thread_id: UUID, sender_id: UUID, content: str) -> Message:
        from uuid import uuid4
        msg = Message(id=uuid4(), thread_id=thread_id, sender_id=sender_id, content=content)
        self.session.add(msg)

        # Update thread last_message_at
        thread_result = await self.session.execute(
            select(MessageThread).where(MessageThread.id == thread_id)
        )
        thread = thread_result.scalar_one_or_none()
        if thread:
            thread.last_message_at = datetime.utcnow()

        await self.session.flush()
        await self.session.refresh(msg)
        return msg

    async def mark_thread_read(self, thread_id: UUID, user_id: UUID) -> int:
        result = await self.session.execute(
            update(Message)
            .where(
                Message.thread_id == thread_id,
                Message.sender_id != user_id,
                Message.read_at.is_(None),
            )
            .values(read_at=datetime.utcnow())
        )
        await self.session.flush()
        return result.rowcount

    async def get_unread_count(self, user_id: UUID) -> int:
        # Get all threads for user
        thread_result = await self.session.execute(
            select(MessageThread.id).where(
                or_(
                    MessageThread.participant_a == user_id,
                    MessageThread.participant_b == user_id,
                )
            )
        )
        thread_ids = [row[0] for row in thread_result.all()]
        if not thread_ids:
            return 0

        result = await self.session.execute(
            select(func.count()).select_from(Message).where(
                Message.thread_id.in_(thread_ids),
                Message.sender_id != user_id,
                Message.read_at.is_(None),
            )
        )
        return result.scalar_one()

    async def get_thread_by_id(self, thread_id: UUID) -> MessageThread | None:
        result = await self.session.execute(
            select(MessageThread).where(MessageThread.id == thread_id)
        )
        return result.scalar_one_or_none()

    async def is_participant(self, thread_id: UUID, user_id: UUID) -> bool:
        thread = await self.get_thread_by_id(thread_id)
        if not thread:
            return False
        return user_id in (thread.participant_a, thread.participant_b)

    async def get_unread_count_for_thread(self, thread_id: UUID, user_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count()).select_from(Message).where(
                Message.thread_id == thread_id,
                Message.sender_id != user_id,
                Message.read_at.is_(None),
            )
        )
        return result.scalar_one()
