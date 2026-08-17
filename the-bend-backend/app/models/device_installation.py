from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DeviceInstallation(Base):
    __tablename__ = "device_installations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    provider_token: Mapped[str] = mapped_column(Text, nullable=False)
    revocation_secret_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    app_version: Mapped[str] = mapped_column(String(32), nullable=False)
    build_number: Mapped[str] = mapped_column(String(32), nullable=False)
    locale: Mapped[str] = mapped_column(String(16), default="en-US", server_default="en-US", nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)

    user: Mapped[User] = relationship("User", back_populates="device_installations")

    __table_args__ = (
        UniqueConstraint("provider_token", name="uq_device_installations_provider_token"),
        Index("idx_device_installations_user", "user_id"),
        Index("idx_device_installations_tenant", "tenant_id"),
    )

    def __init__(self, **kwargs):
        now = datetime.utcnow()
        kwargs.setdefault("id", uuid.uuid4())
        kwargs.setdefault("locale", "en-US")
        kwargs.setdefault("enabled", True)
        kwargs.setdefault("last_seen_at", now)
        kwargs.setdefault("created_at", now)
        kwargs.setdefault("updated_at", now)
        super().__init__(**kwargs)
