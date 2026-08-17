from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, Index, Boolean, UniqueConstraint, ForeignKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_type: Mapped[str] = mapped_column(String(16), nullable=False, default="listing")
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    reporter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)  # spam, inappropriate, misleading, other
    details: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    resolved_at: Mapped[datetime | None] = mapped_column()
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_reports_target", "target_type", "target_id"),
        Index("idx_reports_resolved", "resolved"),
        Index("uq_reports_reporter_target", "tenant_id", "reporter_id", "target_type", "target_id", unique=True, postgresql_where=(status == "open")),
        UniqueConstraint("id", "tenant_id", name="uq_reports_id_tenant"),
        ForeignKeyConstraint(["reporter_id", "tenant_id"], ["users.id", "users.tenant_id"], ondelete="RESTRICT"),
        ForeignKeyConstraint(["resolved_by_id", "tenant_id"], ["users.id", "users.tenant_id"], ondelete="SET NULL"),
    )
