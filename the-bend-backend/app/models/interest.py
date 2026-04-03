from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import Text, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Interest(Base):
    __tablename__ = "interests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    # Relationships
    listing: Mapped[Listing] = relationship("Listing", back_populates="interests")
    user: Mapped[User] = relationship("User", back_populates="interests")

    __table_args__ = (
        UniqueConstraint("listing_id", "user_id", name="uq_interest_listing_user"),
        Index("idx_interests_listing", "listing_id"),
        Index("idx_interests_user", "user_id"),
    )
