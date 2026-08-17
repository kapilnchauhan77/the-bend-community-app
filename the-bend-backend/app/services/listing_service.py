from uuid import UUID, uuid4
import hashlib
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.repositories.listing_repo import ListingRepository
from app.models.user import User
from app.models.tenant import Tenant
from app.models.shop import Shop
from app.models.enums import ListingStatus, UrgencyLevel
from app.core.exceptions import NotFoundError, ForbiddenError, BusinessRuleViolation
from app.schemas.listing import ListingCreate, ListingUpdate
from app.models.enums import NotificationType
from app.services.notification_service import NotificationService


async def queue_urgent_listing_notifications(db: AsyncSession, listing):
    """Queue one native event per eligible Westmoreland recipient.

    The transaction advisory lock serializes duplicate attempts while the JSONB
    marker makes retries idempotent without adding an outbox schema column.
    """
    tenant = (await db.execute(select(Tenant).where(Tenant.id == listing.tenant_id))).scalar_one_or_none()
    if not tenant or tenant.slug != "westmoreland":
        return
    author_id = listing.posted_by_user_id
    if author_id is None and listing.shop_id:
        author_id = (await db.execute(select(Shop.admin_user_id).where(Shop.id == listing.shop_id))).scalar_one_or_none()
    users = (await db.execute(select(User).where(User.tenant_id == listing.tenant_id, User.is_active.is_(True)).order_by(User.id))).scalars().all()
    from app.models.notification import Notification
    for user in users:
        if user.id == author_id:
            continue
        key = f"urgent-listing:{listing.id}:{user.id}"
        lock_digest = hashlib.sha256(key.encode("utf-8")).digest()[:8]
        lock_key = int.from_bytes(lock_digest, byteorder="big", signed=True)
        await db.execute(text("SELECT pg_advisory_xact_lock(:lock_key)"), {"lock_key": lock_key})
        existing = await db.execute(select(Notification.id).where(
            Notification.user_id == user.id,
            Notification.tenant_id == listing.tenant_id,
            Notification.type == NotificationType.NEW_URGENT_LISTING,
            Notification.data["_idempotency_key"].astext == key,
        ).limit(1))
        if existing.scalar_one_or_none() is not None:
            continue
        await NotificationService(db).notify(
            user_id=user.id,
            type=NotificationType.NEW_URGENT_LISTING,
            title="Urgent listing",
            body="A new urgent listing is available",
            data={
                "target_type": "listing", "target_id": str(listing.id),
                "_idempotency_key": key,
            },
            category="urgent_listing_published",
            tenant_id=listing.tenant_id,
        )


def _user_owns_listing(listing, current_user: User) -> bool:
    """A user 'owns' a listing if it belongs to their shop OR they personally
    posted it (posted_by_user_id == user.id)."""
    if current_user is None:
        return False
    if listing.shop_id is not None and current_user.shop_id is not None \
            and listing.shop_id == current_user.shop_id:
        return True
    if listing.posted_by_user_id is not None and listing.posted_by_user_id == current_user.id:
        return True
    return False


