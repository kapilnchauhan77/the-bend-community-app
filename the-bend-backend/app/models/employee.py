from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, ForeignKey, Index, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    role_title: Mapped[str | None] = mapped_column(String(100))
    skills: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    phone: Mapped[str | None] = mapped_column(String(20))
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    shop: Mapped[Shop] = relationship("Shop", back_populates="employees")

    __table_args__ = (
        Index("idx_employees_shop", "shop_id"),
        Index("idx_employees_available", "shop_id", "is_available"),
    )
