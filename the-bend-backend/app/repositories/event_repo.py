from uuid import UUID
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.event import Event, EventConnector
from app.models.enums import EventStatus
from app.core.pagination import PaginatedResult, encode_cursor, decode_cursor


class EventRepository(BaseRepository[Event]):
    def __init__(self, session: AsyncSession):
        super().__init__(Event, session)

    async def browse(self, category=None, status=None, start_after=None, start_before=None, cursor=None, limit=20) -> PaginatedResult:
        filters = []
        if category:
            filters.append(Event.category == category)
        if status:
            filters.append(Event.status == status)
        else:
            filters.append(Event.status == EventStatus.ACTIVE)
        if start_after:
            filters.append(Event.start_date >= start_after)
        if start_before:
            filters.append(Event.start_date <= start_before)
        return await self.get_all(
            filters=filters,
            order_by=[Event.start_date.asc()],
            limit=limit,
            cursor=cursor,
        )

    async def get_upcoming(self, limit=5):
        result = await self.session.execute(
            select(Event)
            .where(Event.status == EventStatus.ACTIVE, Event.start_date >= datetime.utcnow())
            .order_by(Event.start_date.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def find_by_source_url(self, source_url: str, connector_id: UUID) -> Event | None:
        result = await self.session.execute(
            select(Event).where(Event.source_url == source_url, Event.connector_id == connector_id)
        )
        return result.scalar_one_or_none()


class ConnectorRepository(BaseRepository[EventConnector]):
    def __init__(self, session: AsyncSession):
        super().__init__(EventConnector, session)

    async def get_active(self):
        result = await self.session.execute(
            select(EventConnector).where(EventConnector.is_active == True).order_by(EventConnector.name)
        )
        return list(result.scalars().all())
