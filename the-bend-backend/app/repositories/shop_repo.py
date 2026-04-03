from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.base import BaseRepository
from app.models.shop import Shop
from app.models.listing import Listing
from app.models.enums import ListingStatus


class ShopRepository(BaseRepository[Shop]):
    def __init__(self, session: AsyncSession):
        super().__init__(Shop, session)

    async def get_by_admin_user(self, user_id: UUID) -> Shop | None:
        result = await self.session.execute(
            select(Shop).where(Shop.admin_user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_with_stats(self, shop_id: UUID) -> dict | None:
        shop = await self.get_by_id(shop_id)
        if not shop:
            return None

        # Count active listings
        active_count = await self.session.execute(
            select(func.count()).select_from(Listing).where(
                Listing.shop_id == shop_id,
                Listing.status == ListingStatus.ACTIVE,
            )
        )
        # Count fulfilled
        fulfilled_count = await self.session.execute(
            select(func.count()).select_from(Listing).where(
                Listing.shop_id == shop_id,
                Listing.status == ListingStatus.FULFILLED,
            )
        )

        return {
            "shop": shop,
            "active_listings_count": active_count.scalar_one(),
            "total_fulfilled": fulfilled_count.scalar_one(),
        }
