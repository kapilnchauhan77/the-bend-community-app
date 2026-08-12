from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import Text, ForeignKey, Index, UniqueConstraint, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class MessageThread(Base):
    __tablename__ = "message_threads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("listings.id", ondelete="SET NULL"))
    participant_a: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    participant_b: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    last_message_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    # Relationships
    listing: Mapped[Listing | None] = relationship("Listing")
    user_a: Mapped[User] = relationship("User", foreign_keys=[participant_a])
    user_b: Mapped[User] = relationship("User", foreign_keys=[participant_b])
    messages: Mapped[list[Message]] = relationship("Message", back_populates="thread", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("listing_id", "participant_a", "participant_b", name="uq_thread_listing_participants"),
        Index("idx_threads_participant_a", "participant_a"),
        Index("idx_threads_participant_b", "participant_b"),
        Index("idx_threads_last_message", "last_message_at"),
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("message_threads.id", ondelete="CASCADE"), nullable=False)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Phase 2 attachments: a message may carry a single photo or short video
    # in addition to (or instead of) text. All three columns are nullable so
    # legacy text-only messages remain valid. `attachment_type` is 'image' or
    # 'video' — we keep it as a plain VARCHAR rather than a Postgres enum
    # because we only have two values and migrations stay trivial that way.
    attachment_url: Mapped[str | None] = mapped_column(String(500))
    attachment_type: Mapped[str | None] = mapped_column(String(16))
    attachment_thumbnail_url: Mapped[str | None] = mapped_column(String(500))
    # A message may reference one community entity (listing/shop/bender/user),
    # rendered as a preview card. Polymorphic + FK-less so a reference degrades
    # gracefully if the target is later deleted. Mirrors the attachment_* pattern.
    reference_type: Mapped[str | None] = mapped_column(String(16))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    read_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    # Relationships
    thread: Mapped[MessageThread] = relationship("MessageThread", back_populates="messages")
    sender: Mapped[User] = relationship("User")

    __table_args__ = (
        Index("idx_messages_thread", "thread_id", "created_at"),
        Index("idx_messages_sender", "sender_id"),
        Index("idx_messages_unread", "thread_id", "read_at"),
    )
