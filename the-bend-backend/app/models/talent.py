from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import String, Text, Numeric, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Talent(Base):
    __tablename__ = "talent"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    skills: Mapped[str] = mapped_column(Text, nullable=False)
    available_time: Mapped[str] = mapped_column(String(255), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    rate_unit: Mapped[str] = mapped_column(String(20), nullable=False, default="hr")
    photo_url: Mapped[str | None] = mapped_column(String(500))
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    inquiries: Mapped[list[TalentInquiry]] = relationship("TalentInquiry", back_populates="talent")

    __table_args__ = (
        Index("idx_talent_category", "category"),
        Index("idx_talent_created", "created_at"),
        Index("idx_talent_tenant_id", "tenant_id"),
    )


class TalentInquiry(Base):
    __tablename__ = "talent_inquiries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    talent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("talent.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    preferred_date: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    talent: Mapped[Talent] = relationship("Talent", back_populates="inquiries")

    __table_args__ = (
        Index("idx_talent_inquiries_talent", "talent_id"),
    )
