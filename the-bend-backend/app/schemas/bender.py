from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


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


class BenderPostCreate(BaseModel):
    caption: str | None = Field(None, max_length=2000)
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

    @field_validator("id", mode="before")
    @classmethod
    def stringify(cls, v):
        return str(v) if v is not None else None


class BenderCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)


class BenderCommentResponse(BaseModel):
    id: str
    author: BenderAuthor
    content: str
    created_at: datetime

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
