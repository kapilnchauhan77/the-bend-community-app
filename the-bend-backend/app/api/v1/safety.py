from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.schemas.moderation import UserBlockCreateResponse, UserBlockListResponse
from app.services.block_service import BlockService

router = APIRouter(prefix="/safety", tags=["Safety"])


@router.post("/blocks/{user_id}", response_model=UserBlockCreateResponse, status_code=201)
async def block_user(user_id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = await BlockService(db).create(current_user.id, user_id, current_user.tenant_id)
    return {"id": str(row.id), "blocked_user_id": str(row.blocked_id), "created_at": row.created_at}


@router.delete("/blocks/{user_id}", status_code=204)
async def unblock_user(user_id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await BlockService(db).remove(current_user.id, user_id, current_user.tenant_id)


@router.get("/blocks", response_model=UserBlockListResponse)
async def list_blocks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"items": await BlockService(db).list_for(current_user.id, current_user.tenant_id)}
