from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.services.notification_service import NotificationService
from app.schemas.notification import PushSubscriptionRequest, NotificationPreferencesRequest

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def get_notification_service(db: AsyncSession = Depends(get_db)):
    return NotificationService(db)


@router.get("")
async def get_notifications(
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    unread_only: bool = Query(False),
    service: NotificationService = Depends(get_notification_service),
    current_user: User = Depends(get_current_user),
):
    return await service.get_notifications(current_user.id, cursor, limit, unread_only)


@router.patch("/{notification_id}/read")
async def mark_read(
    notification_id: UUID,
    service: NotificationService = Depends(get_notification_service),
    current_user: User = Depends(get_current_user),
):
    await service.mark_read(notification_id, current_user.id)
    return {"status": "read"}


@router.patch("/read-all")
async def mark_all_read(
    service: NotificationService = Depends(get_notification_service),
    current_user: User = Depends(get_current_user),
):
    count = await service.mark_all_read(current_user.id)
    return {"updated_count": count}


@router.get("/unread-count")
async def get_unread_count(
    service: NotificationService = Depends(get_notification_service),
    current_user: User = Depends(get_current_user),
):
    count = await service.get_unread_count(current_user.id)
    return {"unread_count": count}


@router.post("/push-subscription", status_code=status.HTTP_201_CREATED)
async def register_push_subscription(
    data: PushSubscriptionRequest,
    service: NotificationService = Depends(get_notification_service),
    current_user: User = Depends(get_current_user),
):
    await service.register_push_subscription(
        current_user.id,
        data.endpoint,
        data.keys.get("p256dh", ""),
        data.keys.get("auth", ""),
    )
    return {"status": "registered"}


@router.put("/preferences")
async def update_preferences(
    data: NotificationPreferencesRequest,
    service: NotificationService = Depends(get_notification_service),
    current_user: User = Depends(get_current_user),
):
    await service.update_preferences(current_user.id, data.model_dump())
    return {"status": "updated"}
