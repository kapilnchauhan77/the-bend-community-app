from __future__ import annotations

from datetime import UTC, datetime
import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class BenderAuthor(BaseModel):
    """Lightweight author block embedded in post/comment responses."""

    id: str
    name: str
    avatar_url: str | None = None
    shop_id: str | None = None
    shop_name: str | None = None

    @field_validator("id", "shop_id", mode="before")
    @classmethod
    def stringify(cls, v):
        return str(v) if v is not None else None


class LinkPreviewMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(..., min_length=1, max_length=2048)
    title: str = Field(..., min_length=1, max_length=180)
    description: str | None = Field(None, max_length=300)
    site_name: str | None = Field(None, max_length=80)
    image_url: str | None = Field(None, max_length=500)

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, value):
        if value is None:
            return value
        if not re.fullmatch(r"/uploads/link-previews/[0-9a-f]{64}\.webp", value):
            raise ValueError("image_url must be a local link-preview asset")
        return value


class BenderLinkPreview(LinkPreviewMetadata):
    source_url: str = Field(..., min_length=1, max_length=2048)


class BenderLinkPreviewSnapshot(BenderLinkPreview):
    version: Literal[1] = 1


class LinkPreviewCacheRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    metadata: LinkPreviewMetadata


class LinkPreviewDraftRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: UUID
    tenant_id: UUID | None
    source_url: str = Field(..., max_length=2048)
    created_at: datetime
    preview: BenderLinkPreviewSnapshot

    @field_validator("created_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("created_at must be timezone-aware")
        return value.astimezone(UTC)


class BenderLinkPreviewRequest(BaseModel):
    url: str


class BenderLinkPreviewResponse(BaseModel):
    preview_token: str
    preview: BenderLinkPreview


class BenderPostCreate(BaseModel):
    caption: str | None = Field(None, max_length=2000)
    preview_token: str | None = None
    media_url: str | None = Field(None, max_length=500)
    media_thumbnail_url: str | None = Field(None, max_length=500)
    media_type: Literal["image", "video"] | None = None

    @model_validator(mode="after")
    def text_or_media(self):
        """A post must carry text OR media — nothing-at-all isn't a post."""
        has_text = bool(self.caption and self.caption.strip())
        if not has_text and not self.media_url:
            raise ValueError("Provide a caption or media")
        # If media_url is set we also want a type so the client can render it.
        if self.media_url and not self.media_type:
            raise ValueError("media_type is required when media_url is provided")
        return self


class BenderPostResponse(BaseModel):
    id: str
    author: BenderAuthor
    caption: str | None
    media_url: str | None
    media_thumbnail_url: str | None
    media_type: str | None
    like_count: int
    comment_count: int
    viewer_has_liked: bool
    created_at: datetime
    link_preview: BenderLinkPreview | None = None

    @field_validator("id", mode="before")
    @classmethod
    def stringify(cls, v):
        return str(v) if v is not None else None


class BenderCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)
    parent_comment_id: UUID | None = None

    @field_validator("content", mode="before")
    @classmethod
    def trim_and_require_content(cls, value):
        if not isinstance(value, str):
            return value
        value = value.strip()
        if not value:
            raise ValueError("content must not be empty")
        return value


class BenderCommentResponse(BaseModel):
    id: str
    author: BenderAuthor
    content: str
    created_at: datetime
    parent_comment_id: str | None = None
    reply_count: int = 0
    like_count: int = 0
    viewer_has_liked: bool = False
    is_deleted: bool = False

    @field_validator("id", "parent_comment_id", mode="before")
    @classmethod
    def stringify(cls, v):
        return str(v) if v is not None else None


class BenderCommentHeartResponse(BaseModel):
    id: str
    like_count: int
    viewer_has_liked: bool

    @field_validator("id", mode="before")
    @classmethod
    def stringify(cls, v):
        return str(v) if v is not None else None


class BenderFeedResponse(BaseModel):
    items: list[BenderPostResponse]
    next_cursor: str | None
    has_more: bool


class BenderCommentsResponse(BaseModel):
    items: list[BenderCommentResponse]
    next_cursor: str | None
    has_more: bool
