from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db
from app.services.event_service import EventService

router = APIRouter(prefix="/events", tags=["Events"])


def get_service(db: AsyncSession = Depends(get_db)):
    return EventService(db)


def _serialize_event(e):
    return {
        "id": str(e.id),
        "title": e.title,
        "description": e.description,
        "start_date": str(e.start_date),
        "end_date": str(e.end_date) if e.end_date else None,
        "location": e.location,
        "category": e.category.value if hasattr(e.category, "value") else e.category,
        "image_url": e.image_url,
        "source": e.source,
        "source_url": e.source_url,
        "is_featured": e.is_featured,
        "status": e.status.value if hasattr(e.status, "value") else e.status,
        "created_at": str(e.created_at),
    }


@router.get("")
async def list_events(
    category: str | None = Query(None),
    start_after: str | None = Query(None),
    start_before: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(50, le=200),
    service: EventService = Depends(get_service),
):
    sa = datetime.fromisoformat(start_after) if start_after else None
    sb = datetime.fromisoformat(start_before) if start_before else None
    result = await service.browse_events(category=category, start_after=sa, start_before=sb, cursor=cursor, limit=limit)
    items = [_serialize_event(e) for e in result.items]
    return {"items": items, "next_cursor": result.next_cursor, "has_more": result.has_more}


@router.get("/upcoming")
async def upcoming_events(
    limit: int = Query(5, le=20),
    service: EventService = Depends(get_service),
):
    events = await service.get_upcoming(limit)
    return {"items": [_serialize_event(e) for e in events]}


@router.get("/{event_id}")
async def get_event(event_id: UUID, service: EventService = Depends(get_service)):
    event = await service.get_event(event_id)
    return _serialize_event(event)
