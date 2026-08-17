from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator


class NotificationResponse(BaseModel):
    id: str
    type: str
    title: str
    body: str
    data: dict | None = None
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v): return str(v)

    @field_validator("type", mode="before")
    @classmethod
    def stringify_type(cls, v): return v.value if hasattr(v, "value") else str(v)


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    next_cursor: str | None = None
    has_more: bool


class PushSubscriptionRequest(BaseModel):
    endpoint: str
    keys: dict  # { "p256dh": "...", "auth": "..." }


class NotificationPreferencesRequest(BaseModel):
    push_enabled: bool
    message_received: bool
    listing_interest_received: bool
    registration_decision: bool
    urgent_listing_published: bool


class NotificationPreferencesResponse(NotificationPreferencesRequest):
    model_config = ConfigDict(from_attributes=True)
