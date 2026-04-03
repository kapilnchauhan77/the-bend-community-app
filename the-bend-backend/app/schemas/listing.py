from datetime import datetime
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
    urgency: str = Field("normal", pattern="^(normal|urgent|critical)$")
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
        if v and v < datetime.utcnow():
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
    urgency: str | None = Field(None, pattern="^(normal|urgent|critical)$")


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
