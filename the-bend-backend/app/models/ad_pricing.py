from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Boolean, Integer, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class AdPricing(Base):
    __tablename__ = "ad_pricing"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    placement: Mapped[str] = mapped_column(String(50), nullable=False)  # homepage, browse, events, footer
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)  # in cents
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_ad_pricing_active", "is_active"),
    )
