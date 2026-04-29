"""Public tenant API — returns current tenant branding info; community admin can update own tenant."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import get_settings
from app.core.permissions import get_current_tenant, Permission
from app.core.exceptions import ForbiddenError
from app.core.stripe_resolver import get_stripe_keys, mask
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.tenant import (
    TenantPublicResponse, TenantSelfUpdate, TenantStripeUpdate, TenantStripeStatus,
)

router = APIRouter(prefix="/tenant", tags=["tenant"])


def _to_public(tenant: Tenant) -> TenantPublicResponse:
    return TenantPublicResponse(
        slug=tenant.slug,
        display_name=tenant.display_name,
        tagline=tenant.tagline,
        about_text=tenant.about_text,
        hero_image_url=tenant.hero_image_url,
        logo_url=tenant.logo_url,
        primary_color=tenant.primary_color,
        footer_text=tenant.footer_text,
        sponsor_strip_label=tenant.sponsor_strip_label,
    )


@router.get("/current")
async def get_current_tenant_info(
    tenant: Tenant | None = Depends(get_current_tenant),
):
    if not tenant:
        return TenantPublicResponse(
            slug="westmoreland",
            display_name="The Bend — Westmoreland",
            tagline="Find opportunity within your neighborhood",
            about_text=None,
            hero_image_url="/images/the-bend-hero.jpg",
            logo_url=None,
            primary_color="hsl(160,25%,24%)",
            footer_text=None,
            sponsor_strip_label=None,
        )
    return _to_public(tenant)


@router.put("/current")
async def update_current_tenant(
    data: TenantSelfUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
    current_user: User = Depends(Permission.require_community_admin()),
):
    """Community admin updates branding of their own tenant.

    Super admins can also update via this endpoint for the resolved tenant.
    Regular community admins must belong to the resolved tenant.
    """
    if not tenant:
        raise ForbiddenError("Tenant not resolved")
    # Community admins can only edit their own tenant; super admins can edit any
    if current_user.role.value == "community_admin" and current_user.tenant_id != tenant.id:
        raise ForbiddenError("Cannot edit another tenant")

    update_data = data.model_dump(exclude_unset=True)
    # Re-attach to session — request.state.tenant came from a separate session
    fresh = await db.get(Tenant, tenant.id)
    for key, value in update_data.items():
        setattr(fresh, key, value)
    await db.flush()
    await db.refresh(fresh)
    return _to_public(fresh)


@router.get("/current/stripe-status")
async def get_stripe_status(
    tenant: Tenant | None = Depends(get_current_tenant),
    current_user: User = Depends(Permission.require_community_admin()),
):
    """Masked Stripe credential status for admin UI."""
    if not tenant:
        raise ForbiddenError("Tenant not resolved")
    if current_user.role.value == "community_admin" and current_user.tenant_id != tenant.id:
        raise ForbiddenError("Cannot view another tenant")

    settings = get_settings()
    keys = get_stripe_keys(tenant)

    # Determine source per credential
    def src(tenant_val: str | None, env_val: str) -> str:
        if tenant_val:
            return "tenant"
        if env_val:
            return "env"
        return "none"

    s_secret = src(tenant.stripe_secret_key, settings.STRIPE_SECRET_KEY)
    s_pub = src(tenant.stripe_publishable_key, settings.STRIPE_PUBLISHABLE_KEY)
    s_wh = src(tenant.stripe_webhook_secret, settings.STRIPE_WEBHOOK_SECRET)
    sources = {s_secret, s_pub, s_wh} - {"none"}
    if len(sources) == 0:
        source = "none"
    elif len(sources) == 1:
        source = sources.pop()
    else:
        source = "mixed"

    return TenantStripeStatus(
        stripe_configured=bool(keys.secret),
        stripe_publishable_key=mask(keys.publishable),
        stripe_secret_key_masked=mask(keys.secret),
        stripe_webhook_configured=bool(keys.webhook),
        source=source,
    )


@router.put("/current/stripe")
async def update_stripe_keys(
    data: TenantStripeUpdate,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
    current_user: User = Depends(Permission.require_community_admin()),
):
    """Community admin updates Stripe keys for their own tenant.

    Pass empty string to clear a field (falls back to env). Only fields included
    in the request body are touched.
    """
    if not tenant:
        raise ForbiddenError("Tenant not resolved")
    if current_user.role.value == "community_admin" and current_user.tenant_id != tenant.id:
        raise ForbiddenError("Cannot edit another tenant")

    update_data = data.model_dump(exclude_unset=True)
    fresh = await db.get(Tenant, tenant.id)
    for key, value in update_data.items():
        # Empty string → null (use env fallback)
        setattr(fresh, key, value if value else None)
    await db.flush()
    return {"message": "Stripe keys updated"}
