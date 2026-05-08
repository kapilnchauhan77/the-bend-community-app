from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, ENUM
from app.database import Base
from app.models.enums import ReferralStatus, ReferralRewardType


class TenantReferral(Base):
    __tablename__ = "tenant_referrals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    referrer_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    referred_email: Mapped[str] = mapped_column(String(255), nullable=False)
    referred_name: Mapped[str] = mapped_column(String(150), nullable=False)
    referred_county_name: Mapped[str] = mapped_column(String(150), nullable=False)
    referred_message: Mapped[str | None] = mapped_column(Text)

    status: Mapped[ReferralStatus] = mapped_column(
        ENUM(ReferralStatus, name="referral_status"),
        nullable=False, default=ReferralStatus.PENDING,
    )

    reward_type: Mapped[ReferralRewardType] = mapped_column(
        ENUM(ReferralRewardType, name="referral_reward_type"),
        nullable=False, default=ReferralRewardType.FREE_MONTHS,
    )
    reward_amount: Mapped[int | None] = mapped_column(Integer)
    reward_granted_at: Mapped[datetime | None] = mapped_column()

    resulting_tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL")
    )

    super_admin_notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_referrals_referrer_tenant", "referrer_tenant_id"),
        Index("idx_referrals_status", "status"),
        Index("idx_referrals_resulting_tenant", "resulting_tenant_id"),
    )
