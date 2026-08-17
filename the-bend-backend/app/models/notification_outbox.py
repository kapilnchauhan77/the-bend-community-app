from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class NotificationOutbox(Base):
    __tablename__ = "notification_outbox"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notification_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending", nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)
    available_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime)
    provider_results: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    last_error_code: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)

    notification: Mapped[Notification] = relationship("Notification")

    __table_args__ = (
        UniqueConstraint("notification_id", name="uq_notification_outbox_notification"),
        CheckConstraint("status IN ('pending', 'processing', 'delivered', 'failed')", name="ck_notification_outbox_status"),
        Index("idx_notification_outbox_tenant_status", "tenant_id", "status"),
        Index("idx_notification_outbox_available", "status", "available_at"),
    )

    def __init__(self, **kwargs):
        now = datetime.utcnow()
        kwargs.setdefault("id", uuid.uuid4())
        kwargs.setdefault("status", "pending")
        kwargs.setdefault("attempts", 0)
        kwargs.setdefault("available_at", now)
        kwargs.setdefault("provider_results", {})
        kwargs.setdefault("created_at", now)
        kwargs.setdefault("updated_at", now)
        super().__init__(**kwargs)
