from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db
from app.api.v1.auth import router as auth_router
from app.api.v1.listings import router as listings_router
from app.api.v1.shops import router as shops_router
from app.api.v1.messages import router as messages_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.admin import router as admin_router
from app.api.v1.upload import router as upload_router
from app.api.v1.volunteers import router as volunteers_router
from app.api.v1.talent import router as talent_router
from app.api.v1.events import router as events_router
from app.api.v1.sponsors import router as sponsors_router
from app.api.v1.advertising import router as advertising_router
from app.api.v1.stories import router as stories_router
from app.api.v1.digest import router as digest_router
from app.api.v1.super_admin import router as super_admin_router
from app.api.v1.tenant import router as tenant_router

api_router = APIRouter()

# Include sub-routers
api_router.include_router(auth_router)
api_router.include_router(listings_router)
api_router.include_router(shops_router)
api_router.include_router(messages_router)
api_router.include_router(notifications_router)
api_router.include_router(admin_router)
api_router.include_router(upload_router)
api_router.include_router(volunteers_router)
api_router.include_router(talent_router)
api_router.include_router(events_router)
api_router.include_router(sponsors_router)
api_router.include_router(advertising_router)
api_router.include_router(stories_router)
api_router.include_router(digest_router)
api_router.include_router(super_admin_router)
api_router.include_router(tenant_router)


@api_router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Health check endpoint - verifies DB connectivity."""
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"

    return {
        "status": "healthy" if db_status == "ok" else "degraded",
        "db": db_status,
    }


@api_router.get("/stats")
async def community_stats(
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Public community stats for homepage."""
    from sqlalchemy import func, select
    from app.models.shop import Shop
    from app.models.listing import Listing
    from app.models.enums import ShopStatus, ListingStatus

    tenant = getattr(request.state, "tenant", None) if request else None
    tenant_filter_shop = Shop.tenant_id == tenant.id if tenant else True
    tenant_filter_listing = Listing.tenant_id == tenant.id if tenant else True

    active_shops = (await db.execute(
        select(func.count()).select_from(Shop).where(Shop.status == ShopStatus.ACTIVE, tenant_filter_shop)
    )).scalar_one()

    active_listings = (await db.execute(
        select(func.count()).select_from(Listing).where(Listing.status == ListingStatus.ACTIVE, tenant_filter_listing)
    )).scalar_one()

    items_shared = (await db.execute(
        select(func.count()).select_from(Listing).where(Listing.status == ListingStatus.FULFILLED, tenant_filter_listing)
    )).scalar_one()

    return {
        "active_shops": active_shops,
        "active_listings": active_listings,
        "items_shared": items_shared,
    }
