from pydantic import BaseModel, Field
from typing import Optional


class TenantCreate(BaseModel):
    slug: str = Field(..., min_length=2, max_length=63, pattern=r"^[a-z0-9][a-z0-9-]*$")
    subdomain: str = Field(..., max_length=100)
    display_name: str = Field(..., min_length=2, max_length=150)
    tagline: Optional[str] = None
    about_text: Optional[str] = None
    hero_image_url: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: str = "hsl(160,25%,24%)"
    footer_text: Optional[str] = None


class TenantUpdate(BaseModel):
    slug: Optional[str] = Field(None, min_length=2, max_length=63, pattern=r"^[a-z0-9][a-z0-9-]*$")
    subdomain: Optional[str] = Field(None, max_length=100)
    display_name: Optional[str] = Field(None, min_length=2, max_length=150)
    tagline: Optional[str] = None
    about_text: Optional[str] = None
    hero_image_url: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    footer_text: Optional[str] = None
    sponsor_strip_label: Optional[str] = Field(None, max_length=150)
    is_active: Optional[bool] = None


class TenantSelfUpdate(BaseModel):
    """Limited fields a community admin can edit on their own tenant."""
    display_name: Optional[str] = Field(None, min_length=2, max_length=150)
    tagline: Optional[str] = None
    about_text: Optional[str] = None
    hero_image_url: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    footer_text: Optional[str] = None
    sponsor_strip_label: Optional[str] = Field(None, max_length=150)


class TenantResponse(BaseModel):
    id: str
    slug: str
    subdomain: str
    display_name: str
    tagline: Optional[str] = None
    about_text: Optional[str] = None
    hero_image_url: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: str
    footer_text: Optional[str] = None
    sponsor_strip_label: Optional[str] = None
    is_active: bool
    created_at: str
    updated_at: str


class TenantPublicResponse(BaseModel):
    """Public tenant info for branding (no admin fields)."""
    slug: str
    display_name: str
    tagline: Optional[str] = None
    about_text: Optional[str] = None
    hero_image_url: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: str
    footer_text: Optional[str] = None
    sponsor_strip_label: Optional[str] = None


class TenantAdminCreate(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=8)
    name: str = Field(..., max_length=100)


class TenantStatsResponse(BaseModel):
    tenant_id: str
    active_shops: int
    active_listings: int
    total_users: int
    total_events: int


class TenantStripeUpdate(BaseModel):
    """Per-tenant Stripe credential update. Empty/None → use env fallback."""
    stripe_secret_key: Optional[str] = Field(None, max_length=255)
    stripe_publishable_key: Optional[str] = Field(None, max_length=255)
    stripe_webhook_secret: Optional[str] = Field(None, max_length=255)


class TenantStripeStatus(BaseModel):
    """Masked Stripe credential status for admin UI."""
    stripe_configured: bool
    stripe_publishable_key: str
    stripe_secret_key_masked: str
    stripe_webhook_configured: bool
    source: str  # "tenant" | "env" | "mixed" | "none"
