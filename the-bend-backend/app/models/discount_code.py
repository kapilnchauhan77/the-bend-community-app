from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class DiscountCode(Base):
    __tablename__ = "discount_codes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Exactly one owner — XOR enforced via partial-unique indexes below + service-level check.
    owner_shop_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shops.id", ondelete="CASCADE"),
        nullable=True,
    )
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,
    )

    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(280))

    # 'percentage' (1-100) or 'flat' (cents)
    discount_type: Mapped[str] = mapped_column(String(16), nullable=False)
    discount_value: Mapped[int] = mapped_column(Integer, nullable=False)

    expiry_date: Mapped[datetime | None] = mapped_column()
    max_uses: Mapped[int | None] = mapped_column(Integer)
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 'shop_promo' (default — owner is a shop or individual) or 'sponsor'
    # (tenant-admin-issued coupon redeemed at sponsor-slot checkout; both
    # owner columns are NULL on sponsor rows).
    coupon_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="shop_promo"
    )

    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_discount_codes_owner_shop", "owner_shop_id"),
        Index("idx_discount_codes_owner_user", "owner_user_id"),
        Index("idx_discount_codes_tenant_id", "tenant_id"),
        Index("idx_discount_codes_coupon_type", "coupon_type"),
        # Code is unique PER OWNER (one shop's SPRING20 != another's SPRING20).
        # Two partial unique indexes since only one owner column is non-null per row.
        Index(
            "uq_discount_codes_shop_code",
            "owner_shop_id",
            "code",
            unique=True,
            postgresql_where=text("owner_shop_id IS NOT NULL"),
        ),
        Index(
            "uq_discount_codes_user_code",
            "owner_user_id",
            "code",
            unique=True,
            postgresql_where=text("owner_user_id IS NOT NULL"),
        ),
    )
