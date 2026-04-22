"""Public tenant API — returns current tenant branding info."""
from fastapi import APIRouter, Depends, Request

from app.core.permissions import get_current_tenant
from app.models.tenant import Tenant
from app.schemas.tenant import TenantPublicResponse

router = APIRouter(prefix="/tenant", tags=["tenant"])


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
        )
    return TenantPublicResponse(
        slug=tenant.slug,
        display_name=tenant.display_name,
        tagline=tenant.tagline,
        about_text=tenant.about_text,
        hero_image_url=tenant.hero_image_url,
        logo_url=tenant.logo_url,
        primary_color=tenant.primary_color,
        footer_text=tenant.footer_text,
    )
