from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserBlock(Base):
    __tablename__ = "user_blocks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    blocker_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    blocked_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        ForeignKeyConstraint(["blocker_id", "tenant_id"], ["users.id", "users.tenant_id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["blocked_id", "tenant_id"], ["users.id", "users.tenant_id"], ondelete="CASCADE"),
        UniqueConstraint("tenant_id", "blocker_id", "blocked_id", name="uq_user_blocks_direction"),
        CheckConstraint("blocker_id <> blocked_id", name="ck_user_blocks_not_self"),
        Index("idx_user_blocks_blocker", "tenant_id", "blocker_id"),
        Index("idx_user_blocks_blocked", "tenant_id", "blocked_id"),
    )
