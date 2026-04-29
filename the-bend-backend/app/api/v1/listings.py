from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_db
from app.core.permissions import get_current_user, get_current_user_optional, get_current_tenant, Permission
from app.models.user import User
from app.models.tenant import Tenant
from app.models.enums import UserRole
from app.models.saved_listing import SavedListing
from app.services.listing_service import ListingService
from app.schemas.listing import (
    ListingCreate, ListingUpdate, ListingResponse, ListingDetailResponse,
    ListingListResponse, ShopSummary, ShopDetailSummary, ImageResponse,
)

router = APIRouter(prefix="/listings", tags=["Listings"])


def get_listing_service(db: AsyncSession = Depends(get_db)) -> ListingService:
    return ListingService(db)


def _serialize_listing(listing, viewer_has_interest: bool = False) -> ListingResponse:
    shop = listing.shop
    images = [ImageResponse(url=img.url, thumbnail_url=img.thumbnail_url) for img in (listing.images or [])]
    return ListingResponse(
        id=str(listing.id),
        shop=ShopSummary(id=str(shop.id), name=shop.name, business_type=shop.business_type, avatar_url=shop.avatar_url),
        type=listing.type.value if hasattr(listing.type, "value") else listing.type,
        category=listing.category.value if hasattr(listing.category, "value") else listing.category,
        title=listing.title,
        description=listing.description,
        quantity=listing.quantity,
        unit=listing.unit,
        expiry_date=listing.expiry_date,
        price=float(listing.price) if listing.price else None,
        is_free=listing.is_free,
        urgency=listing.urgency.value if hasattr(listing.urgency, "value") else listing.urgency,
        status=listing.status.value if hasattr(listing.status, "value") else listing.status,
        interest_count=listing.interest_count,
        images=images,
        created_at=listing.created_at,
    )


