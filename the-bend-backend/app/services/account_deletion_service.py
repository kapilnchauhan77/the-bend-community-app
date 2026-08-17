from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select, update, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, UnauthorizedError
from app.core.security import hash_password, verify_password
from app.models.account_deletion import AccountDeletion, AccountOwnedUpload
from app.models.device_installation import DeviceInstallation
from app.models.notification import Notification
from app.models.notification_preference import NotificationPreference
from app.models.push_subscription import PushSubscription
from app.models.refresh_session import RefreshSession
from app.models.user import User
from app.models.user_block import UserBlock
from app.models.saved_listing import SavedListing
from app.models.interest import Interest
from app.models.endorsement import Endorsement
from app.models.volunteer import Volunteer
from app.models.talent import Talent


class AccountDeletionService:
    RECEIPT_TTL = timedelta(days=7)

    @staticmethod
    def retention_inventory() -> dict[str, str]:
        """Explicit policy for every current table with a users FK."""
        return {
            "users": "anonymize", "refresh_sessions": "delete", "device_installations": "delete",
            "notification_preferences": "delete", "notifications": "delete", "push_subscriptions": "delete",
            "saved_listings": "delete", "interests": "delete", "user_blocks": "delete", "endorsements": "delete",
            "volunteers": "delete", "talent": "delete", "talent_inquiries": "delete", "bender_likes": "delete",
            "bender_comments": "delete", "bender_posts": "retain", "message_threads": "retain", "messages": "retain",
            "reports": "retain", "report_audits": "retain", "listings": "detach", "listing_images": "retain",
            "shops": "detach", "events": "detach", "tenant_referrals": "detach", "guidelines": "retain",
            "employees": "detach", "discount_codes": "delete",
            "account_deletions": "retain", "account_owned_uploads": "delete",
        }

    def __init__(self, db: AsyncSession, *, queue=None):
        self.db = db
        self.queue = queue

    @staticmethod
    def _hash_receipt(receipt: str) -> str:
        return hashlib.sha256(receipt.encode("utf-8")).hexdigest()

    async def confirm(self, user: User, password: str, send_confirmation: bool = False) -> tuple[AccountDeletion, str]:
        if not verify_password(password, user.password_hash):
            raise UnauthorizedError("Invalid password")

        # Lock the user row before deciding whether a request exists.  This is
        # the serialization point for concurrent confirmation attempts.
        locked = (await self.db.execute(select(User).where(User.id == user.id, User.tenant_id == user.tenant_id).with_for_update())).scalar_one_or_none()
        if locked is None or locked.id != user.id:
            raise UnauthorizedError("Invalid password")
        existing = (await self.db.execute(select(AccountDeletion).where(
            AccountDeletion.user_id == user.id,
            AccountDeletion.tenant_id == user.tenant_id,
            AccountDeletion.status.in_(["pending", "processing"]),
        ).order_by(AccountDeletion.created_at).with_for_update())).scalar_one_or_none()
        if existing is not None:
            # Never return the old receipt; an already locked caller cannot
            # mint another bearer credential.
            raise ConflictError("Account deletion already requested")

        receipt = secrets.token_urlsafe(32)
        now = datetime.utcnow()
        deletion = AccountDeletion(
            user_id=user.id,
            tenant_id=user.tenant_id,
            receipt_hash=self._hash_receipt(receipt),
            receipt_expires_at=now + self.RECEIPT_TTL,
            send_confirmation=send_confirmation,
            confirmation_email=user.email if send_confirmation else None,
        )
        self.db.add(deletion)
        locked.is_active = False
        await self.db.execute(update(RefreshSession).where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None)).values(revoked_at=now))
        installations = (await self.db.execute(select(DeviceInstallation).where(DeviceInstallation.user_id == user.id, DeviceInstallation.tenant_id == user.tenant_id))).scalars().all()
        for installation in installations:
            installation.enabled = False
            installation.provider_token = f"revoked:{installation.id}"
            installation.revocation_secret_hash = "revoked"
        await self.db.flush()
        await self.db.commit()
        try:
            if self.queue is not None:
                self.queue.delay(str(deletion.id))
        except Exception:
            # The lock and durable request are intentionally retained.  A
            # reconciler can enqueue pending rows safely.
            return deletion, receipt
        return deletion, receipt

    async def status(self, receipt: str, tenant_id: uuid.UUID | None = None) -> AccountDeletion:
        if not receipt or len(receipt) > 256:
            raise NotFoundError("Deletion status")
        query = select(AccountDeletion).where(AccountDeletion.receipt_hash == self._hash_receipt(receipt))
        if tenant_id is not None:
            query = query.where(AccountDeletion.tenant_id == tenant_id)
        row = (await self.db.execute(query)).scalar_one_or_none()
        if row is None or row.receipt_expires_at is None or row.receipt_expires_at <= datetime.utcnow():
            raise NotFoundError("Deletion status")
        return row

    async def consume_terminal_receipt(self, receipt: str, tenant_id: uuid.UUID | None = None) -> AccountDeletion:
        row = await self.status(receipt, tenant_id)
        if row.status == "completed":
            # Public terminal polling is the sole receipt-consuming API. Keep
            # pending reads non-destructive for retryable progress polling.
            row.receipt_hash = None
            row.receipt_expires_at = None
            await self.db.flush()
        return row

    async def erase(self, deletion_id: str) -> bool:
        try:
            deletion_uuid = uuid.UUID(str(deletion_id))
        except (ValueError, TypeError, AttributeError):
            return False
        row = (await self.db.execute(select(AccountDeletion).where(AccountDeletion.id == deletion_uuid).with_for_update())).scalar_one_or_none()
        if row is None or row.status == "completed":
            return row is not None
        if row.status == "processing" and row.claimed_at and row.claimed_at > datetime.utcnow() - timedelta(minutes=15):
            return False
        row.status = "processing"
        row.claimed_at = datetime.utcnow()
        row.attempts += 1
        await self.db.flush()
        user = (await self.db.execute(select(User).where(User.id == row.user_id, User.tenant_id == row.tenant_id).with_for_update())).scalar_one_or_none()
        if user is None:
            row.status, row.completed_at = "completed", datetime.utcnow()
            row.confirmation_email = None
            await self.db.commit()
            return True
        uid = user.id
        # Claim the optional email before any network call.  The marker is
        # durable, so a crash/retry can never send twice.
        if row.send_confirmation and row.confirmation_email and row.email_sent_at is None:
            address = row.confirmation_email
            row.email_sent_at = datetime.utcnow()
            await self.db.commit()
            try:
                from app.services.email_service import email_service
                if not email_service.send_account_deletion_confirmation(address, idempotency_key=f"account-deletion:{row.id}"):
                    raise RuntimeError("delivery failed")
            except Exception:
                # Delivery outcome is deliberately non-retryable: the attempt
                # marker is durable and prevents duplicate email on retries.
                row.last_error_code = "confirmation_delivery_failed"
                await self.db.flush()
        # Delete private/account-owned rows. Shared messages, reports, audits,
        # public listings, shops and legally retained transactions remain.
        from app.models.listing import Listing
        from app.models.shop import Shop
        from app.models.employee import Employee
        from app.models.discount_code import DiscountCode
        # User-global children are narrowed through their tenant-owned parent
        # where they lack a tenant column (saved listings/interests, pushes,
        # refresh sessions, Bender reactions). This prevents a malformed or
        # legacy cross-tenant row from being erased by user UUID alone.
        listing_in_tenant = select(Listing.id).where(Listing.tenant_id == row.tenant_id)
        user_in_tenant = select(User.id).where(User.id == uid, User.tenant_id == row.tenant_id)
        for model, predicate in (
            (SavedListing, (SavedListing.user_id == uid) & SavedListing.listing_id.in_(listing_in_tenant)),
            (Interest, (Interest.user_id == uid) & Interest.listing_id.in_(listing_in_tenant)),
            (Notification, (Notification.user_id == uid) & (Notification.tenant_id == row.tenant_id)),
            (PushSubscription, PushSubscription.user_id.in_(user_in_tenant)),
            (NotificationPreference, (NotificationPreference.user_id == uid) & (NotificationPreference.tenant_id == row.tenant_id)),
            (DeviceInstallation, (DeviceInstallation.user_id == uid) & (DeviceInstallation.tenant_id == row.tenant_id)),
            (RefreshSession, RefreshSession.user_id.in_(user_in_tenant)),
            (Volunteer, (Volunteer.user_id == uid) & (Volunteer.tenant_id == row.tenant_id)),
            (Talent, (Talent.user_id == uid) & (Talent.tenant_id == row.tenant_id)),
        ):
            await self.db.execute(delete(model).where(predicate))
        await self.db.execute(delete(UserBlock).where(UserBlock.tenant_id == row.tenant_id, (UserBlock.blocker_id == uid) | (UserBlock.blocked_id == uid)))
        await self.db.execute(delete(Endorsement).where(
            Endorsement.endorser_user_id == uid,
            exists(select(Shop.id).where(Shop.id == Endorsement.endorsed_shop_id, Shop.tenant_id == row.tenant_id)),
        ))
        from app.models.bender import BenderPost, BenderLike, BenderComment
        post_in_tenant = select(BenderPost.id).where(BenderPost.tenant_id == row.tenant_id)
        await self.db.execute(delete(BenderLike).where(BenderLike.user_id == uid, BenderLike.post_id.in_(post_in_tenant)))
        await self.db.execute(delete(BenderComment).where(BenderComment.user_id == uid, BenderComment.post_id.in_(post_in_tenant)))
        await self.db.execute(update(Shop).where(Shop.admin_user_id == uid, Shop.tenant_id == row.tenant_id).values(admin_user_id=None))
        await self.db.execute(update(Employee).where(Employee.user_id == uid, Employee.shop_id.in_(select(Shop.id).where(Shop.tenant_id == row.tenant_id))).values(user_id=None))
        await self.db.execute(delete(DiscountCode).where(DiscountCode.owner_user_id == uid, DiscountCode.tenant_id == row.tenant_id))
        from app.models.event import Event
        await self.db.execute(update(Event).where(Event.submitted_by_user_id == uid, Event.tenant_id == row.tenant_id).values(submitted_by_user_id=None))
        from app.models.tenant_referral import TenantReferral
        await self.db.execute(update(TenantReferral).where(TenantReferral.referrer_user_id == uid, TenantReferral.referrer_tenant_id == row.tenant_id).values(referrer_user_id=None))
        # Only ledgered paths under uploads/users/<id> can be removed.  Legacy
        # URLs have no ownership proof and are deliberately retained.
        owned = (await self.db.execute(select(AccountOwnedUpload).where(AccountOwnedUpload.user_id == uid, AccountOwnedUpload.tenant_id == row.tenant_id))).scalars().all()
        for upload in owned:
            path = self.safe_owned_upload(upload.path, user_id=uid)
            if path is not None:
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
        await self.db.execute(delete(AccountOwnedUpload).where(AccountOwnedUpload.user_id == uid, AccountOwnedUpload.tenant_id == row.tenant_id))
        # Detach authored community records rather than deleting shared data.
        await self.db.execute(update(Listing).where(Listing.posted_by_user_id == uid, Listing.tenant_id == row.tenant_id).values(posted_by_user_id=None))
        user.name = "Deleted member"
        user.email = f"deleted-{uid}@deleted.invalid"
        user.phone = None
        user.avatar_url = None
        user.shop_id = None
        user.last_login_at = None
        user.password_hash = hash_password(secrets.token_urlsafe(48))
        user.is_active = False
        row.status = "completed"
        row.completed_at = datetime.utcnow()
        # A completion notification is sent by the worker before this service
        # call in a claimed transaction; request data is cleared regardless.
        row.confirmation_email = None
        await self.db.commit()
        return True

    async def reconcile_pending(self, limit: int = 100) -> int:
        """Durable queue repair for committed locks whose enqueue failed."""
        from app.workers.account_tasks import erase_account
        now = datetime.utcnow()
        rows = (await self.db.execute(select(AccountDeletion).where(AccountDeletion.status == "pending", AccountDeletion.available_at <= now, (AccountDeletion.claimed_at.is_(None) | (AccountDeletion.claimed_at < now - timedelta(minutes=5)))).order_by(AccountDeletion.created_at).with_for_update(skip_locked=True).limit(limit))).scalars().all()
        for row in rows:
            row.claimed_at = now
        await self.db.commit()
        for row in rows:
            erase_account.delay(str(row.id))
        return len(rows)

    @staticmethod
    def safe_owned_upload(path_value: str | None, *, user_id: uuid.UUID, upload_root: str = "uploads") -> Path | None:
        """Return only a provably user-owned path under uploads/user/<id>."""
        if not path_value:
            return None
        root = Path(upload_root).resolve()
        candidate = Path(path_value)
        if not candidate.is_absolute():
            if candidate.parts and candidate.parts[0] == Path(upload_root).name:
                candidate = Path(*candidate.parts[1:])
            candidate = root / candidate
        candidate = candidate.resolve()
        owned_root = (root / "users" / str(user_id)).resolve()
        if owned_root == candidate or owned_root not in candidate.parents:
            return None
        return candidate
