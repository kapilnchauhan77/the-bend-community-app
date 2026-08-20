from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.event_repo import EventRepository, ConnectorRepository
from app.schemas.event import EventCreate, EventUpdate, ConnectorCreate, ConnectorUpdate
from app.core.exceptions import NotFoundError, ValidationError
from app.services.external_urls import normalize_external_url


class EventService:
    def __init__(self, db: AsyncSession, tenant_id=None):
        self.db = db
        self.tenant_id = tenant_id
        self.event_repo = EventRepository(db)
        self.connector_repo = ConnectorRepository(db)

    # Events
    async def create_event(self, data: EventCreate):
        from app.services.content_moderation_service import ContentModerationService
        ContentModerationService().validate_public_text({"title": data.title, "description": data.description, "location": data.location})
        return await self.event_repo.create({
            "id": uuid4(),
            "title": data.title,
            "description": data.description,
            "start_date": data.start_date,
            "end_date": data.end_date,
            "location": data.location,
            "category": data.category,
            "image_url": data.image_url,
            "is_featured": data.is_featured,
            "source": "manual",
            "tenant_id": self.tenant_id,
        })

    async def update_event(self, event_id: UUID, data: EventUpdate):
        if self.tenant_id is None:
            raise NotFoundError("Event")
        event = await self.event_repo.get_by_id_for_tenant(event_id, self.tenant_id)
        if not event:
            raise NotFoundError("Event")
        update = data.model_dump(exclude_unset=True)
        from app.services.content_moderation_service import ContentModerationService
        ContentModerationService().validate_public_text({k: update.get(k) for k in ("title", "description", "location")})
        return await self.event_repo.update_for_tenant(event_id, self.tenant_id, update)

    async def delete_event(self, event_id: UUID):
        if self.tenant_id is None:
            raise NotFoundError("Event")
        event = await self.event_repo.get_by_id_for_tenant(event_id, self.tenant_id)
        if not event:
            raise NotFoundError("Event")
        return await self.event_repo.delete_for_tenant(event_id, self.tenant_id)

    async def get_event(self, event_id: UUID, viewer_id: UUID | None = None):
        event = await self.event_repo.get_visible_by_id(event_id, self.tenant_id, viewer_id)
        if not event:
            raise NotFoundError("Event")
        return event

    async def browse_events(self, category=None, start_after=None, start_before=None, search=None, cursor=None, limit=50, viewer_id=None):
        return await self.event_repo.browse(
            category=category,
            start_after=start_after,
            start_before=start_before,
            search=search,
            cursor=cursor,
            limit=limit,
            tenant_id=self.tenant_id,
            viewer_id=viewer_id,
        )

    async def get_upcoming(self, limit=5, viewer_id=None):
        return await self.event_repo.get_upcoming(limit, tenant_id=self.tenant_id, viewer_id=viewer_id)

    async def list_all_events(self, cursor=None, limit=20):
        from app.models.event import Event
        if self.tenant_id is None:
            raise NotFoundError("Tenant")
        filters = [Event.tenant_id == self.tenant_id]
        return await self.event_repo.get_all(filters=filters, limit=limit, cursor=cursor)

    # Connectors
    async def create_connector(self, data: ConnectorCreate):
        if self.tenant_id is None:
            raise NotFoundError("Tenant")
        try:
            connector_url = normalize_external_url(data.url)
        except ValueError as exc:
            raise ValidationError("Connector URL must be a public HTTP(S) URL") from exc
        return await self.connector_repo.create({
            "id": uuid4(),
            "name": data.name,
            "type": data.type,
            "url": connector_url,
            "category": data.category,
            "is_active": data.is_active,
            "config": data.config,
            "tenant_id": self.tenant_id,
        })

    async def update_connector(self, connector_id: UUID, data: ConnectorUpdate):
        if self.tenant_id is None:
            raise NotFoundError("Connector")
        connector = await self.connector_repo.get_by_id_for_tenant(
            connector_id, self.tenant_id
        )
        if not connector:
            raise NotFoundError("Connector")
        update = data.model_dump(exclude_unset=True)
        if "url" in update:
            try:
                update["url"] = normalize_external_url(update["url"])
            except ValueError as exc:
                raise ValidationError(
                    "Connector URL must be a public HTTP(S) URL"
                ) from exc
        return await self.connector_repo.update_for_tenant(
            connector_id, self.tenant_id, update
        )

    async def delete_connector(self, connector_id: UUID):
        if self.tenant_id is None:
            raise NotFoundError("Connector")
        connector = await self.connector_repo.get_by_id_for_tenant(
            connector_id, self.tenant_id
        )
        if not connector:
            raise NotFoundError("Connector")
        return await self.connector_repo.delete_for_tenant(
            connector_id, self.tenant_id
        )

    async def list_connectors(self):
        from app.models.event import EventConnector
        if self.tenant_id is None:
            raise NotFoundError("Tenant")
        filters = [EventConnector.tenant_id == self.tenant_id]
        result = await self.connector_repo.get_all(filters=filters, limit=100)
        return result.items

    async def get_connector(self, connector_id: UUID):
        if self.tenant_id is None:
            raise NotFoundError("Connector")
        connector = await self.connector_repo.get_by_id_for_tenant(
            connector_id, self.tenant_id
        )
        if not connector:
            raise NotFoundError("Connector")
        return connector

    async def get_active_connectors(self):
        if self.tenant_id is None:
            raise NotFoundError("Tenant")
        return await self.connector_repo.get_active(self.tenant_id)
