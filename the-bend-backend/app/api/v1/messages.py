from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.services.message_service import MessageService
from app.schemas.message import SendMessageRequest

router = APIRouter(prefix="/messages", tags=["Messages"])


def get_message_service(db: AsyncSession = Depends(get_db)):
    return MessageService(db)


@router.get("/threads")
async def get_threads(
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: MessageService = Depends(get_message_service),
    current_user: User = Depends(get_current_user),
):
    return await service.get_threads(current_user.id, cursor, limit)


@router.get("/threads/{thread_id}")
async def get_thread_messages(
    thread_id: UUID,
    cursor: str | None = Query(None),
    limit: int = Query(50, le=100),
    service: MessageService = Depends(get_message_service),
    current_user: User = Depends(get_current_user),
):
    return await service.get_thread_messages(thread_id, current_user.id, cursor, limit)


@router.post("/threads/{thread_id}")
async def send_message(
    thread_id: UUID,
    data: SendMessageRequest,
    service: MessageService = Depends(get_message_service),
    current_user: User = Depends(get_current_user),
):
    msg = await service.send_message(thread_id, current_user.id, data.content)
    return {"id": str(msg.id), "created_at": str(msg.created_at)}


@router.get("/unread-count")
async def get_unread_count(
    service: MessageService = Depends(get_message_service),
    current_user: User = Depends(get_current_user),
):
    count = await service.get_unread_count(current_user.id)
    return {"unread_count": count}
