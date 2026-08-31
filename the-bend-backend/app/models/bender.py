from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BenderPost(Base):
    """An Instagram-style community feed post.

    Any signed-in user (individual or shop-affiliated) can author a post.
    `author_shop_id` is just a hint for rendering — the canonical author is
    always `author_user_id`. We store `tenant_id` for multi-tenancy filtering
    and keep cached `like_count` / `comment_count` so the feed doesn't need
    to fan out aggregates on every page.

    Media storage follows the same pattern as `Message.attachment_*`: plain
    String(500) columns pointing at whatever `POST /api/v1/upload/media`
    returned. `media_type` is 'image' or 'video' — no PG enum, keeps
    migrations trivial.
    """

    __tablename__ = "bender_posts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    author_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_shop_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shops.id", ondelete="SET NULL"),
    )
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
    )

    caption: Mapped[str | None] = mapped_column(Text)
    media_url: Mapped[str | None] = mapped_column(String(500))
    media_thumbnail_url: Mapped[str | None] = mapped_column(String(500))
    media_type: Mapped[str | None] = mapped_column(String(16))  # 'image' | 'video'
    link_preview: Mapped[dict[str, object] | None] = mapped_column(JSONB)

    like_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    # Relationships
    author: Mapped["User"] = relationship("User", foreign_keys=[author_user_id])
    shop: Mapped["Shop | None"] = relationship("Shop", foreign_keys=[author_shop_id])
    likes: Mapped[list["BenderLike"]] = relationship(
        "BenderLike",
        back_populates="post",
        cascade="all, delete-orphan",
    )
    comments: Mapped[list["BenderComment"]] = relationship(
        "BenderComment",
        back_populates="post",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_bender_posts_tenant_created", "tenant_id", "created_at"),
        Index("idx_bender_posts_author_user", "author_user_id"),
    )


class BenderLike(Base):
    """A like on a BenderPost.

    The (post_id, user_id) unique index gives us idempotency: a second
    POST /posts/{id}/like for the same viewer is a no-op (we catch the
    integrity error at the service level).
    """

    __tablename__ = "bender_likes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bender_posts.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    post: Mapped[BenderPost] = relationship("BenderPost", back_populates="likes")

    __table_args__ = (
        Index("uq_bender_likes_post_user", "post_id", "user_id", unique=True),
    )


class BenderComment(Base):
    """A comment on a BenderPost. ASC by created_at when listed."""

    __tablename__ = "bender_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bender_posts.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    parent_comment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bender_comments.id", ondelete="CASCADE"),
        nullable=True,
    )
    like_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)

    post: Mapped[BenderPost] = relationship("BenderPost", back_populates="comments")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    parent: Mapped["BenderComment | None"] = relationship(
        "BenderComment",
        remote_side=[id],
        back_populates="replies",
        foreign_keys=[parent_comment_id],
    )
    replies: Mapped[list["BenderComment"]] = relationship(
        "BenderComment",
        back_populates="parent",
        foreign_keys=[parent_comment_id],
        cascade="all, delete-orphan",
    )
    likes: Mapped[list["BenderCommentLike"]] = relationship(
        "BenderCommentLike",
        back_populates="comment",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_bender_comments_post_created", "post_id", "created_at"),
    )


class BenderCommentLike(Base):
    """A heart on a Bender comment, unique per viewer and comment."""

    __tablename__ = "bender_comment_likes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    comment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bender_comments.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    comment: Mapped[BenderComment] = relationship("BenderComment", back_populates="likes")

    __table_args__ = (
        Index("uq_bender_comment_likes_comment_user", "comment_id", "user_id", unique=True),
    )
