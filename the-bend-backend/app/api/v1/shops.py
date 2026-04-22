from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_user, get_current_user_optional, get_current_tenant, Permission
from app.models.user import User
from app.models.tenant import Tenant
from app.services.shop_service import ShopService
from app.services.interest_service import InterestService
from app.services.listing_service import ListingService
from pydantic import BaseModel
from app.schemas.shop import (
    ShopResponse, ShopUpdateRequest, EmployeeCreate, EmployeeUpdate, EmployeeResponse, InterestCreate,
)


class EndorseRequest(BaseModel):
    message: str | None = None

router = APIRouter(tags=["Shops"])


def get_shop_service(db: AsyncSession = Depends(get_db)):
    return ShopService(db)

def get_interest_service(db: AsyncSession = Depends(get_db)):
    return InterestService(db)

def get_listing_service(db: AsyncSession = Depends(get_db)):
    return ListingService(db)


# Public shop directory — MUST be before /shops/{shop_id} to avoid path conflict
@router.get("/shops")
async def list_shops(
    search: str | None = Query(None),
    business_type: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    """Public directory of active businesses, sorted by endorsement count."""
    from sqlalchemy import select, func, desc
    from app.models.shop import Shop
    from app.models.listing import Listing
    from app.models.endorsement import Endorsement
    from app.models.enums import ShopStatus, ListingStatus

    # Subquery for endorsement count
    endorsement_count = (
        select(func.count(Endorsement.id))
        .where(Endorsement.endorsed_shop_id == Shop.id)
        .correlate(Shop)
        .scalar_subquery()
        .label("endorsement_count")
    )

    query = select(Shop, endorsement_count).where(Shop.status == ShopStatus.ACTIVE)
    if tenant:
        query = query.where(Shop.tenant_id == tenant.id)

    if search:
        query = query.where(Shop.name.ilike(f"%{search}%"))
    if business_type:
        query = query.where(Shop.business_type == business_type)

    query = query.order_by(desc("endorsement_count"), Shop.name)
    query = query.limit(limit + 1)

    result = await db.execute(query)
    rows = result.all()

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    # Count active listings per shop
    shop_data = []
    for shop, endorse_count in rows:
        count_result = await db.execute(
            select(func.count()).select_from(Listing).where(
                Listing.shop_id == shop.id,
                Listing.status == ListingStatus.ACTIVE,
            )
        )
        active_count = count_result.scalar_one()

        shop_data.append({
            "id": str(shop.id),
            "name": shop.name,
            "business_type": shop.business_type,
            "address": shop.address,
            "avatar_url": shop.avatar_url,
            "contact_phone": shop.contact_phone,
            "active_listings_count": active_count,
            "endorsement_count": endorse_count or 0,
            "member_since": str(shop.created_at),
        })

    return {"items": shop_data, "has_more": has_more}


# Shop endpoints
@router.get("/shops/{shop_id}")
async def get_shop(
    shop_id: UUID,
    service: ShopService = Depends(get_shop_service),
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    result = await service.get_shop(shop_id)
    shop = result["shop"]

    # Check if current user has endorsed this shop
    viewer_has_endorsed = False
    endorsement_count = 0
    from sqlalchemy import select, func
    from app.models.endorsement import Endorsement
    if current_user and current_user.shop_id:
        e_result = await db.execute(
            select(Endorsement).where(
                Endorsement.endorser_shop_id == current_user.shop_id,
                Endorsement.endorsed_shop_id == shop_id,
            )
        )
        viewer_has_endorsed = e_result.scalar_one_or_none() is not None

    count_result = await db.execute(
        select(func.count()).select_from(Endorsement).where(Endorsement.endorsed_shop_id == shop_id)
    )
    endorsement_count = count_result.scalar_one()

    return {
        "id": str(shop.id), "name": shop.name, "business_type": shop.business_type,
        "address": shop.address, "contact_phone": shop.contact_phone,
        "whatsapp": shop.whatsapp, "status": shop.status.value,
        "avatar_url": shop.avatar_url,
        "active_listings_count": result["active_listings_count"],
        "total_fulfilled": result["total_fulfilled"],
        "member_since": str(shop.created_at),
        "viewer_has_endorsed": viewer_has_endorsed,
        "endorsement_count": endorsement_count,
    }


@router.put("/shops/{shop_id}")
async def update_shop(
    shop_id: UUID, data: ShopUpdateRequest,
    service: ShopService = Depends(get_shop_service),
    current_user: User = Depends(get_current_user),
):
    shop = await service.update_shop(shop_id, data.model_dump(exclude_unset=True), current_user)
    return {"id": str(shop.id), "status": "updated"}


@router.get("/shops/{shop_id}/listings")
async def get_shop_listings(
    shop_id: UUID,
    status: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: ListingService = Depends(get_listing_service),
    current_user: User | None = Depends(get_current_user_optional),
):
    # If no auth, only show active listings
    effective_status = status
    if not current_user:
        effective_status = "active"

    result = await service.listing_repo.get_by_shop(shop_id, status=effective_status, cursor=cursor, limit=limit)
    from app.api.v1.listings import _serialize_listing
    return {
        "items": [_serialize_listing(l).model_dump() for l in result.items],
        "next_cursor": result.next_cursor,
        "has_more": result.has_more,
    }


# Endorsement endpoints
@router.get("/shops/{shop_id}/endorsements")
async def get_endorsements(
    shop_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get all endorsements for a business (public)."""
    from sqlalchemy import select
    from app.models.endorsement import Endorsement
    from app.models.shop import Shop

    result = await db.execute(
        select(Endorsement)
        .where(Endorsement.endorsed_shop_id == shop_id)
        .order_by(Endorsement.created_at.desc())
    )
    endorsements = result.scalars().all()

    # Load endorser shop info
    items = []
    for e in endorsements:
        shop_result = await db.execute(select(Shop).where(Shop.id == e.endorser_shop_id))
        endorser = shop_result.scalar_one_or_none()
        if endorser:
            items.append({
                "id": str(e.id),
                "message": e.message,
                "created_at": str(e.created_at),
                "endorser": {
                    "id": str(endorser.id),
                    "name": endorser.name,
                    "business_type": endorser.business_type,
                    "avatar_url": endorser.avatar_url,
                },
            })

    return {"items": items, "count": len(items)}


@router.post("/shops/{shop_id}/endorse", status_code=status.HTTP_201_CREATED)
async def endorse_shop(
    shop_id: UUID,
    data: EndorseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Endorse another business. Must be a shop admin."""
    from app.models.endorsement import Endorsement
    from app.models.shop import Shop
    from app.core.exceptions import AppException

    if not current_user.shop_id:
        raise AppException(status_code=403, message="You must have a business to endorse others")

    if str(current_user.shop_id) == str(shop_id):
        raise AppException(status_code=400, message="You cannot endorse your own business")

    # Check target shop exists
    target = await db.get(Shop, shop_id)
    if not target:
        raise AppException(status_code=404, message="Business not found")

    # Check not already endorsed
    from sqlalchemy import select
    existing = await db.execute(
        select(Endorsement).where(
            Endorsement.endorser_shop_id == current_user.shop_id,
            Endorsement.endorsed_shop_id == shop_id,
        )
    )
    if existing.scalar_one_or_none():
        raise AppException(status_code=409, message="You have already endorsed this business")

    endorsement = Endorsement(
        endorser_shop_id=current_user.shop_id,
        endorsed_shop_id=shop_id,
        message=data.message,
    )
    db.add(endorsement)
    await db.commit()

    return {"id": str(endorsement.id), "status": "endorsed"}


@router.delete("/shops/{shop_id}/endorse")
async def withdraw_endorsement(
    shop_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Withdraw an endorsement."""
    from sqlalchemy import select, delete
    from app.models.endorsement import Endorsement
    from app.core.exceptions import AppException

    if not current_user.shop_id:
        raise AppException(status_code=403, message="You must have a business")

    result = await db.execute(
        select(Endorsement).where(
            Endorsement.endorser_shop_id == current_user.shop_id,
            Endorsement.endorsed_shop_id == shop_id,
        )
    )
    endorsement = result.scalar_one_or_none()
    if not endorsement:
        raise AppException(status_code=404, message="Endorsement not found")

    await db.delete(endorsement)
    await db.commit()
    return {"status": "withdrawn"}


# Employee endpoints
@router.get("/shops/{shop_id}/employees")
async def get_employees(
    shop_id: UUID, service: ShopService = Depends(get_shop_service),
    current_user: User = Depends(Permission.require_shop_admin()),
):
    employees = await service.get_employees(shop_id, current_user)
    return [EmployeeResponse.model_validate(e) for e in employees]


@router.post("/shops/{shop_id}/employees", status_code=status.HTTP_201_CREATED)
async def add_employee(
    shop_id: UUID, data: EmployeeCreate,
    service: ShopService = Depends(get_shop_service),
    current_user: User = Depends(Permission.require_shop_admin()),
):
    employee = await service.add_employee(shop_id, data.model_dump(), current_user)
    return EmployeeResponse.model_validate(employee)


@router.put("/shops/{shop_id}/employees/{employee_id}")
async def update_employee(
    shop_id: UUID, employee_id: UUID, data: EmployeeUpdate,
    service: ShopService = Depends(get_shop_service),
    current_user: User = Depends(Permission.require_shop_admin()),
):
    employee = await service.update_employee(shop_id, employee_id, data.model_dump(exclude_unset=True), current_user)
    return EmployeeResponse.model_validate(employee)


@router.delete("/shops/{shop_id}/employees/{employee_id}")
async def delete_employee(
    shop_id: UUID, employee_id: UUID,
    service: ShopService = Depends(get_shop_service),
    current_user: User = Depends(Permission.require_shop_admin()),
):
    await service.delete_employee(shop_id, employee_id, current_user)
    return {"status": "deleted"}


# Interest endpoints
@router.post("/interests", status_code=status.HTTP_201_CREATED)
async def express_interest(
    data: InterestCreate,
    service: InterestService = Depends(get_interest_service),
    current_user: User = Depends(Permission.require_shop_admin()),
):
    interest = await service.express_interest(UUID(data.listing_id), current_user.id, data.message)
    return {"id": str(interest.id), "status": "created"}


@router.delete("/interests/{listing_id}")
async def withdraw_interest(
    listing_id: UUID,
    service: InterestService = Depends(get_interest_service),
    current_user: User = Depends(get_current_user),
):
    await service.withdraw_interest(listing_id, current_user.id)
    return {"status": "withdrawn"}
