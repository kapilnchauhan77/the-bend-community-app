from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Boolean, Integer, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, ENUM, JSONB
from app.database import Base
from app.models.enums import EventCategory, EventStatus, ConnectorType


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[datetime] = mapped_column(nullable=False)
    end_date: Mapped[datetime | None] = mapped_column()
    location: Mapped[str | None] = mapped_column(String(255))
    category: Mapped[EventCategory] = mapped_column(ENUM(EventCategory, name="event_category", create_type=False), nullable=False, default=EventCategory.COMMUNITY)
    image_url: Mapped[str | None] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(100), nullable=False, default="manual")
    source_url: Mapped[str | None] = mapped_column(String(500))
    connector_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("event_connectors.id", ondelete="SET NULL"))
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[EventStatus] = mapped_column(ENUM(EventStatus, name="event_status", create_type=False), nullable=False, default=EventStatus.ACTIVE)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    connector: Mapped[EventConnector | None] = relationship("EventConnector", back_populates="events")

    __table_args__ = (
        Index("idx_events_category", "category"),
        Index("idx_events_status", "status"),
        Index("idx_events_start_date", "start_date"),
        Index("idx_events_connector", "connector_id"),
        UniqueConstraint("source_url", "connector_id", name="uq_event_source_connector"),
    )


class EventConnector(Base):
    __tablename__ = "event_connectors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[ConnectorType] = mapped_column(ENUM(ConnectorType, name="connector_type", create_type=False), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    category: Mapped[EventCategory] = mapped_column(ENUM(EventCategory, name="event_category", create_type=False), nullable=False, default=EventCategory.COMMUNITY)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    config: Mapped[dict | None] = mapped_column(JSONB)
    last_synced_at: Mapped[datetime | None] = mapped_column()
    last_sync_count: Mapped[int | None] = mapped_column(Integer)
    last_sync_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    events: Mapped[list[Event]] = relationship("Event", back_populates="connector")

    __table_args__ = (
        Index("idx_connectors_active", "is_active"),
        Index("idx_connectors_type", "type"),
    )