class ListingService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.listing_repo = ListingRepository(db)

    async def browse_listings(self, status: str | None = None, tenant_id=None, viewer_id=None, **kwargs):
        return await self.listing_repo.browse(status=status, tenant_id=tenant_id, viewer_id=viewer_id, **kwargs)

    async def get_listing(self, listing_id: UUID, current_user=None):
        listing = await self.listing_repo.get_detail(listing_id)
        if not listing:
            raise NotFoundError("Listing")
        if current_user is not None and current_user.tenant_id is not None:
            from app.services.block_service import BlockService
            # Match browse/shop-listing semantics: an explicit poster owns
            # the listing; only listings without one inherit shop ownership.
            author_id = listing.posted_by_user_id
            if author_id is None and listing.shop is not None:
                author_id = listing.shop.admin_user_id
            if author_id and await BlockService(self.db).is_blocked_by(
                current_user.id, author_id, current_user.tenant_id
            ):
                raise NotFoundError("Listing")

        # Increment views (simplified - Redis dedup in Phase 8)
        await self.listing_repo.increment_views(listing_id)

        # Check viewer interest
        viewer_has_interest = False
        if current_user:
            from app.models.interest import Interest
            from sqlalchemy import select
            result = await self.db.execute(
                select(Interest).where(
                    Interest.listing_id == listing_id,
                    Interest.user_id == current_user.id,
                )
            )
            viewer_has_interest = result.scalar_one_or_none() is not None

        return listing, viewer_has_interest

    async def create_listing(self, data: ListingCreate, current_user: User):
        from app.services.content_moderation_service import ContentModerationService
        ContentModerationService().validate_public_text({"title": data.title, "description": data.description, "price_text": data.price_text})
        is_volunteer = data.category == "volunteer"

        # Authorization: any signed-in user may post any category. If the
        # caller belongs to a shop, the listing is attached to that shop;
        # otherwise the user is stamped as posted_by_user_id (a "Community
        # member" listing). The category-specific UX still distinguishes
        # volunteer opportunities downstream via pricing normalization
        # below.
        shop_id = current_user.shop_id
        posted_by_user_id = None if shop_id else current_user.id

        # Check urgent listing rate limit (only meaningful when attached to a shop)
        if data.urgency == "urgent" and shop_id is not None:
            urgent_count = await self.listing_repo.count_active_urgent(shop_id)
            if urgent_count >= 3:
                raise BusinessRuleViolation("Maximum 3 active urgent listings per business")

        # Normalize pricing fields by mode — clear values that don't apply.
        # Volunteer opportunities are always free; price fields the caller
        # sent are ignored.
        if is_volunteer:
            pt = "free"
            clean_price = None
            clean_price_max = None
            clean_price_unit = None
            clean_price_text = None
        else:
            pt = data.pricing_type
            clean_price = data.price if pt in ("fixed", "hourly", "range") else None
            clean_price_max = data.price_max if pt == "range" else None
            clean_price_unit = data.price_unit if pt in ("hourly", "range") else None
            clean_price_text = data.price_text if pt == "custom" else None

        listing = await self.listing_repo.create({
            "id": uuid4(),
            "shop_id": shop_id,
            "posted_by_user_id": posted_by_user_id,
            "tenant_id": current_user.tenant_id,
            "type": data.type,
            "category": data.category,
            "title": data.title,
            "description": data.description,
            "quantity": data.quantity,
            "unit": data.unit,
            "expiry_date": data.expiry_date,
            "pricing_type": pt,
            "price": clean_price,
            "price_max": clean_price_max,
            "price_unit": clean_price_unit,
            "price_text": clean_price_text,
            "is_free": pt == "free",
            "urgency": data.urgency,
        })

        # Handle images
        if data.image_ids:
            from app.models.listing import ListingImage
            for i, img_url in enumerate(data.image_ids):
                image = ListingImage(
                    id=uuid4(),
                    listing_id=listing.id,
                    url=img_url,
                    thumbnail_url=img_url,
                    sort_order=i,
                )
                self.db.add(image)
            await self.db.flush()

        await self.db.flush()
        if data.urgency == "urgent":
            await queue_urgent_listing_notifications(self.db, listing)
        return listing

    async def update_listing(self, listing_id: UUID, data: ListingUpdate, current_user: User):
        listing = await self.listing_repo.get_by_id(listing_id)
        if not listing:
            raise NotFoundError("Listing")

        # Ownership check: community admins can moderate; otherwise the
        # caller must either own the listing's shop OR have personally posted
        # it (posted_by_user_id == user.id).
        if current_user.role.value != "community_admin" and not _user_owns_listing(listing, current_user):
            raise ForbiddenError("Cannot modify another shop's listing")

        update_data = data.model_dump(exclude_unset=True)
        from app.services.content_moderation_service import ContentModerationService
        ContentModerationService().validate_public_text({k: update_data.get(k) for k in ("title", "description", "price_text")})

        # image_ids isn't a column — pop it and sync the listing_images table.
        new_image_urls = update_data.pop("image_ids", None)

        # If pricing_type is being changed, normalize the payload
        # and keep is_free in sync.
        if "pricing_type" in update_data:
            pt = update_data["pricing_type"]
            update_data["is_free"] = (pt == "free")
            if pt not in ("fixed", "hourly", "range"):
                update_data["price"] = None
            if pt != "range":
                update_data["price_max"] = None
            if pt not in ("hourly", "range"):
                update_data["price_unit"] = None
            if pt != "custom":
                update_data["price_text"] = None

        updated = await self.listing_repo.update(listing_id, update_data) if update_data else listing

        if new_image_urls is not None:
            from sqlalchemy import delete, select
            from app.models.listing import ListingImage

            # Replace strategy: delete rows whose url is no longer in the new set,
            # add rows for new urls, and resequence sort_order to match the client.
            existing = (await self.db.execute(
                select(ListingImage).where(ListingImage.listing_id == listing_id)
            )).scalars().all()
            existing_by_url = {img.url: img for img in existing}
            keep_urls = set(new_image_urls)

            for img in existing:
                if img.url not in keep_urls:
                    await self.db.delete(img)

            for i, url in enumerate(new_image_urls):
                if url in existing_by_url:
                    existing_by_url[url].sort_order = i
                else:
                    self.db.add(ListingImage(
                        id=uuid4(),
                        listing_id=listing_id,
                        url=url,
                        thumbnail_url=url,
                        sort_order=i,
                    ))
            await self.db.commit()

        return updated

    async def fulfill_listing(self, listing_id: UUID, current_user: User):
        listing = await self.listing_repo.get_by_id(listing_id)
        if not listing:
            raise NotFoundError("Listing")
        if not _user_owns_listing(listing, current_user):
            raise ForbiddenError("Can only fulfill your own listings")

        return await self.listing_repo.update(listing_id, {
            "status": ListingStatus.FULFILLED,
            "fulfilled_at": datetime.utcnow(),
        })

    async def delete_listing(self, listing_id: UUID, current_user: User, reason: str | None = None):
        listing = await self.listing_repo.get_by_id(listing_id)
        if not listing:
            raise NotFoundError("Listing")
        if current_user.role.value != "community_admin" and not _user_owns_listing(listing, current_user):
            raise ForbiddenError("Cannot delete another shop's listing")

        return await self.listing_repo.update(listing_id, {"status": ListingStatus.DELETED})
