from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PaginatedResult
from app.models.enums import EventStatus
from app.models.event import Event, EventConnector
from app.repositories.base import BaseRepository


class EventRepository(BaseRepository[Event]):
    def __init__(self, session: AsyncSession):
        super().__init__(Event, session)

    async def browse(self, category=None, status=None, start_after=None, start_before=None, search=None, cursor=None, limit=20, tenant_id=None) -> PaginatedResult:
        from sqlalchemy import or_
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
        if search:
            search_term = f"%{search}%"
            filters.append(
                or_(
                    Event.title.ilike(search_term),
                    Event.description.ilike(search_term),
                    Event.location.ilike(search_term),
                )
            )
        if tenant_id:
            filters.append(Event.tenant_id == tenant_id)
        return await self.get_all(
            filters=filters,
            order_by=[Event.start_date.asc()],
            limit=limit,
            cursor=cursor,
        )

    async def get_upcoming(self, limit=5, tenant_id=None):
        query = (
            select(Event)
            .where(Event.status == EventStatus.ACTIVE, Event.start_date >= datetime.utcnow())
        )
        if tenant_id:
            query = query.where(Event.tenant_id == tenant_id)
        query = query.order_by(Event.start_date.asc()).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def find_by_source_url(self, source_url: str, connector_id: UUID) -> Event | None:
        result = await self.session.execute(
            select(Event).where(Event.source_url == source_url, Event.connector_id == connector_id)
        )
        return result.scalar_one_or_none()

    async def update_image_if_blank(self, event_id: UUID, image_url: str) -> bool:
        """Atomically backfill an image without racing an admin's manual edit."""
        result = await self.session.execute(
            update(Event)
            .where(
                Event.id == event_id,
                or_(
                    Event.image_url.is_(None),
                    func.btrim(Event.image_url, " \t\n\r\f\v") == "",
                ),
            )
            .values(image_url=image_url)
            .returning(Event.id)
        )
        return result.scalar_one_or_none() is not None

    async def update_image_if_matches(
        self, event_id: UUID, current_url: str, image_url: str
    ) -> bool:
        """Replace an imported URL only if an admin has not changed it."""
        result = await self.session.execute(
            update(Event)
            .where(Event.id == event_id, Event.image_url == current_url)
            .values(image_url=image_url)
            .returning(Event.id)
        )
        return result.scalar_one_or_none() is not None


class ConnectorRepository(BaseRepository[EventConnector]):
    def __init__(self, session: AsyncSession):
        super().__init__(EventConnector, session)

    async def get_active(self):
        result = await self.session.execute(
            select(EventConnector).where(EventConnector.is_active == True).order_by(EventConnector.name)
        )
        return list(result.scalars().all())
