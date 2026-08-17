from app.config import get_settings
from app.core.stripe_resolver import get_stripe_keys, stripe_credentials_ready
from app.models.tenant import Tenant


def native_capabilities(tenant: Tenant | None) -> dict:
    if tenant is None:
        return None
    settings = get_settings()
    keys = get_stripe_keys(tenant)
    ready = stripe_credentials_ready(keys)
    enabled = tenant.slug == "westmoreland" and settings.NATIVE_COMMERCE_ENABLED and ready
    base = f"https://{tenant.slug}.bend.community"
    return {
        "native_commerce_enabled": enabled,
        "tenant_slug": tenant.slug,
        "support_url": f"{base}/support",
        "privacy_url": f"{base}/privacy",
        "account_deletion_url": f"{base}/delete-account",
    }
