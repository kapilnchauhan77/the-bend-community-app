from pydantic import BaseModel


class NativeCapabilities(BaseModel):
    native_commerce_enabled: bool
    tenant_slug: str
    support_url: str
    privacy_url: str
    account_deletion_url: str


class CheckoutStatusResponse(BaseModel):
    status: str
    target_type: str
    target_id: str