@router.get("", response_model=ListingListResponse)
async def browse_listings(
    category: str | None = Query(None),
    type: str | None = Query(None),
    urgency: str | None = Query(None),
    is_free: bool | None = Query(None),
    search: str | None = Query(None),
    sort: str = Query("urgency_desc"),
    status: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: ListingService = Depends(get_listing_service),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    tenant_id = tenant.id if tenant else None
    result = await service.browse_listings(
        category=category, type=type, urgency=urgency,
        is_free=is_free, search=search, sort=sort,
        status=status, cursor=cursor, limit=limit,
        tenant_id=tenant_id,
    )
    items = [_serialize_listing(l) for l in result.items]
    return ListingListResponse(items=items, next_cursor=result.next_cursor, has_more=result.has_more)


@router.get("/saved")
async def get_saved_listings(
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user's saved listings."""
    from sqlalchemy.orm import selectinload
    from app.models.listing import Listing
    query = (
        select(Listing)
        .join(SavedListing, SavedListing.listing_id == Listing.id)
        .options(selectinload(Listing.shop), selectinload(Listing.images))
        .where(SavedListing.user_id == current_user.id)
        .order_by(SavedListing.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    items = list(result.scalars().unique().all())
    return {
        "items": [_serialize_listing(l).model_dump() for l in items],
        "has_more": False,
    }


@router.post("/{listing_id}/report")
async def report_listing(
    listing_id: UUID,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Report an inappropriate listing."""
    from sqlalchemy import select
    from app.models.report import Report
    from app.models.listing import Listing
    # Check listing exists
    listing = await db.execute(select(Listing).where(Listing.id == listing_id))
    if not listing.scalar_one_or_none():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Listing not found")

    # Check if already reported by this user
    existing = await db.execute(
        select(Report).where(Report.listing_id == listing_id, Report.reporter_id == current_user.id)
    )
    if existing.scalar_one_or_none():
        return {"status": "already_reported"}

    report = Report(
        id=uuid4(),
        listing_id=listing_id,
        reporter_id=current_user.id,
        reason=data.get("reason", "other"),
        details=data.get("details"),
    )
    db.add(report)
    await db.flush()

    # Notify admins
    try:
        from app.services.notification_service import NotificationService
        from app.models.enums import NotificationType, UserRole
        notification_service = NotificationService(db)
        # Scope notifications to same tenant as reporter
        admin_query = select(User).where(User.role == UserRole.COMMUNITY_ADMIN, User.is_active == True)
        if current_user.tenant_id:
            admin_query = admin_query.where(User.tenant_id == current_user.tenant_id)
        admin_result = await db.execute(admin_query)
        for admin in admin_result.scalars().all():
            await notification_service.notify(
                user_id=admin.id,
                type=NotificationType.REGISTRATION_SUBMITTED,  # Reuse type for now
                title="Post Reported",
                body=f"A listing has been reported as {data.get('reason', 'inappropriate')}: '{listing_id}'",
                data={"listing_id": str(listing_id)},
            )
    except Exception:
        pass

    return {"status": "reported"}


@router.get("/{listing_id}")
async def get_listing(
    listing_id: UUID,
    service: ListingService = Depends(get_listing_service),
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    listing, viewer_has_interest = await service.get_listing(listing_id, current_user)
    data = _serialize_listing(listing)
    shop = listing.shop

    viewer_has_saved = False
    if current_user:
        saved_result = await db.execute(
            select(SavedListing).where(
                SavedListing.user_id == current_user.id,
                SavedListing.listing_id == listing_id,
            )
        )
        viewer_has_saved = saved_result.scalar_one_or_none() is not None

    return {
        **data.model_dump(),
        "shop": {
            "id": str(shop.id),
            "name": shop.name,
            "business_type": shop.business_type,
            "contact_phone": shop.contact_phone,
            "whatsapp": shop.whatsapp,
            "address": shop.address,
            "avatar_url": shop.avatar_url,
        },
        "viewer_has_interest": viewer_has_interest,
        "viewer_has_saved": viewer_has_saved,
        "views_count": listing.views_count,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_listing(
    data: ListingCreate,
    service: ListingService = Depends(get_listing_service),
    current_user: User = Depends(Permission.require_shop_admin()),
):
    listing = await service.create_listing(data, current_user)
    return {"id": str(listing.id), "status": "active"}


@router.put("/{listing_id}")
async def update_listing(
    listing_id: UUID,
    data: ListingUpdate,
    service: ListingService = Depends(get_listing_service),
    current_user: User = Depends(get_current_user),
):
    listing = await service.update_listing(listing_id, data, current_user)
    return {"id": str(listing.id), "status": "updated"}


@router.patch("/{listing_id}/fulfill")
async def fulfill_listing(
    listing_id: UUID,
    service: ListingService = Depends(get_listing_service),
    current_user: User = Depends(Permission.require_shop_admin()),
):
    listing = await service.fulfill_listing(listing_id, current_user)
    return {"status": "fulfilled", "fulfilled_at": str(listing.fulfilled_at)}


@router.post("/{listing_id}/save")
async def save_listing(
    listing_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save/bookmark a listing."""
    result = await db.execute(
        select(SavedListing).where(
            SavedListing.user_id == current_user.id,
            SavedListing.listing_id == listing_id,
        )
    )
    if result.scalar_one_or_none():
        return {"status": "already_saved"}

    saved = SavedListing(id=uuid4(), user_id=current_user.id, listing_id=listing_id)
    db.add(saved)
    await db.flush()
    return {"status": "saved"}


@router.delete("/{listing_id}/save")
async def unsave_listing(
    listing_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a saved listing."""
    from sqlalchemy import delete
    await db.execute(
        delete(SavedListing).where(
            SavedListing.user_id == current_user.id,
            SavedListing.listing_id == listing_id,
        )
    )
    await db.flush()
    return {"status": "unsaved"}


@router.delete("/{listing_id}")
async def delete_listing(
    listing_id: UUID,
    service: ListingService = Depends(get_listing_service),
    current_user: User = Depends(get_current_user),
):
    await service.delete_listing(listing_id, current_user)
    return {"status": "deleted"}
