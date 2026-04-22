from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, Text, Integer, ForeignKey, Index, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, ENUM
from app.database import Base
from app.models.enums import ListingType, ListingCategory, UrgencyLevel, ListingStatus


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    type: Mapped[ListingType] = mapped_column(ENUM(ListingType, name="listing_type", create_type=False), nullable=False)
    category: Mapped[ListingCategory] = mapped_column(ENUM(ListingCategory, name="listing_category", create_type=False), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[str | None] = mapped_column(String(50))
    unit: Mapped[str | None] = mapped_column(String(20))
    expiry_date: Mapped[datetime | None] = mapped_column()
    price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    is_free: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    urgency: Mapped[UrgencyLevel] = mapped_column(ENUM(UrgencyLevel, name="urgency_level", create_type=False), nullable=False, default=UrgencyLevel.NORMAL)
    status: Mapped[ListingStatus] = mapped_column(ENUM(ListingStatus, name="listing_status", create_type=False), nullable=False, default=ListingStatus.ACTIVE)
    views_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    interest_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fulfilled_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    shop: Mapped[Shop] = relationship("Shop", back_populates="listings")
    images: Mapped[list[ListingImage]] = relationship("ListingImage", back_populates="listing", cascade="all, delete-orphan")
    interests: Mapped[list[Interest]] = relationship("Interest", back_populates="listing", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_listings_shop_id", "shop_id"),
        Index("idx_listings_status", "status"),
        Index("idx_listings_category", "category"),
        Index("idx_listings_urgency", "urgency"),
        Index("idx_listings_type", "type"),
        Index("idx_listings_created_at", "created_at"),
        Index("idx_listings_expiry", "expiry_date"),
        Index("idx_listings_feed", "status", "urgency", "created_at"),
        Index("idx_listings_tenant_id", "tenant_id"),
    )


class ListingImage(Base):
    __tablename__ = "listing_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    # Relationships
    listing: Mapped[Listing] = relationship("Listing", back_populates="images")

    __table_args__ = (
        Index("idx_listing_images_listing", "listing_id"),
    )
