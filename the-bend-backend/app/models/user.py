from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, ENUM
from app.database import Base
from app.models.enums import UserRole


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    role: Mapped[UserRole] = mapped_column(ENUM(UserRole, name="user_role", create_type=False), nullable=False, default=UserRole.SHOP_ADMIN)
    shop_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("shops.id", ondelete="SET NULL"))
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    shop: Mapped[Shop | None] = relationship("Shop", back_populates="members", foreign_keys=[shop_id])
    admin_of_shop: Mapped[Shop | None] = relationship("Shop", back_populates="admin", foreign_keys="Shop.admin_user_id")
    notifications: Mapped[list[Notification]] = relationship("Notification", back_populates="user")
    interests: Mapped[list[Interest]] = relationship("Interest", back_populates="user")
    push_subscriptions: Mapped[list[PushSubscription]] = relationship("PushSubscription", back_populates="user")

    __table_args__ = (
        Index("idx_users_email", "email"),
        Index("idx_users_shop_id", "shop_id"),
        Index("idx_users_role", "role"),
        Index("idx_users_tenant_id", "tenant_id"),
    )
