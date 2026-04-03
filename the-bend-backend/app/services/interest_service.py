from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.interest import Interest
from app.models.listing import Listing
from app.models.message import MessageThread, Message
from app.models.user import User
from app.repositories.listing_repo import ListingRepository
from app.core.exceptions import NotFoundError, ForbiddenError, ConflictError, BusinessRuleViolation


class InterestService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.listing_repo = ListingRepository(db)

    async def express_interest(self, listing_id: UUID, user_id: UUID, message: str | None = None):
        listing = await self.listing_repo.get_by_id(listing_id)
        if not listing:
            raise NotFoundError("Listing")

        # Cannot express interest in own shop's listing
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user and user.shop_id == listing.shop_id:
            raise BusinessRuleViolation("Cannot express interest in your own shop's listing")

        # Check duplicate
        existing = await self.db.execute(
            select(Interest).where(Interest.listing_id == listing_id, Interest.user_id == user_id)
        )
        if existing.scalar_one_or_none():
            raise ConflictError("Already expressed interest")

        # Create interest
        interest = Interest(id=uuid4(), listing_id=listing_id, user_id=user_id, message=message)
        self.db.add(interest)

        # Increment listing interest count
        await self.listing_repo.increment_interest_count(listing_id)

        # Auto-create message thread
        listing_owner_id = None
        from app.models.shop import Shop
        shop_result = await self.db.execute(select(Shop).where(Shop.id == listing.shop_id))
        shop = shop_result.scalar_one_or_none()
        if shop:
            listing_owner_id = shop.admin_user_id

        if listing_owner_id:
            # Check if thread already exists
            thread_result = await self.db.execute(
                select(MessageThread).where(
                    MessageThread.listing_id == listing_id,
                    ((MessageThread.participant_a == user_id) & (MessageThread.participant_b == listing_owner_id)) |
                    ((MessageThread.participant_a == listing_owner_id) & (MessageThread.participant_b == user_id))
                )
            )
            thread = thread_result.scalar_one_or_none()

            if not thread:
                thread = MessageThread(
                    id=uuid4(),
                    listing_id=listing_id,
                    participant_a=user_id,
                    participant_b=listing_owner_id,
                    last_message_at=datetime.utcnow(),
                )
                self.db.add(thread)
                await self.db.flush()

            # Send initial message if provided
            if message:
                msg = Message(
                    id=uuid4(),
                    thread_id=thread.id,
                    sender_id=user_id,
                    content=message,
                )
                self.db.add(msg)
                thread.last_message_at = datetime.utcnow()

        await self.db.flush()

        # TODO: Create notification for listing owner (Phase 6)
        return interest

    async def withdraw_interest(self, listing_id: UUID, user_id: UUID):
        result = await self.db.execute(
            select(Interest).where(Interest.listing_id == listing_id, Interest.user_id == user_id)
        )
        interest = result.scalar_one_or_none()
        if not interest:
            raise NotFoundError("Interest")
        await self.db.delete(interest)
        await self.listing_repo.decrement_interest_count(listing_id)
        await self.db.flush()
