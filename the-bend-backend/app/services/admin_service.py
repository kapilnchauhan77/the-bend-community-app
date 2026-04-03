from uuid import UUID
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.shop import Shop
from app.models.listing import Listing
from app.models.user import User
from app.models.enums import ShopStatus, ListingStatus, UrgencyLevel, ListingCategory
from app.core.exceptions import NotFoundError


class AdminService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_dashboard(self) -> dict:
        pending = await self.db.execute(
            select(func.count()).select_from(Shop).where(Shop.status == ShopStatus.PENDING)
        )
        active_shops = await self.db.execute(
            select(func.count()).select_from(Shop).where(Shop.status == ShopStatus.ACTIVE)
        )
        active_listings = await self.db.execute(
            select(func.count()).select_from(Listing).where(Listing.status == ListingStatus.ACTIVE)
        )
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        fulfilled = await self.db.execute(
            select(func.count()).select_from(Listing).where(
                Listing.status == ListingStatus.FULFILLED, Listing.fulfilled_at >= month_start
            )
        )

        # Listings by category
        cat_result = await self.db.execute(
            select(Listing.category, func.count()).where(
                Listing.status == ListingStatus.ACTIVE
            ).group_by(Listing.category)
        )
        by_category = {row[0].value if hasattr(row[0], 'value') else str(row[0]): row[1] for row in cat_result.all()}

        # Recent registrations
        recent_regs = await self.db.execute(
            select(Shop).where(Shop.status == ShopStatus.PENDING).order_by(Shop.created_at.desc()).limit(5)
        )
        regs = [{"id": str(s.id), "name": s.name, "business_type": s.business_type, "created_at": str(s.created_at)} for s in recent_regs.scalars().all()]

        # Recent listings
        recent_list = await self.db.execute(
            select(Listing).order_by(Listing.created_at.desc()).limit(5)
        )
        listings = [{"id": str(l.id), "title": l.title, "urgency": l.urgency.value, "status": l.status.value, "created_at": str(l.created_at)} for l in recent_list.scalars().all()]

        return {
            "pending_registrations": pending.scalar_one(),
            "active_shops": active_shops.scalar_one(),
            "active_listings": active_listings.scalar_one(),
            "fulfilled_this_month": fulfilled.scalar_one(),
            "listings_by_category": by_category,
            "recent_registrations": regs,
            "recent_listings": listings,
        }

    async def get_registrations(self, status: str | None = None, cursor=None, limit=20):
        query = select(Shop).order_by(Shop.created_at.desc())
        if status:
            query = query.where(Shop.status == status)
        query = query.limit(limit)
        result = await self.db.execute(query)
        shops = result.scalars().all()
        items = []
        for s in shops:
            admin_result = await self.db.execute(select(User).where(User.id == s.admin_user_id))
            admin = admin_result.scalar_one_or_none()
            items.append({
                "id": str(s.id), "name": s.name, "business_type": s.business_type,
                "status": s.status.value, "address": s.address,
                "contact_phone": s.contact_phone, "whatsapp": s.whatsapp,
                "created_at": str(s.created_at),
                "admin": {"name": admin.name, "email": admin.email} if admin else None,
                "rejection_reason": s.rejection_reason,
            })
        return {"items": items, "next_cursor": None, "has_more": False}

    async def approve_registration(self, shop_id: UUID):
        result = await self.db.execute(select(Shop).where(Shop.id == shop_id))
        shop = result.scalar_one_or_none()
        if not shop:
            raise NotFoundError("Shop")
        shop.status = ShopStatus.ACTIVE
        await self.db.flush()
        # TODO: Send approval email + notification (Phase 6)
        return shop

    async def reject_registration(self, shop_id: UUID, reason: str):
        result = await self.db.execute(select(Shop).where(Shop.id == shop_id))
        shop = result.scalar_one_or_none()
        if not shop:
            raise NotFoundError("Shop")
        shop.rejection_reason = reason
        await self.db.flush()
        # TODO: Send rejection email + notification
        return shop

    async def get_shops(self, status=None, search=None, cursor=None, limit=20):
        query = select(Shop).order_by(Shop.created_at.desc())
        if status:
            query = query.where(Shop.status == status)
        if search:
            query = query.where(Shop.name.ilike(f"%{search}%"))
        query = query.limit(limit)
        result = await self.db.execute(query)
        shops = [{
            "id": str(s.id), "name": s.name, "business_type": s.business_type,
            "status": s.status.value, "created_at": str(s.created_at),
        } for s in result.scalars().all()]
        return {"items": shops, "next_cursor": None, "has_more": False}

    async def suspend_shop(self, shop_id: UUID, reason: str):
        result = await self.db.execute(select(Shop).where(Shop.id == shop_id))
        shop = result.scalar_one_or_none()
        if not shop:
            raise NotFoundError("Shop")
        shop.status = ShopStatus.SUSPENDED
        # Hide all active listings
        from sqlalchemy import update
        await self.db.execute(
            update(Listing).where(
                Listing.shop_id == shop_id, Listing.status == ListingStatus.ACTIVE
            ).values(status=ListingStatus.DELETED)
        )
        await self.db.flush()
        return shop

    async def reactivate_shop(self, shop_id: UUID):
        result = await self.db.execute(select(Shop).where(Shop.id == shop_id))
        shop = result.scalar_one_or_none()
        if not shop:
            raise NotFoundError("Shop")
        shop.status = ShopStatus.ACTIVE
        await self.db.flush()
        return shop

    async def get_all_listings(self, status=None, category=None, urgency=None, shop_id=None, search=None, cursor=None, limit=20):
        query = select(Listing).order_by(Listing.created_at.desc())
        if status: query = query.where(Listing.status == status)
        if category: query = query.where(Listing.category == category)
        if urgency: query = query.where(Listing.urgency == urgency)
        if shop_id: query = query.where(Listing.shop_id == shop_id)
        if search: query = query.where(Listing.title.ilike(f"%{search}%"))
        query = query.limit(limit)
        result = await self.db.execute(query)
        listings = [{"id": str(l.id), "title": l.title, "category": l.category.value, "urgency": l.urgency.value, "status": l.status.value, "created_at": str(l.created_at)} for l in result.scalars().all()]
        return {"items": listings, "next_cursor": None, "has_more": False}

    async def remove_listing(self, listing_id: UUID, reason: str):
        result = await self.db.execute(select(Listing).where(Listing.id == listing_id))
        listing = result.scalar_one_or_none()
        if not listing:
            raise NotFoundError("Listing")
        listing.status = ListingStatus.DELETED
        await self.db.flush()
        return listing

    async def get_reports(self, period: str = "week") -> dict:
        days = {"week": 7, "month": 30, "quarter": 90}.get(period, 7)
        since = datetime.utcnow() - timedelta(days=days)

        new_shops = await self.db.execute(
            select(func.count()).select_from(Shop).where(Shop.created_at >= since)
        )
        active = await self.db.execute(
            select(func.count()).select_from(Listing).where(Listing.status == ListingStatus.ACTIVE, Listing.created_at >= since)
        )
        fulfilled = await self.db.execute(
            select(func.count()).select_from(Listing).where(Listing.status == ListingStatus.FULFILLED, Listing.fulfilled_at >= since)
        )
        cat_result = await self.db.execute(
            select(Listing.category, func.count()).where(Listing.status == ListingStatus.ACTIVE).group_by(Listing.category)
        )
        by_category = {row[0].value if hasattr(row[0], 'value') else str(row[0]): row[1] for row in cat_result.all()}

        return {
            "period": period,
            "new_shops": new_shops.scalar_one(),
            "active_listings": active.scalar_one(),
            "fulfilled_listings": fulfilled.scalar_one(),
            "listings_by_category": by_category,
            "listings_over_time": [],
            "most_active_shops": [],
        }
