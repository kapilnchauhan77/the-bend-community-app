from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.talent_service import TalentService
from app.schemas.talent import TalentCreate, TalentInquiryCreate

router = APIRouter(prefix="/talent", tags=["Talent"])


def get_service(db: AsyncSession = Depends(get_db)):
    return TalentService(db)


@router.post("")
async def register_talent(data: TalentCreate, service: TalentService = Depends(get_service)):
    t = await service.register(data)
    return {"id": str(t.id), "name": t.name}


@router.get("")
async def list_talent(
    category: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: TalentService = Depends(get_service),
):
    result = await service.list_talent(category, cursor, limit)
    items = [{
        "id": str(t.id),
        "name": t.name,
        "phone": t.phone,
        "category": t.category,
        "skills": t.skills,
        "available_time": t.available_time,
        "rate": float(t.rate),
        "rate_unit": t.rate_unit,
        "created_at": str(t.created_at),
    } for t in result.items]
    return {"items": items, "next_cursor": result.next_cursor, "has_more": result.has_more}


@router.post("/{talent_id}/inquiries")
async def create_inquiry(
    talent_id: UUID,
    data: TalentInquiryCreate,
    service: TalentService = Depends(get_service),
):
    return await service.create_inquiry(talent_id, data)
