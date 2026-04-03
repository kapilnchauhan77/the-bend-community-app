from uuid import UUID, uuid4
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.listing_repo import ListingRepository
from app.models.user import User
from app.models.enums import ListingStatus, UrgencyLevel
from app.core.exceptions import NotFoundError, ForbiddenError, BusinessRuleViolation
from app.schemas.listing import ListingCreate, ListingUpdate


class ListingService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.listing_repo = ListingRepository(db)

    async def browse_listings(self, **kwargs):
        return await self.listing_repo.browse(**kwargs)

    async def get_listing(self, listing_id: UUID, current_user=None):
        listing = await self.listing_repo.get_detail(listing_id)
        if not listing:
            raise NotFoundError("Listing")

        # Increment views (simplified - Redis dedup in Phase 8)
        await self.listing_repo.increment_views(listing_id)

        # Check viewer interest
        viewer_has_interest = False
        if current_user:
            from app.models.interest import Interest
            from sqlalchemy import select
            result = await self.db.execute(
                select(Interest).where(
                    Interest.listing_id == listing_id,
                    Interest.user_id == current_user.id,
                )
            )
            viewer_has_interest = result.scalar_one_or_none() is not None

        return listing, viewer_has_interest

    async def create_listing(self, data: ListingCreate, current_user: User):
        if not current_user.shop_id:
            raise ForbiddenError("No shop associated")

        # Check critical listing rate limit
        if data.urgency == "critical":
            critical_count = await self.listing_repo.count_active_critical(current_user.shop_id)
            if critical_count >= 2:
                raise BusinessRuleViolation("Maximum 2 active critical listings per shop")

        listing = await self.listing_repo.create({
            "id": uuid4(),
            "shop_id": current_user.shop_id,
            "type": data.type,
            "category": data.category,
            "title": data.title,
            "description": data.description,
            "quantity": data.quantity,
            "unit": data.unit,
            "expiry_date": data.expiry_date,
            "price": data.price,
            "is_free": data.is_free,
            "urgency": data.urgency,
        })

        # TODO: Broadcast notification for urgent/critical (Phase 6)
        return listing

    async def update_listing(self, listing_id: UUID, data: ListingUpdate, current_user: User):
        listing = await self.listing_repo.get_by_id(listing_id)
        if not listing:
            raise NotFoundError("Listing")

        # Ownership check
        if current_user.role.value != "community_admin" and listing.shop_id != current_user.shop_id:
            raise ForbiddenError("Cannot modify another shop's listing")

        update_data = data.model_dump(exclude_unset=True)
        return await self.listing_repo.update(listing_id, update_data)

    async def fulfill_listing(self, listing_id: UUID, current_user: User):
        listing = await self.listing_repo.get_by_id(listing_id)
        if not listing:
            raise NotFoundError("Listing")
        if listing.shop_id != current_user.shop_id:
            raise ForbiddenError("Can only fulfill your own listings")

        return await self.listing_repo.update(listing_id, {
            "status": ListingStatus.FULFILLED,
            "fulfilled_at": datetime.utcnow(),
        })

    async def delete_listing(self, listing_id: UUID, current_user: User, reason: str | None = None):
        listing = await self.listing_repo.get_by_id(listing_id)
        if not listing:
            raise NotFoundError("Listing")
        if current_user.role.value != "community_admin" and listing.shop_id != current_user.shop_id:
            raise ForbiddenError("Cannot delete another shop's listing")

        return await self.listing_repo.update(listing_id, {"status": ListingStatus.DELETED})
