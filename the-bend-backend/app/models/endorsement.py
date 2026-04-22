from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import Text, ForeignKey, Index, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Endorsement(Base):
    __tablename__ = "endorsements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    endorser_shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False)
    endorsed_shop_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)

    # Relationships
    endorser: Mapped[Shop] = relationship("Shop", foreign_keys=[endorser_shop_id], backref="endorsements_given")
    endorsed: Mapped[Shop] = relationship("Shop", foreign_keys=[endorsed_shop_id], backref="endorsements_received")

    __table_args__ = (
        UniqueConstraint("endorser_shop_id", "endorsed_shop_id", name="uq_endorsement_pair"),
        CheckConstraint("endorser_shop_id != endorsed_shop_id", name="ck_no_self_endorsement"),
        Index("idx_endorsements_endorsed", "endorsed_shop_id"),
        Index("idx_endorsements_endorser", "endorser_shop_id"),
    )
