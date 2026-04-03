from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_user, get_current_user_optional, Permission
from app.models.user import User
from app.models.enums import UserRole
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
        shop=ShopSummary(id=str(shop.id), name=shop.name, business_type=shop.business_type),
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
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: ListingService = Depends(get_listing_service),
):
    result = await service.browse_listings(
        category=category, type=type, urgency=urgency,
        is_free=is_free, search=search, sort=sort,
        cursor=cursor, limit=limit,
    )
    items = [_serialize_listing(l) for l in result.items]
    return ListingListResponse(items=items, next_cursor=result.next_cursor, has_more=result.has_more)


@router.get("/{listing_id}")
async def get_listing(
    listing_id: UUID,
    service: ListingService = Depends(get_listing_service),
    current_user: User | None = Depends(get_current_user_optional),
):
    listing, viewer_has_interest = await service.get_listing(listing_id, current_user)
    data = _serialize_listing(listing)
    shop = listing.shop
    return {
        **data.model_dump(),
        "shop": {
            "id": str(shop.id),
            "name": shop.name,
            "business_type": shop.business_type,
            "contact_phone": shop.contact_phone,
            "whatsapp": shop.whatsapp,
            "address": shop.address,
        },
        "viewer_has_interest": viewer_has_interest,
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


@router.delete("/{listing_id}")
async def delete_listing(
    listing_id: UUID,
    service: ListingService = Depends(get_listing_service),
    current_user: User = Depends(get_current_user),
):
    await service.delete_listing(listing_id, current_user)
    return {"status": "deleted"}
