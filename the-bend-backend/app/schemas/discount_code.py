from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class DiscountCodeBase(BaseModel):
    code: str = Field(..., min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(..., min_length=2, max_length=120)
    description: str | None = Field(None, max_length=280)
    discount_type: Literal["percentage", "flat"]
    discount_value: int = Field(..., gt=0)
    expiry_date: datetime | None = None
    max_uses: int | None = Field(None, gt=0)
    coupon_type: Literal["shop_promo", "sponsor", "event"] = "shop_promo"

    @field_validator("discount_value")
    @classmethod
    def check_value_bounds(cls, v, info):
        dt = info.data.get("discount_type")
        if dt == "percentage" and not (1 <= v <= 100):
            raise ValueError("Percentage discount must be 1-100")
        return v

    @field_validator("expiry_date")
    @classmethod
    def check_future(cls, v):
        if v is not None:
            now = datetime.now(v.tzinfo) if v.tzinfo else datetime.utcnow()
            if v < now:
                raise ValueError("Expiry date must be in the future")
        return v


class DiscountCodeCreate(DiscountCodeBase):
    pass


class DiscountCodeUpdate(BaseModel):
    code: str | None = Field(None, min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    name: str | None = Field(None, min_length=2, max_length=120)
    description: str | None = Field(None, max_length=280)
    discount_type: Literal["percentage", "flat"] | None = None
    discount_value: int | None = Field(None, gt=0)
    expiry_date: datetime | None = None
    max_uses: int | None = Field(None, gt=0)
    is_active: bool | None = None
    coupon_type: Literal["shop_promo", "sponsor", "event"] | None = None

    @field_validator("discount_value")
    @classmethod
    def check_value_bounds(cls, v, info):
        if v is None:
            return v
        dt = info.data.get("discount_type")
        if dt == "percentage" and not (1 <= v <= 100):
            raise ValueError("Percentage discount must be 1-100")
        return v

    @field_validator("expiry_date")
    @classmethod
    def check_future(cls, v):
        if v is not None:
            now = datetime.now(v.tzinfo) if v.tzinfo else datetime.utcnow()
            if v < now:
                raise ValueError("Expiry date must be in the future")
        return v


class DiscountCodeResponse(DiscountCodeBase):
    id: str
    owner_shop_id: str | None = None
    owner_user_id: str | None = None
    usage_count: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", "owner_shop_id", "owner_user_id", mode="before")
    @classmethod
    def stringify(cls, v):
        return str(v) if v is not None else None
