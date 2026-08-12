from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.repositories.message_repo import MessageRepository
from app.models.message import Message
from app.models.user import User
from app.models.shop import Shop
from app.models.listing import Listing
from app.models.enums import NotificationType
from app.core.exceptions import ForbiddenError
from app.services.notification_service import NotificationService


async def build_message_reference(db, tenant_id, m):
    if not m.reference_type or not m.reference_id:
        return None
    from app.services.reference_service import resolve_reference
    card = await resolve_reference(db, tenant_id, m.reference_type, m.reference_id)
    if card is None:
        return {"type": m.reference_type, "id": str(m.reference_id), "unavailable": True}
    return card


class MessageService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.message_repo = MessageRepository(db)

    async def get_threads(self, user_id: UUID, cursor=None, limit=20):
        result = await self.message_repo.get_threads(user_id, cursor, limit)

        enriched = []
        for thread in result.items:
            other_id = thread.participant_b if thread.participant_a == user_id else thread.participant_a

            # Get other party info
            user_result = await self.db.execute(select(User).where(User.id == other_id))
            other_user = user_result.scalar_one_or_none()

            shop_name = ""
            if other_user and other_user.shop_id:
                shop_result = await self.db.execute(select(Shop).where(Shop.id == other_user.shop_id))
                shop = shop_result.scalar_one_or_none()
                shop_name = shop.name if shop else ""

            # Get last message
            last_msg = None
            msg_result = await self.db.execute(
                select(Message).where(Message.thread_id == thread.id).order_by(Message.created_at.desc()).limit(1)
            )
            last_message = msg_result.scalar_one_or_none()
            if last_message:
                # Preview text: fall back to a media placeholder when the last
                # message has no text body but does have an attachment.
                preview = last_message.content or ""
                if not preview.strip() and last_message.attachment_url:
                    if last_message.attachment_type == "image":
                        preview = "📷 Photo"
                    elif last_message.attachment_type == "audio":
                        preview = "🎤 Voice note"
                    else:
                        preview = "🎥 Video"
                elif not preview.strip() and last_message.reference_type:
                    preview = f"🔗 Shared a {last_message.reference_type}"
                last_msg = {
                    "content": preview,
                    "sender_id": str(last_message.sender_id),
                    "created_at": str(last_message.created_at),
                    "attachment_url": last_message.attachment_url,
                    "attachment_type": last_message.attachment_type,
                    "attachment_thumbnail_url": last_message.attachment_thumbnail_url,
                    "reference_type": last_message.reference_type,
                }

            # Get listing info
            listing_info = None
            if thread.listing_id:
                listing_result = await self.db.execute(select(Listing).where(Listing.id == thread.listing_id))
                listing = listing_result.scalar_one_or_none()
                if listing:
                    listing_info = {"id": str(listing.id), "title": listing.title, "urgency": listing.urgency.value}

            unread = await self.message_repo.get_unread_count_for_thread(thread.id, user_id)

            enriched.append({
                "id": str(thread.id),
                "listing": listing_info,
                "other_party": {
                    "id": str(other_id),
                    "name": other_user.name if other_user else "Unknown",
                    "shop_name": shop_name,
                },
                "last_message": last_msg,
                "unread_count": unread,
                "last_message_at": str(thread.last_message_at) if thread.last_message_at else None,
            })

        return {"items": enriched, "next_cursor": result.next_cursor, "has_more": result.has_more}

    async def start_thread_with_shop(self, current_user_id: UUID, shop_id: UUID, listing_id: UUID | None = None):
        """Get or create a thread between current user and a shop's admin."""
        from app.core.exceptions import NotFoundError

        shop_result = await self.db.execute(select(Shop).where(Shop.id == shop_id))
        shop = shop_result.scalar_one_or_none()
        if not shop or not shop.admin_user_id:
            raise NotFoundError("Shop not found")

        if current_user_id == shop.admin_user_id:
            raise ForbiddenError("Cannot start a thread with your own shop")

        thread, created = await self.message_repo.get_or_create_thread(
            current_user_id, shop.admin_user_id, listing_id
        )
        return {"id": str(thread.id), "created": created}

    async def start_direct_thread(self, current_user_id: UUID, recipient_user_id: UUID):
        """Get or create a direct (no-listing) thread between two users.

        Used by Volunteer/Talent "Message" buttons where there is no listing.
        Participant order is canonicalized inside message_repo.get_or_create_thread,
        so (a,b) and (b,a) find the same row.
        """
        from app.core.exceptions import NotFoundError

        if current_user_id == recipient_user_id:
            raise ForbiddenError("Cannot start a thread with yourself")

        # Verify the recipient exists and is active.
        recipient_result = await self.db.execute(
            select(User).where(User.id == recipient_user_id)
        )
        recipient = recipient_result.scalar_one_or_none()
        if not recipient or not recipient.is_active:
            raise NotFoundError("Recipient not found")

        thread, created = await self.message_repo.get_or_create_thread(
            current_user_id, recipient_user_id, None
        )
        return {"id": str(thread.id), "created": created}

    async def get_thread_messages(self, thread_id: UUID, user_id: UUID, cursor=None, limit=50):
        if not await self.message_repo.is_participant(thread_id, user_id):
            raise ForbiddenError("Not a participant of this thread")

        # Mark as read
        await self.message_repo.mark_thread_read(thread_id, user_id)

        thread = await self.message_repo.get_thread_by_id(thread_id)
        tenant_id = thread.tenant_id if thread else None

        result = await self.message_repo.get_thread_messages(thread_id, cursor, limit)
        messages = [{
            "id": str(m.id), "thread_id": str(m.thread_id),
            "sender_id": str(m.sender_id), "content": m.content,
            "read_at": str(m.read_at) if m.read_at else None,
            "created_at": str(m.created_at),
            "attachment_url": m.attachment_url,
            "attachment_type": m.attachment_type,
            "attachment_thumbnail_url": m.attachment_thumbnail_url,
            "reference": await build_message_reference(self.db, tenant_id, m),
        } for m in result.items]

        return {"items": messages, "next_cursor": result.next_cursor, "has_more": result.has_more}

    async def send_message(
        self,
        thread_id: UUID,
        sender_id: UUID,
        content: str | None,
        attachment_url: str | None = None,
        attachment_type: str | None = None,
        attachment_thumbnail_url: str | None = None,
        reference_type: str | None = None,
        reference_id=None,
    ):
        if not await self.message_repo.is_participant(thread_id, sender_id):
            raise ForbiddenError("Not a participant of this thread")

        ref_type = ref_id = None
        if reference_type and reference_id:
            from app.services.reference_service import resolve_reference
            from app.core.exceptions import ValidationError as AppValidationError
            thread = await self.message_repo.get_thread_by_id(thread_id)
            tenant_id = thread.tenant_id if thread else None
            if isinstance(reference_id, UUID):
                ref_id = reference_id
            else:
                try:
                    ref_id = UUID(str(reference_id))
                except (ValueError, AttributeError, TypeError):
                    raise AppValidationError("Referenced item is unavailable")
            card = await resolve_reference(self.db, tenant_id, reference_type, ref_id)
            if card is None:
                raise AppValidationError("Referenced item is unavailable")
            ref_type = reference_type

        # The DB column is NOT NULL; coerce a missing/whitespace-only body
        # to an empty string for media-only messages. The schema validator
        # already guarantees at least one of (content, attachment_url) is set.
        body = (content or "").strip() if content else ""
        msg = await self.message_repo.create_message(
            thread_id,
            sender_id,
            body,
            attachment_url=attachment_url,
            attachment_type=attachment_type,
            attachment_thumbnail_url=attachment_thumbnail_url,
            reference_type=ref_type,
            reference_id=ref_id,
        )
        try:
            thread = await self.message_repo.get_thread_by_id(thread_id)
            if thread:
                recipient_id = thread.participant_b if thread.participant_a == sender_id else thread.participant_a
                # Notification body: prefer the text, fall back to a media
                # placeholder when the message is attachment-only.
                if body:
                    notif_body = f"You have a new message: '{body[:50]}{'...' if len(body) > 50 else ''}'"
                elif attachment_url:
                    if attachment_type == "image":
                        notif_body = "You have a new photo"
                    elif attachment_type == "audio":
                        notif_body = "You have a new voice note"
                    else:
                        notif_body = "You have a new video"
                elif ref_type:
                    notif_body = "You have a new message"
                else:
                    notif_body = "You have a new message"
                notification_service = NotificationService(self.db)
                await notification_service.notify(
                    user_id=recipient_id,
                    type=NotificationType.NEW_MESSAGE,
                    title="New Message",
                    body=notif_body,
                    data={"thread_id": str(thread_id)},
                )
        except Exception:
            pass
        return msg

    async def get_unread_count(self, user_id: UUID) -> int:
        return await self.message_repo.get_unread_count(user_id)
