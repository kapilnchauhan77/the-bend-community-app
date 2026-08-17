from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Index, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    push_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    message_received: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    listing_interest_received: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    registration_decision: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    urgent_listing_published: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)

    user: Mapped[User] = relationship("User", back_populates="notification_preferences")

    __table_args__ = (
        UniqueConstraint("user_id", "tenant_id", name="uq_notification_preferences_user_tenant"),
        Index("idx_notification_preferences_user", "user_id"),
        Index("idx_notification_preferences_tenant", "tenant_id"),
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid.uuid4())
        for name in ("push_enabled", "message_received", "listing_interest_received", "registration_decision", "urgent_listing_published"):
            kwargs.setdefault(name, True)
        super().__init__(**kwargs)
