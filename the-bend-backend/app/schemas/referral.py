from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal


class ReferralCreate(BaseModel):
    referred_name: str = Field(..., min_length=2, max_length=150)
    referred_email: EmailStr
    referred_county_name: str = Field(..., min_length=2, max_length=150)
    referred_message: Optional[str] = Field(None, max_length=2000)


class ReferralAdvance(BaseModel):
    """Super admin moves a referral through the funnel."""
    status: Literal['pending', 'contacted', 'demo_scheduled', 'launched', 'expired']
    super_admin_notes: Optional[str] = None
    resulting_tenant_id: Optional[str] = None  # required when status=launched


class ReferralResponse(BaseModel):
    id: str
    referrer_tenant_id: str
    referrer_tenant_name: Optional[str] = None
    referrer_user_id: Optional[str] = None
    referrer_user_name: Optional[str] = None
    referred_email: str
    referred_name: str
    referred_county_name: str
    referred_message: Optional[str] = None
    status: str
    reward_type: str
    reward_amount: Optional[int] = None
    reward_granted_at: Optional[str] = None
    resulting_tenant_id: Optional[str] = None
    super_admin_notes: Optional[str] = None
    created_at: str
    updated_at: str
