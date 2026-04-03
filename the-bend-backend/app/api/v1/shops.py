from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_user, Permission
from app.models.user import User
from app.services.shop_service import ShopService
from app.services.interest_service import InterestService
from app.services.listing_service import ListingService
from app.schemas.shop import (
    ShopResponse, ShopUpdateRequest, EmployeeCreate, EmployeeUpdate, EmployeeResponse, InterestCreate,
)

router = APIRouter(tags=["Shops"])


def get_shop_service(db: AsyncSession = Depends(get_db)):
    return ShopService(db)

def get_interest_service(db: AsyncSession = Depends(get_db)):
    return InterestService(db)

def get_listing_service(db: AsyncSession = Depends(get_db)):
    return ListingService(db)


# Shop endpoints
@router.get("/shops/{shop_id}")
async def get_shop(shop_id: UUID, service: ShopService = Depends(get_shop_service)):
    result = await service.get_shop(shop_id)
    shop = result["shop"]
    return {
        "id": str(shop.id), "name": shop.name, "business_type": shop.business_type,
        "address": shop.address, "contact_phone": shop.contact_phone,
        "whatsapp": shop.whatsapp, "status": shop.status.value,
        "active_listings_count": result["active_listings_count"],
        "total_fulfilled": result["total_fulfilled"],
        "member_since": str(shop.created_at),
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
):
    result = await service.listing_repo.get_by_shop(shop_id, status=status, cursor=cursor, limit=limit)
    return {
        "items": [
            {
                "id": str(l.id),
                "title": l.title,
                "status": l.status.value,
                "urgency": l.urgency.value,
                "created_at": str(l.created_at),
            }
            for l in result.items
        ],
        "next_cursor": result.next_cursor,
        "has_more": result.has_more,
    }


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
