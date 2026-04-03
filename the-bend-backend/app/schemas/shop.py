from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class ShopResponse(BaseModel):
    id: str
    name: str
    business_type: str
    address: str | None = None
    contact_phone: str
    whatsapp: str | None = None
    status: str
    active_listings_count: int = 0
    total_fulfilled: int = 0
    member_since: str | None = None

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v): return str(v)

    @field_validator("status", mode="before")
    @classmethod
    def stringify_status(cls, v): return v.value if hasattr(v, "value") else str(v)


class ShopUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=150)
    address: str | None = None
    contact_phone: str | None = None
    whatsapp: str | None = None


class EmployeeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    role_title: str | None = None
    skills: list[str] = []
    phone: str | None = None
    is_available: bool = True


class EmployeeUpdate(BaseModel):
    name: str | None = None
    role_title: str | None = None
    skills: list[str] | None = None
    phone: str | None = None
    is_available: bool | None = None


class EmployeeResponse(BaseModel):
    id: str
    name: str
    role_title: str | None = None
    skills: list[str] = []
    phone: str | None = None
    is_available: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v): return str(v)


class InterestCreate(BaseModel):
    listing_id: str
    message: str | None = None
