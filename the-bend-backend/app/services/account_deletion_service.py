from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, UnauthorizedError
from app.core.security import hash_password, verify_password
from app.models.account_deletion import AccountDeletion
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
        await self.db.execute(update(DeviceInstallation).where(DeviceInstallation.user_id == user.id, DeviceInstallation.tenant_id == user.tenant_id).values(enabled=False, provider_token="revoked:" + str(user.id), revocation_secret_hash="revoked"))
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
        # Delete private/account-owned rows. Shared messages, reports, audits,
        # public listings, shops and legally retained transactions remain.
        for model, column in ((SavedListing, SavedListing.user_id), (Interest, Interest.user_id), (Notification, Notification.user_id), (PushSubscription, PushSubscription.user_id), (NotificationPreference, NotificationPreference.user_id), (DeviceInstallation, DeviceInstallation.user_id), (RefreshSession, RefreshSession.user_id), (Volunteer, Volunteer.user_id), (Talent, Talent.user_id)):
            await self.db.execute(delete(model).where(column == uid))
        await self.db.execute(delete(UserBlock).where((UserBlock.blocker_id == uid) | (UserBlock.blocked_id == uid)))
        await self.db.execute(delete(Endorsement).where(Endorsement.endorser_user_id == uid))
        # Detach authored community records rather than deleting shared data.
        from app.models.listing import Listing
        await self.db.execute(update(Listing).where(Listing.posted_by_user_id == uid).values(posted_by_user_id=None))
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

    @staticmethod
    def safe_owned_upload(path_value: str | None, *, user_id: uuid.UUID, upload_root: str = "uploads") -> Path | None:
        """Return only a provably user-owned path under uploads/user/<id>."""
        if not path_value:
            return None
        root = Path(upload_root).resolve()
        candidate = Path(path_value)
        if not candidate.is_absolute():
            candidate = root / candidate
        candidate = candidate.resolve()
        owned_root = (root / "users" / str(user_id)).resolve()
        if owned_root == candidate or owned_root not in candidate.parents:
            return None
        return candidate
