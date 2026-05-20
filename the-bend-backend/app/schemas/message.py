from datetime import datetime
from pydantic import BaseModel, field_validator


class ThreadResponse(BaseModel):
    id: str
    listing: dict | None = None
    other_party: dict
    last_message: dict | None = None
    unread_count: int = 0
    last_message_at: datetime | None = None

    @field_validator("id", mode="before")
    @classmethod
    def stringify_id(cls, v): return str(v)


class ThreadListResponse(BaseModel):
    items: list[ThreadResponse]
    next_cursor: str | None = None
    has_more: bool


class MessageResponse(BaseModel):
    id: str
    thread_id: str
    sender_id: str
    content: str
    read_at: datetime | None = None
    created_at: datetime

    @field_validator("id", "thread_id", "sender_id", mode="before")
    @classmethod
    def stringify_id(cls, v): return str(v)


class MessageListResponse(BaseModel):
    items: list[MessageResponse]
    next_cursor: str | None = None
    has_more: bool


class SendMessageRequest(BaseModel):
    content: str


class StartThreadRequest(BaseModel):
    # Legacy: shop_id + optional listing_id (existing clients).
    shop_id: str | None = None
    listing_id: str | None = None
    # New: direct user-to-user thread (Volunteer/Talent messaging).
    recipient_user_id: str | None = None


class MessageThreadCreate(BaseModel):
    """Alias for StartThreadRequest — referenced by plan as MessageThreadCreate."""
    listing_id: str | None = None
    recipient_user_id: str | None = None
    shop_id: str | None = None
