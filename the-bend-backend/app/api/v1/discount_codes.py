from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_tenant, get_current_user
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.discount_code import (
    DiscountCodeCreate,
    DiscountCodeResponse,
    DiscountCodeUpdate,
)
from app.services.discount_code_service import DiscountCodeService

router = APIRouter(prefix="/discount-codes", tags=["Discount Codes"])


class SponsorCodeLookupRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=40)


def get_service(db: AsyncSession = Depends(get_db)) -> DiscountCodeService:
    return DiscountCodeService(db)


# -------- owner-side endpoints --------


@router.get("")
@router.get("/mine")
async def list_my_discount_codes(
    service: DiscountCodeService = Depends(get_service),
    current_user: User = Depends(get_current_user),
):
    """List discount codes owned by the current user (shop OR personal)."""
    rows = await service.list_mine(current_user)
    return [DiscountCodeResponse.model_validate(r).model_dump() for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_discount_code(
    data: DiscountCodeCreate,
    service: DiscountCodeService = Depends(get_service),
    current_user: User = Depends(get_current_user),
):
    row = await service.create(data, current_user)
    return DiscountCodeResponse.model_validate(row).model_dump()


@router.put("/{code_id}")
async def update_discount_code(
    code_id: UUID,
    data: DiscountCodeUpdate,
    service: DiscountCodeService = Depends(get_service),
    current_user: User = Depends(get_current_user),
):
    row = await service.update(code_id, data, current_user)
    return DiscountCodeResponse.model_validate(row).model_dump()


@router.delete("/{code_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_discount_code(
    code_id: UUID,
    service: DiscountCodeService = Depends(get_service),
    current_user: User = Depends(get_current_user),
):
    await service.delete(code_id, current_user)
    return None


# -------- public endpoints --------


@router.post("/{code_id}/use")
async def mark_discount_code_used(
    code_id: UUID,
    service: DiscountCodeService = Depends(get_service),
):
    """Public 'I used this' click. Atomically increments usage_count.

    Returns 410 GONE with `{detail: "Code is no longer available"}` if the
    code is inactive, expired, or has reached max_uses.
    """
    row = await service.mark_used(code_id)
    return {"id": str(row.id), "usage_count": row.usage_count}


@router.get("/by-user/{user_id}")
async def list_discount_codes_for_user(
    user_id: UUID,
    service: DiscountCodeService = Depends(get_service),
):
    """Public list of active, unexpired, non-exhausted codes posted by a user."""
    rows = await service.list_for_user(user_id)
    return [DiscountCodeResponse.model_validate(r).model_dump() for r in rows]


@router.post("/sponsor-lookup")
async def lookup_sponsor_code(
    body: SponsorCodeLookupRequest,
    service: DiscountCodeService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    """Public lookup for a sponsor-slot coupon by code.

    Tenant is resolved from request state (the same path used by the rest
    of the public sponsor flow). Returns the coupon when redeemable, or
    404 when missing / inactive / expired / exhausted / wrong tenant.
    No auth required — the sponsor checkout flow itself is public.
    """
    row = await service.lookup_sponsor_code(body.code, tenant.id if tenant else None)
    if row is None:
        raise HTTPException(status_code=404, detail="Code not found or no longer valid")
    return DiscountCodeResponse.model_validate(row).model_dump()


@router.post("/event-lookup")
async def lookup_event_code(
    body: SponsorCodeLookupRequest,
    service: DiscountCodeService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    """Public lookup for an event-posting coupon by code. Mirrors
    /sponsor-lookup but filters coupon_type='event'."""
    row = await service.lookup_event_code(body.code, tenant.id if tenant else None)
    if row is None:
        raise HTTPException(status_code=404, detail="Code not found or no longer valid")
    return DiscountCodeResponse.model_validate(row).model_dump()
