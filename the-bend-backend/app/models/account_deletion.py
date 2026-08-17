from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AccountDeletion(Base):
    __tablename__ = "account_deletions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    receipt_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    receipt_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    send_confirmation: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    confirmation_email: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    available_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, server_default="CURRENT_TIMESTAMP")
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, server_default="CURRENT_TIMESTAMP")
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow, server_default="CURRENT_TIMESTAMP")

    __table_args__ = (
        ForeignKeyConstraint(["user_id", "tenant_id"], ["users.id", "users.tenant_id"], ondelete="RESTRICT"),
        Index("idx_account_deletions_claim", "status", "available_at"),
        Index("idx_account_deletions_receipt", "receipt_hash"),
    )

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid.uuid4())
        kwargs.setdefault("status", "pending")
        kwargs.setdefault("attempts", 0)
        super().__init__(**kwargs)
