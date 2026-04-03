from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.repositories.message_repo import MessageRepository
from app.models.message import Message
from app.models.user import User
from app.models.shop import Shop
from app.models.listing import Listing
from app.core.exceptions import ForbiddenError


class MessageService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.message_repo = MessageRepository(db)

    async def get_threads(self, user_id: UUID, cursor=None, limit=20):
        result = await self.message_repo.get_threads(user_id, cursor, limit)

        enriched = []
        for thread in result.items:
            other_id = thread.participant_b if thread.participant_a == user_id else thread.participant_a

            # Get other party info
            user_result = await self.db.execute(select(User).where(User.id == other_id))
            other_user = user_result.scalar_one_or_none()

            shop_name = ""
            if other_user and other_user.shop_id:
                shop_result = await self.db.execute(select(Shop).where(Shop.id == other_user.shop_id))
                shop = shop_result.scalar_one_or_none()
                shop_name = shop.name if shop else ""

            # Get last message
            last_msg = None
            msg_result = await self.db.execute(
                select(Message).where(Message.thread_id == thread.id).order_by(Message.created_at.desc()).limit(1)
            )
            last_message = msg_result.scalar_one_or_none()
            if last_message:
                last_msg = {
                    "content": last_message.content,
                    "sender_id": str(last_message.sender_id),
                    "created_at": str(last_message.created_at),
                }

            # Get listing info
            listing_info = None
            if thread.listing_id:
                listing_result = await self.db.execute(select(Listing).where(Listing.id == thread.listing_id))
                listing = listing_result.scalar_one_or_none()
                if listing:
                    listing_info = {"id": str(listing.id), "title": listing.title, "urgency": listing.urgency.value}

            unread = await self.message_repo.get_unread_count_for_thread(thread.id, user_id)

            enriched.append({
                "id": str(thread.id),
                "listing": listing_info,
                "other_party": {
                    "id": str(other_id),
                    "name": other_user.name if other_user else "Unknown",
                    "shop_name": shop_name,
                },
                "last_message": last_msg,
                "unread_count": unread,
                "last_message_at": str(thread.last_message_at) if thread.last_message_at else None,
            })

        return {"items": enriched, "next_cursor": result.next_cursor, "has_more": result.has_more}

    async def get_thread_messages(self, thread_id: UUID, user_id: UUID, cursor=None, limit=50):
        if not await self.message_repo.is_participant(thread_id, user_id):
            raise ForbiddenError("Not a participant of this thread")

        # Mark as read
        await self.message_repo.mark_thread_read(thread_id, user_id)

        result = await self.message_repo.get_thread_messages(thread_id, cursor, limit)
        messages = [{
            "id": str(m.id), "thread_id": str(m.thread_id),
            "sender_id": str(m.sender_id), "content": m.content,
            "read_at": str(m.read_at) if m.read_at else None,
            "created_at": str(m.created_at),
        } for m in result.items]

        return {"items": messages, "next_cursor": result.next_cursor, "has_more": result.has_more}

    async def send_message(self, thread_id: UUID, sender_id: UUID, content: str):
        if not await self.message_repo.is_participant(thread_id, sender_id):
            raise ForbiddenError("Not a participant of this thread")
        msg = await self.message_repo.create_message(thread_id, sender_id, content)
        # TODO: Push notification + WebSocket broadcast (Phase 6)
        return msg

    async def get_unread_count(self, user_id: UUID) -> int:
        return await self.message_repo.get_unread_count(user_id)
