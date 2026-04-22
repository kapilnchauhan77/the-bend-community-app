from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, ENUM
from app.database import Base
from app.models.enums import ShopStatus


class Shop(Base):
    __tablename__ = "shops"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    business_type: Mapped[str] = mapped_column(String(50), nullable=False)
    address: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    whatsapp: Mapped[str | None] = mapped_column(String(20))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[ShopStatus] = mapped_column(ENUM(ShopStatus, name="shop_status", create_type=False), nullable=False, default=ShopStatus.PENDING)
    admin_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    guidelines_accepted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    guidelines_accepted_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    admin: Mapped[User | None] = relationship("User", back_populates="admin_of_shop", foreign_keys=[admin_user_id])
    members: Mapped[list[User]] = relationship("User", back_populates="shop", foreign_keys="User.shop_id")
    listings: Mapped[list[Listing]] = relationship("Listing", back_populates="shop")
    employees: Mapped[list[Employee]] = relationship("Employee", back_populates="shop")

    __table_args__ = (
        Index("idx_shops_status", "status"),
        Index("idx_shops_admin", "admin_user_id"),
        Index("idx_shops_tenant_id", "tenant_id"),
    )
