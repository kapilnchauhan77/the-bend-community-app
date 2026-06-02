from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, field_validator, model_validator


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
    # Phase 2 attachments — null when the message is text-only.
    attachment_url: str | None = None
    attachment_type: Literal['image', 'video'] | None = None
    attachment_thumbnail_url: str | None = None

    @field_validator("id", "thread_id", "sender_id", mode="before")
    @classmethod
    def stringify_id(cls, v): return str(v)


class MessageListResponse(BaseModel):
    items: list[MessageResponse]
    next_cursor: str | None = None
    has_more: bool


class SendMessageRequest(BaseModel):
    """Incoming payload for POST /messages/threads/{thread_id}.

    Phase 2: `content` is now optional so a media-only message (just a photo
    or video) is allowed. We require AT LEAST one of:
      - non-empty `content` (whitespace-only counts as empty), OR
      - `attachment_url`

    Both may be present (text + attachment), in which case both are stored.
    """
    content: str | None = Field(default=None, max_length=2000)
    attachment_url: str | None = None
    attachment_type: Literal['image', 'video'] | None = None
    attachment_thumbnail_url: str | None = None

    @model_validator(mode="after")
    def _require_content_or_attachment(self) -> "SendMessageRequest":
        has_text = bool(self.content and self.content.strip())
        has_attachment = bool(self.attachment_url)
        if not (has_text or has_attachment):
            raise ValueError(
                "Message must include non-empty content or an attachment_url"
            )
        return self


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
