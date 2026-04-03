from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import Permission
from app.models.user import User
from app.models.enums import UserRole
from app.services.admin_service import AdminService
from app.schemas.admin import RejectRequest, SuspendRequest, AdminListingDeleteRequest

router = APIRouter(prefix="/admin", tags=["Admin"])


def get_admin_service(db: AsyncSession = Depends(get_db)):
    return AdminService(db)


@router.get("/dashboard")
async def dashboard(
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    return await service.get_dashboard()


@router.get("/registrations")
async def get_registrations(
    status: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    return await service.get_registrations(status, cursor, limit)


@router.post("/registrations/{shop_id}/approve")
async def approve_registration(
    shop_id: UUID,
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    shop = await service.approve_registration(shop_id)
    return {"id": str(shop.id), "status": "active"}


@router.post("/registrations/{shop_id}/reject")
async def reject_registration(
    shop_id: UUID, data: RejectRequest,
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    shop = await service.reject_registration(shop_id, data.reason)
    return {"id": str(shop.id), "status": "rejected"}


@router.get("/shops")
async def get_shops(
    status: str | None = Query(None),
    search: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    return await service.get_shops(status, search, cursor, limit)


@router.post("/shops/{shop_id}/suspend")
async def suspend_shop(
    shop_id: UUID, data: SuspendRequest,
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    shop = await service.suspend_shop(shop_id, data.reason)
    return {"id": str(shop.id), "status": "suspended"}


@router.post("/shops/{shop_id}/reactivate")
async def reactivate_shop(
    shop_id: UUID,
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    shop = await service.reactivate_shop(shop_id)
    return {"id": str(shop.id), "status": "active"}


@router.get("/listings")
async def get_all_listings(
    status: str | None = Query(None),
    category: str | None = Query(None),
    urgency: str | None = Query(None),
    shop_id: UUID | None = Query(None),
    search: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    return await service.get_all_listings(status, category, urgency, shop_id, search, cursor, limit)


@router.delete("/listings/{listing_id}")
async def remove_listing(
    listing_id: UUID, data: AdminListingDeleteRequest,
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    await service.remove_listing(listing_id, data.reason)
    return {"status": "deleted"}


@router.get("/reports")
async def get_reports(
    period: str = Query("week"),
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    return await service.get_reports(period)
