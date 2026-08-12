from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.services.message_service import MessageService
from app.schemas.message import SendMessageRequest, StartThreadRequest

router = APIRouter(prefix="/messages", tags=["Messages"])


def get_message_service(db: AsyncSession = Depends(get_db)):
    return MessageService(db)


@router.post("/threads")
async def start_thread(
    data: StartThreadRequest,
    service: MessageService = Depends(get_message_service),
    current_user: User = Depends(get_current_user),
):
    """Start (or fetch existing) a message thread.

    Three modes, in priority order:
      1. listing_id provided        -> thread tied to the listing's shop admin
                                       (existing behavior).
      2. shop_id  provided (no listing) -> thread with the shop's admin.
      3. recipient_user_id provided -> direct user-to-user thread (no listing)
                                       — used by Volunteer/Talent "Message".

    Rejects requests that provide none of the three. Self-messaging is
    rejected at the service layer.
    """
    listing_id = UUID(data.listing_id) if data.listing_id else None
    if data.shop_id:
        return await service.start_thread_with_shop(
            current_user.id, UUID(data.shop_id), listing_id
        )
    if data.recipient_user_id:
        recipient_id = UUID(data.recipient_user_id)
        if recipient_id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot start a thread with yourself",
            )
        return await service.start_direct_thread(current_user.id, recipient_id)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Provide listing_id, shop_id, or recipient_user_id",
    )


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
    msg = await service.send_message(
        thread_id,
        current_user.id,
        data.content,
        attachment_url=data.attachment_url,
        attachment_type=data.attachment_type,
        attachment_thumbnail_url=data.attachment_thumbnail_url,
        reference_type=data.reference_type,
        reference_id=data.reference_id,
    )
    return {
        "id": str(msg.id),
        "thread_id": str(msg.thread_id),
        "sender_id": str(msg.sender_id),
        "content": msg.content,
        "created_at": str(msg.created_at),
        "attachment_url": msg.attachment_url,
        "attachment_type": msg.attachment_type,
        "attachment_thumbnail_url": msg.attachment_thumbnail_url,
    }


@router.get("/unread-count")
async def get_unread_count(
    service: MessageService = Depends(get_message_service),
    current_user: User = Depends(get_current_user),
):
    count = await service.get_unread_count(current_user.id)
    return {"unread_count": count}
