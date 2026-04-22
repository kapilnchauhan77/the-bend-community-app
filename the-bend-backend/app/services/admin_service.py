from uuid import UUID
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.shop import Shop
from app.models.listing import Listing
from app.models.user import User
from app.models.enums import ShopStatus, ListingStatus, UrgencyLevel, ListingCategory, NotificationType
from app.core.exceptions import NotFoundError
from app.services.notification_service import NotificationService


class AdminService:
    def __init__(self, db: AsyncSession, tenant_id=None):
        self.db = db
        self.tenant_id = tenant_id

    def _tenant_filter(self, model):
        """Return a tenant filter clause for models with tenant_id."""
        if self.tenant_id and hasattr(model, 'tenant_id'):
            return model.tenant_id == self.tenant_id
        return True  # no-op filter

    async def get_dashboard(self) -> dict:
        pending = await self.db.execute(
            select(func.count()).select_from(Shop).where(Shop.status == ShopStatus.PENDING, self._tenant_filter(Shop))
        )
        active_shops = await self.db.execute(
            select(func.count()).select_from(Shop).where(Shop.status == ShopStatus.ACTIVE, self._tenant_filter(Shop))
        )
        active_listings = await self.db.execute(
            select(func.count()).select_from(Listing).where(Listing.status == ListingStatus.ACTIVE, self._tenant_filter(Listing))
        )
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        fulfilled = await self.db.execute(
            select(func.count()).select_from(Listing).where(
                Listing.status == ListingStatus.FULFILLED, Listing.fulfilled_at >= month_start, self._tenant_filter(Listing)
            )
        )

        # Listings by category
        cat_result = await self.db.execute(
            select(Listing.category, func.count()).where(
                Listing.status == ListingStatus.ACTIVE, self._tenant_filter(Listing)
            ).group_by(Listing.category)
        )
        by_category = {row[0].value if hasattr(row[0], 'value') else str(row[0]): row[1] for row in cat_result.all()}

        # Recent registrations
        recent_regs = await self.db.execute(
            select(Shop).where(Shop.status == ShopStatus.PENDING, self._tenant_filter(Shop)).order_by(Shop.created_at.desc()).limit(5)
        )
        regs = [{"id": str(s.id), "name": s.name, "business_type": s.business_type, "created_at": str(s.created_at)} for s in recent_regs.scalars().all()]

        # Recent listings
        recent_list = await self.db.execute(
            select(Listing).where(self._tenant_filter(Listing)).order_by(Listing.created_at.desc()).limit(5)
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
        query = select(Shop).where(self._tenant_filter(Shop)).order_by(Shop.created_at.desc())
        if status == 'pending':
            query = query.where(Shop.status == ShopStatus.PENDING, Shop.rejection_reason.is_(None))
        elif status == 'approved':
            query = query.where(Shop.status == ShopStatus.ACTIVE)
        elif status == 'rejected':
            query = query.where(Shop.rejection_reason.isnot(None))
        elif status:
            query = query.where(Shop.status == status)
        query = query.limit(limit)
        result = await self.db.execute(query)
        shops = result.scalars().all()
        items = []
        for s in shops:
            admin_result = await self.db.execute(select(User).where(User.id == s.admin_user_id))
            admin = admin_result.scalar_one_or_none()
            # Map backend status to frontend-friendly status
            display_status = s.status.value
            if s.rejection_reason:
                display_status = "rejected"
            elif s.status == ShopStatus.ACTIVE:
                display_status = "approved"

            items.append({
                "id": str(s.id), "name": s.name, "business_type": s.business_type,
                "status": display_status, "address": s.address,
                "contact_phone": s.contact_phone, "whatsapp": s.whatsapp,
                "created_at": str(s.created_at),
                "admin": {"name": admin.name, "email": admin.email} if admin else None,
                "rejection_reason": s.rejection_reason,
            })
        return {"items": items, "next_cursor": None, "has_more": False}

    async def get_registration_counts(self):
        from sqlalchemy import func
        pending = await self.db.execute(
            select(func.count()).select_from(Shop).where(Shop.status == ShopStatus.PENDING, Shop.rejection_reason.is_(None), self._tenant_filter(Shop))
        )
        approved = await self.db.execute(
            select(func.count()).select_from(Shop).where(Shop.status == ShopStatus.ACTIVE, self._tenant_filter(Shop))
        )
        rejected = await self.db.execute(
            select(func.count()).select_from(Shop).where(Shop.rejection_reason.isnot(None), self._tenant_filter(Shop))
        )
        return {
            "pending": pending.scalar_one(),
            "approved": approved.scalar_one(),
            "rejected": rejected.scalar_one(),
        }

    async def approve_registration(self, shop_id: UUID):
        result = await self.db.execute(select(Shop).where(Shop.id == shop_id))
        shop = result.scalar_one_or_none()
        if not shop:
            raise NotFoundError("Shop")
        shop.status = ShopStatus.ACTIVE
        await self.db.flush()
        try:
            notification_service = NotificationService(self.db)
            await notification_service.notify(
                user_id=shop.admin_user_id,
                type=NotificationType.REGISTRATION_APPROVED,
                title="Registration Approved!",
                body=f"Your business '{shop.name}' has been approved. You can now post listings and connect with the community.",
                data={"shop_id": str(shop.id)},
            )
        except Exception:
            pass
        try:
            from app.services.email_service import email_service
            admin_result = await self.db.execute(select(User).where(User.id == shop.admin_user_id))
            admin = admin_result.scalar_one_or_none()
            if admin:
                email_service.send_registration_approved_email(admin.email, admin.name, shop.name)
        except Exception:
            pass
        return shop

    async def reject_registration(self, shop_id: UUID, reason: str):
        result = await self.db.execute(select(Shop).where(Shop.id == shop_id))
        shop = result.scalar_one_or_none()
        if not shop:
            raise NotFoundError("Shop")
        shop.rejection_reason = reason
        await self.db.flush()
        try:
            notification_service = NotificationService(self.db)
            await notification_service.notify(
                user_id=shop.admin_user_id,
                type=NotificationType.REGISTRATION_REJECTED,
                title="Registration Not Approved",
                body=f"Your business '{shop.name}' registration was not approved. Reason: {reason}",
                data={"shop_id": str(shop.id)},
            )
        except Exception:
            pass
        try:
            from app.services.email_service import email_service
            admin_result = await self.db.execute(select(User).where(User.id == shop.admin_user_id))
            admin = admin_result.scalar_one_or_none()
            if admin:
                email_service.send_registration_rejected_email(admin.email, admin.name, shop.name, reason)
        except Exception:
            pass
        return shop

    async def get_shops(self, status=None, search=None, cursor=None, limit=20):
        query = select(Shop).where(self._tenant_filter(Shop)).order_by(Shop.created_at.desc())
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
        try:
            notification_service = NotificationService(self.db)
            await notification_service.notify(
                user_id=shop.admin_user_id,
                type=NotificationType.SHOP_SUSPENDED,
                title="Business Suspended",
                body=f"Your business '{shop.name}' has been suspended. Reason: {reason}",
                data={"shop_id": str(shop.id)},
            )
        except Exception:
            pass
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
        query = select(Listing).where(self._tenant_filter(Listing)).order_by(Listing.created_at.desc())
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
            select(func.count()).select_from(Shop).where(Shop.created_at >= since, self._tenant_filter(Shop))
        )
        active = await self.db.execute(
            select(func.count()).select_from(Listing).where(Listing.status == ListingStatus.ACTIVE, Listing.created_at >= since, self._tenant_filter(Listing))
        )
        fulfilled = await self.db.execute(
            select(func.count()).select_from(Listing).where(Listing.status == ListingStatus.FULFILLED, Listing.fulfilled_at >= since, self._tenant_filter(Listing))
        )
        cat_result = await self.db.execute(
            select(Listing.category, func.count()).where(Listing.status == ListingStatus.ACTIVE, self._tenant_filter(Listing)).group_by(Listing.category)
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
