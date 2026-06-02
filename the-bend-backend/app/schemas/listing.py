from datetime import datetime, time
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator


class ListingCreate(BaseModel):
    type: str = Field(..., pattern="^(offer|request)$")
    category: str = Field(..., pattern="^(staff|materials|equipment|volunteer)$")
    title: str = Field(..., min_length=5, max_length=100)
    description: str = Field(..., min_length=10, max_length=500)
    quantity: str | None = None
    unit: str | None = None
    expiry_date: datetime | None = None

    # Pricing — multiple modes
    pricing_type: str = Field("free", pattern="^(free|fixed|hourly|range|custom)$")
    price: Decimal | None = None
    price_max: Decimal | None = None
    price_unit: str | None = Field(None, max_length=30)  # e.g. "hr", "day", "gig", "project"
    price_text: str | None = Field(None, max_length=150)  # custom freeform e.g. "DOE", "Negotiable"
    is_free: bool = True  # legacy flag, kept in sync with pricing_type=='free'

    urgency: str = Field("normal", pattern="^(normal|urgent)$")
    image_ids: list[str] = []

    @field_validator("price", "price_max")
    @classmethod
    def non_negative_amount(cls, v):
        if v is not None and v < 0:
            raise ValueError("Amount must be zero or positive")
        return v

    @field_validator("is_free", mode="before")
    @classmethod
    def derive_is_free(cls, v, info):
        # Keep is_free in sync with pricing_type for backward compat
        pt = info.data.get("pricing_type")
        if pt is not None:
            return pt == "free"
        return v

    @field_validator("price_max")
    @classmethod
    def validate_range(cls, v, info):
        if info.data.get("pricing_type") == "range":
            lo = info.data.get("price")
            if v is None or lo is None:
                raise ValueError("Range pricing requires both a min (price) and max (price_max)")
            if v < lo:
                raise ValueError("Maximum price cannot be less than minimum price")
        return v

    @field_validator("price_text")
    @classmethod
    def validate_custom(cls, v, info):
        if info.data.get("pricing_type") == "custom" and not (v and v.strip()):
            raise ValueError("Custom pricing requires a description (e.g. 'Negotiable', 'DOE')")
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
    type: str | None = Field(None, pattern="^(offer|request)$")
    category: str | None = Field(None, pattern="^(staff|materials|equipment|volunteer)$")
    title: str | None = Field(None, min_length=5, max_length=100)
    description: str | None = Field(None, min_length=10, max_length=500)
    quantity: str | None = None
    unit: str | None = None
    expiry_date: datetime | None = None
    pricing_type: str | None = Field(None, pattern="^(free|fixed|hourly|range|custom)$")
    price: Decimal | None = None
    price_max: Decimal | None = None
    price_unit: str | None = Field(None, max_length=30)
    price_text: str | None = Field(None, max_length=150)
    is_free: bool | None = None
    urgency: str | None = Field(None, pattern="^(normal|urgent)$")
    image_ids: list[str] | None = None  # full set of image URLs after edits; replaces existing


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


class PostedBySummary(BaseModel):
    """Identifies the user who posted a listing when there is no shop
    (e.g. a Volunteer Opportunity posted by an individual)."""
    id: str
    name: str
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
    shop: ShopSummary | None = None
    posted_by: PostedBySummary | None = None
    type: str
    category: str
    title: str
    description: str
    quantity: str | None = None
    unit: str | None = None
    expiry_date: datetime | None = None
    pricing_type: str = "free"
    price: float | None = None
    price_max: float | None = None
    price_unit: str | None = None
    price_text: str | None = None
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

    @field_validator("type", "category", "urgency", "status", "pricing_type", mode="before")
    @classmethod
    def stringify_enum(cls, v):
        return v.value if hasattr(v, "value") else str(v)


class ShopDetailSummary(ShopSummary):
    contact_phone: str = ""
    whatsapp: str | None = None
    address: str | None = None


class ListingDetailResponse(ListingResponse):
    shop: "ShopDetailSummary | None" = None
    viewer_has_interest: bool = False
    views_count: int = 0


class ListingListResponse(BaseModel):
    items: list[ListingResponse]
    next_cursor: str | None = None
    has_more: bool
