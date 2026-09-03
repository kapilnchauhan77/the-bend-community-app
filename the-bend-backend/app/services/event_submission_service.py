from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import NotificationType, UserRole
from app.models.event import Event
from app.models.user import User
from app.services.notification_service import NotificationService


async def mark_event_paid_and_notify(db: AsyncSession, event: Event) -> bool:
    """Transition a submitted event to paid and notify its tenant admins once."""
    if event.paid:
        return False
    event.paid = True
    if event.source == "submission":
        try:
            admins = (await db.execute(select(User).where(
                User.role == UserRole.COMMUNITY_ADMIN,
                User.is_active == True,
                User.tenant_id == event.tenant_id,
            ))).scalars().all()
            notifier = NotificationService(db)
            for admin in admins:
                await notifier.notify(
                    user_id=admin.id,
                    type=NotificationType.EVENT_SUBMITTED,
                    title="New Event Awaiting Approval",
                    body=f"{event.title} has been submitted and is awaiting review.",
                    data={"event_id": str(event.id)},
                    tenant_id=event.tenant_id,
                )
        except Exception:
            # Keep submission success independent of notification delivery.
            pass
    await db.flush()
    return True
