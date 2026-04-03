from uuid import UUID
from datetime import datetime
from sqlalchemy import select, func, case, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.repositories.base import BaseRepository
from app.models.listing import Listing, ListingImage
from app.models.shop import Shop
from app.models.interest import Interest
from app.models.enums import ListingStatus, UrgencyLevel, ListingCategory, ListingType
from app.core.pagination import encode_cursor, decode_cursor, PaginatedResult


class ListingRepository(BaseRepository[Listing]):
    def __init__(self, session: AsyncSession):
        super().__init__(Listing, session)

    async def browse(
        self,
        category: str | None = None,
        type: str | None = None,
        urgency: str | None = None,
        is_free: bool | None = None,
        search: str | None = None,
        sort: str = "urgency_desc",
        cursor: str | None = None,
        limit: int = 20,
    ) -> PaginatedResult:
        query = (
            select(Listing)
            .options(selectinload(Listing.shop), selectinload(Listing.images))
            .where(Listing.status == ListingStatus.ACTIVE)
        )

        # Filters
        if category:
            query = query.where(Listing.category == category)
        if type:
            query = query.where(Listing.type == type)
        if urgency:
            query = query.where(Listing.urgency == urgency)
        if is_free is not None:
            query = query.where(Listing.is_free == is_free)
        if search:
            search_term = f"%{search}%"
            query = query.where(
                or_(
                    Listing.title.ilike(search_term),
                    Listing.description.ilike(search_term),
                )
            )

        # Sort
        urgency_order = case(
            (Listing.urgency == UrgencyLevel.CRITICAL, 1),
            (Listing.urgency == UrgencyLevel.URGENT, 2),
            (Listing.urgency == UrgencyLevel.NORMAL, 3),
        )

        if sort == "urgency_desc":
            query = query.order_by(urgency_order, Listing.created_at.desc())
        elif sort == "created_desc":
            query = query.order_by(Listing.created_at.desc())
        elif sort == "expiry_asc":
            query = query.order_by(Listing.expiry_date.asc().nullslast(), Listing.created_at.desc())

        # Cursor pagination
        if cursor:
            cursor_data = decode_cursor(cursor)
            if "created_at" in cursor_data:
                cursor_time = datetime.fromisoformat(cursor_data["created_at"])
                cursor_id = cursor_data.get("id", "")
                query = query.where(
                    or_(
                        Listing.created_at < cursor_time,
                        and_(Listing.created_at == cursor_time, Listing.id < cursor_id),
                    )
                )

        query = query.limit(limit + 1)
        result = await self.session.execute(query)
        items = list(result.scalars().unique().all())

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        next_cursor = None
        if has_more and items:
            last = items[-1]
            next_cursor = encode_cursor({"created_at": last.created_at, "id": last.id})

        return PaginatedResult(items=items, next_cursor=next_cursor, has_more=has_more)

    async def get_by_shop(
        self, shop_id: UUID, status: str | None = None, cursor: str | None = None, limit: int = 20
    ) -> PaginatedResult:
        filters = [Listing.shop_id == shop_id]
        if status:
            filters.append(Listing.status == status)
        return await self.get_all(filters=filters, limit=limit, cursor=cursor)

    async def get_detail(self, listing_id: UUID) -> Listing | None:
        result = await self.session.execute(
            select(Listing)
            .options(selectinload(Listing.shop), selectinload(Listing.images))
            .where(Listing.id == listing_id)
        )
        return result.scalar_one_or_none()

    async def count_active_critical(self, shop_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count()).select_from(Listing).where(
                Listing.shop_id == shop_id,
                Listing.status == ListingStatus.ACTIVE,
                Listing.urgency == UrgencyLevel.CRITICAL,
            )
        )
        return result.scalar_one()

    async def increment_views(self, listing_id: UUID):
        listing = await self.get_by_id(listing_id)
        if listing:
            listing.views_count += 1
            await self.session.flush()

    async def increment_interest_count(self, listing_id: UUID):
        listing = await self.get_by_id(listing_id)
        if listing:
            listing.interest_count += 1
            await self.session.flush()

    async def decrement_interest_count(self, listing_id: UUID):
        listing = await self.get_by_id(listing_id)
        if listing and listing.interest_count > 0:
            listing.interest_count -= 1
            await self.session.flush()
