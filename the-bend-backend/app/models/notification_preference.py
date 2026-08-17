from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, ForeignKeyConstraint, Index, UniqueConstraint, and_, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.user import User


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    push_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    message_received: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    listing_interest_received: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    registration_decision: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    urgent_listing_published: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)

    user: Mapped[User] = relationship(
        "User",
        back_populates="notification_preferences",
        primaryjoin=lambda: and_(NotificationPreference.user_id == User.id, NotificationPreference.tenant_id == User.tenant_id),
        foreign_keys=lambda: [NotificationPreference.user_id, NotificationPreference.tenant_id],
    )

    __table_args__ = (
        UniqueConstraint("user_id", "tenant_id", name="uq_notification_preferences_user_tenant"),
        ForeignKeyConstraint(["user_id", "tenant_id"], ["users.id", "users.tenant_id"], ondelete="CASCADE"),
        Index("idx_notification_preferences_user", "user_id"),
        Index("idx_notification_preferences_tenant", "tenant_id"),
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid.uuid4())
        for name in ("push_enabled", "message_received", "listing_interest_received", "registration_decision", "urgent_listing_published"):
            kwargs.setdefault(name, True)
        super().__init__(**kwargs)
