from datetime import datetime
from pydantic import BaseModel, field_validator


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
    push_enabled: bool = True
    email_enabled: bool = True
    email_frequency: str = "daily"
    categories: list[str] = ["staff", "materials", "equipment"]
    min_urgency: str = "normal"
