from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ReportAudit(Base):
    __tablename__ = "report_audits"
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    report_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    platform_actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, default=datetime.utcnow
    )
    __table_args__ = (
        Index("idx_report_audits_report", "report_id", "created_at"),
        UniqueConstraint("report_id", "action", name="uq_report_audits_action"),
        ForeignKeyConstraint(
            ["report_id", "tenant_id"],
            ["reports.id", "reports.tenant_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["actor_id", "tenant_id"],
            ["users.id", "users.tenant_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "num_nonnulls(actor_id, platform_actor_id) = 1",
            name="ck_report_audits_single_actor",
        ),
    )
