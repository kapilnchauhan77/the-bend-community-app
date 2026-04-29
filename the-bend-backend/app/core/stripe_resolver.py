"""Resolve Stripe credentials for the current request — tenant overrides env."""
from typing import NamedTuple

from app.config import get_settings
from app.models.tenant import Tenant


class StripeKeys(NamedTuple):
    secret: str
    publishable: str
    webhook: str


def get_stripe_keys(tenant: Tenant | None) -> StripeKeys:
    """Per-tenant keys take precedence over env-level fallback."""
    settings = get_settings()
    secret = (tenant.stripe_secret_key if tenant and tenant.stripe_secret_key else None) or settings.STRIPE_SECRET_KEY
    publishable = (tenant.stripe_publishable_key if tenant and tenant.stripe_publishable_key else None) or settings.STRIPE_PUBLISHABLE_KEY
    webhook = (tenant.stripe_webhook_secret if tenant and tenant.stripe_webhook_secret else None) or settings.STRIPE_WEBHOOK_SECRET
    return StripeKeys(secret=secret or "", publishable=publishable or "", webhook=webhook or "")


def mask(value: str | None, prefix_len: int = 12) -> str:
    """Return a masked representation safe to expose to admin clients."""
    if not value:
        return ""
    if len(value) <= prefix_len + 4:
        return value[:prefix_len] + "***"
    return value[:prefix_len] + "..." + value[-4:]
