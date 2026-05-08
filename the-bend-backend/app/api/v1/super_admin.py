"""Super Admin API — tenant management, accessible only by super_admin role."""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import Permission
from app.models.user import User
from app.services.tenant_service import TenantService
from app.schemas.tenant import (
    TenantCreate, TenantUpdate, TenantResponse,
    TenantAdminCreate, TenantStatsResponse,
)

router = APIRouter(prefix="/super-admin", tags=["super-admin"])


def _tenant_to_response(t) -> TenantResponse:
    return TenantResponse(
        id=str(t.id),
        slug=t.slug,
        subdomain=t.subdomain,
        display_name=t.display_name,
        tagline=t.tagline,
        about_text=t.about_text,
        hero_image_url=t.hero_image_url,
        logo_url=t.logo_url,
        primary_color=t.primary_color,
        footer_text=t.footer_text,
        sponsor_strip_label=t.sponsor_strip_label,
        is_active=t.is_active,
        created_at=t.created_at.isoformat(),
        updated_at=t.updated_at.isoformat(),
    )


@router.get("/tenants")
async def list_tenants(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(Permission.require_super_admin()),
):
    svc = TenantService(db)
    tenants = await svc.list_tenants()
    return {"items": [_tenant_to_response(t) for t in tenants]}


@router.post("/tenants", status_code=201)
async def create_tenant(
    data: TenantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(Permission.require_super_admin()),
):
    svc = TenantService(db)
    tenant = await svc.create_tenant(data)
    return _tenant_to_response(tenant)


@router.get("/tenants/{tenant_id}")
async def get_tenant(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(Permission.require_super_admin()),
):
    svc = TenantService(db)
    tenant = await svc.get_tenant(tenant_id)
    return _tenant_to_response(tenant)


@router.put("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: UUID,
    data: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(Permission.require_super_admin()),
):
    svc = TenantService(db)
    tenant = await svc.update_tenant(tenant_id, data)
    return _tenant_to_response(tenant)


@router.delete("/tenants/{tenant_id}")
async def deactivate_tenant(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(Permission.require_super_admin()),
):
    svc = TenantService(db)
    await svc.deactivate_tenant(tenant_id)
    return {"message": "Tenant deactivated"}


@router.post("/tenants/{tenant_id}/admin", status_code=201)
async def create_tenant_admin(
    tenant_id: UUID,
    data: TenantAdminCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(Permission.require_super_admin()),
):
    svc = TenantService(db)
    user = await svc.create_community_admin(tenant_id, data.email, data.password, data.name)
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role.value,
        "tenant_id": str(user.tenant_id),
    }


@router.get("/tenants/{tenant_id}/stats")
async def get_tenant_stats(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(Permission.require_super_admin()),
):
    svc = TenantService(db)
    return await svc.get_tenant_stats(tenant_id)


# ─── Tenant Referrals (super admin) ─────────────────────────────────────────

from app.services.referral_service import ReferralService
from app.schemas.referral import ReferralAdvance
from app.models.enums import ReferralStatus


@router.get("/referrals")
async def list_all_referrals(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(Permission.require_super_admin()),
):
    svc = ReferralService(db)
    parsed_status = ReferralStatus(status) if status else None
    refs = await svc.list_all(parsed_status)
    items = [await svc.to_response(r) for r in refs]
    return {"items": items}


@router.post("/referrals/{referral_id}/advance")
async def advance_referral(
    referral_id: UUID,
    data: ReferralAdvance,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(Permission.require_super_admin()),
):
    svc = ReferralService(db)
    ref = await svc.advance(referral_id, data)

    # Notify the referrer about a status update (best-effort)
    try:
        from app.services.email_service import email_service
        from sqlalchemy import select
        from app.models.user import User as UserModel
        if ref.referrer_user_id:
            u = (await db.execute(select(UserModel).where(UserModel.id == ref.referrer_user_id))).scalar_one_or_none()
            if u:
                email_service.send_referral_status_email(
                    to_email=u.email,
                    referrer_name=u.name,
                    referred_county_name=ref.referred_county_name,
                    new_status=ref.status.value,
                    reward_months=ref.reward_amount if ref.status == ReferralStatus.LAUNCHED else None,
                )
    except Exception:
        pass

    return await svc.to_response(ref)
