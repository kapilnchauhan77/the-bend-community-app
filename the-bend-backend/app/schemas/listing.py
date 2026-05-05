from datetime import datetime, time
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator


class ListingCreate(BaseModel):
    type: str = Field(..., pattern="^(offer|request)$")
    category: str = Field(..., pattern="^(staff|materials|equipment)$")
    title: str = Field(..., min_length=5, max_length=100)
    description: str = Field(..., min_length=10, max_length=500)
    quantity: str | None = None
    unit: str | None = None
    expiry_date: datetime | None = None
    price: Decimal | None = None
    is_free: bool = True
    urgency: str = Field("normal", pattern="^(normal|urgent)$")
    image_ids: list[str] = []

    @field_validator("price")
    @classmethod
    def validate_price(cls, v, info):
        if not info.data.get("is_free", True) and (v is None or v <= 0):
            raise ValueError("Price is required and must be positive when not free")
        return v

    @field_validator("expiry_date")
    @classmethod
    def validate_expiry(cls, v):
        if v is None:
            return v
        # If the client sent a date-only value (midnight), treat it as end-of-day
        # so picking today's date is still valid for the rest of the day.
        if v.hour == 0 and v.minute == 0 and v.second == 0 and v.microsecond == 0:
            v = datetime.combine(v.date(), time(23, 59, 59), tzinfo=v.tzinfo)
        # Compare with current UTC time, naive vs aware safe.
        now = datetime.now(v.tzinfo) if v.tzinfo else datetime.utcnow()
        if v < now:
            raise ValueError("Expiry date must be in the future")
        return v


class ListingUpdate(BaseModel):
    title: str | None = Field(None, min_length=5, max_length=100)
    description: str | None = Field(None, min_length=10, max_length=500)
    quantity: str | None = None
    unit: str | None = None
    expiry_date: datetime | None = None
    price: Decimal | None = None
    is_free: bool | None = None
    urgency: str | None = Field(None, pattern="^(normal|urgent)$")


class ShopSummary(BaseModel):
    id: str
    name: str
    business_type: str
    avatar_url: str | None = None
    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v):
        return str(v)


class ImageResponse(BaseModel):
    url: str
    thumbnail_url: str | None = None


class ListingResponse(BaseModel):
    id: str
    shop: ShopSummary
    type: str
    category: str
    title: str
    description: str
    quantity: str | None = None
    unit: str | None = None
    expiry_date: datetime | None = None
    price: float | None = None
    is_free: bool
    urgency: str
    status: str
    interest_count: int
    images: list[ImageResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v):
        return str(v)

    @field_validator("type", "category", "urgency", "status", mode="before")
    @classmethod
    def stringify_enum(cls, v):
        return v.value if hasattr(v, "value") else str(v)


class ShopDetailSummary(ShopSummary):
    contact_phone: str = ""
    whatsapp: str | None = None
    address: str | None = None


class ListingDetailResponse(ListingResponse):
    shop: "ShopDetailSummary"
    viewer_has_interest: bool = False
    views_count: int = 0


class ListingListResponse(BaseModel):
    items: list[ListingResponse]
    next_cursor: str | None = None
    has_more: bool
