"""Community-admin endpoints for refer-a-county program."""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.exceptions import ForbiddenError
from app.core.permissions import Permission
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.referral import ReferralCreate
from app.services.referral_service import ReferralService

router = APIRouter(prefix="/referrals", tags=["referrals"])


@router.get("")
async def list_my_referrals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(Permission.require_community_admin()),
):
    """List referrals submitted by the current user's tenant."""
    if not current_user.tenant_id:
        raise ForbiddenError("No tenant context")
    svc = ReferralService(db)
    refs = await svc.list_for_tenant(current_user.tenant_id)
    items = [await svc.to_response(r) for r in refs]
    # Aggregate reward summary
    launched = [r for r in refs if r.reward_granted_at]
    total_reward_months = sum(r.reward_amount or 0 for r in launched if r.reward_type.value == "free_months")
    return {
        "items": items,
        "summary": {
            "total_referrals": len(refs),
            "launched": len(launched),
            "free_months_earned": total_reward_months,
        },
    }


@router.post("", status_code=201)
async def create_referral(
    data: ReferralCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(Permission.require_community_admin()),
):
    """Community admin submits a new referral lead."""
    if not current_user.tenant_id:
        raise ForbiddenError("No tenant context")
    svc = ReferralService(db)
    ref = await svc.create(current_user.tenant_id, current_user.id, data)

    # Send warm-intro email to the lead (best-effort)
    try:
        from app.services.email_service import email_service
        from sqlalchemy import select
        from app.models.tenant import Tenant as TenantModel
        t = (await db.execute(select(TenantModel).where(TenantModel.id == current_user.tenant_id))).scalar_one_or_none()
        referrer_county = t.display_name if t else "a community admin"
        email_service.send_referral_intro_email(
            to_email=data.referred_email,
            referred_name=data.referred_name,
            referrer_name=current_user.name,
            referrer_county=referrer_county,
            note=data.referred_message,
        )
    except Exception:
        pass

    return await svc.to_response(ref)
