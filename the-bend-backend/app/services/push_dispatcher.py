"""Tenant-safe, idempotent dispatcher for native notification outbox rows."""

from __future__ import annotations

import asyncio
import random
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.device_installation import DeviceInstallation
from app.models.enums import NotificationType
from app.models.notification import Notification
from app.models.notification_outbox import NotificationOutbox
from app.models.notification_preference import NotificationPreference
from app.services.push_provider import ProviderResult, provider_for_platform


class CategorySpec:
    __slots__ = ("category", "title", "body")

    def __init__(self, category: str, title: str, body: str):
        self.category, self.title, self.body = category, title, body


CATEGORY_SPECS = {
    NotificationType.NEW_MESSAGE: CategorySpec("message_received", "New message", "You have a new message"),
    NotificationType.LISTING_INTEREST: CategorySpec("listing_interest_received", "New listing interest", "Someone is interested in a listing"),
    NotificationType.REGISTRATION_APPROVED: CategorySpec("registration_decision", "Registration update", "Your registration decision is available"),
    NotificationType.REGISTRATION_REJECTED: CategorySpec("registration_decision", "Registration update", "Your registration decision is available"),
    NotificationType.NEW_URGENT_LISTING: CategorySpec("urgent_listing_published", "Urgent listing", "A new urgent listing is available"),
}

_TARGET_TYPES = {"message", "listing", "shop", "registration", "notification", "user"}


def build_native_payload(notification: Notification) -> dict[str, Any] | None:
    spec = CATEGORY_SPECS.get(notification.type)
    if spec is None:
        return None
    payload: dict[str, Any] = {
        "notification_id": str(notification.id),
        "category": spec.category,
        "title": spec.title,
        "body": spec.body,
    }
    data = notification.data if isinstance(notification.data, dict) else {}
    target_type, target_id = data.get("target_type"), data.get("target_id")
    try:
        UUID(str(target_id))
    except (ValueError, TypeError, AttributeError):
        return payload
    if isinstance(target_type, str) and target_type in _TARGET_TYPES:
        payload.update(target_type=target_type, target_id=str(target_id))
    return payload


class PushDispatcher:
    def __init__(self, db: AsyncSession, providers: dict[str, Any] | None = None):
        self.db = db
        self.providers = providers or {}

    async def _provider(self, platform: str):
        if platform not in self.providers:
            self.providers[platform] = provider_for_platform(platform)
        return self.providers[platform]

    async def _get_outbox(self, outbox_id: UUID):
        result = await self.db.execute(
            select(NotificationOutbox).where(NotificationOutbox.id == outbox_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def dispatch_one(self, outbox_id: UUID) -> int:
        outbox = await self._get_outbox(outbox_id)
        if outbox is None or outbox.status in {"delivered", "failed"}:
            return 0
        result = await self.db.execute(
            select(Notification).where(Notification.id == outbox.notification_id, Notification.tenant_id == outbox.tenant_id)
        )
        notification = result.scalar_one_or_none()
        payload = build_native_payload(notification) if notification else None
        if payload is None:
            outbox.status, outbox.last_error_code = "failed", "unsupported_notification"
            outbox.locked_at, outbox.updated_at = None, datetime.utcnow()
            await self.db.commit()
            return 0
        pref_result = await self.db.execute(
            select(NotificationPreference).where(NotificationPreference.user_id == notification.user_id, NotificationPreference.tenant_id == notification.tenant_id)
        )
        preference = pref_result.scalar_one_or_none()
        category = payload["category"]
        if preference and (not preference.push_enabled or not getattr(preference, category, True)):
            outbox.status, outbox.last_error_code = "delivered", "preference_disabled"
            outbox.delivered_at, outbox.locked_at, outbox.updated_at = datetime.utcnow(), None, datetime.utcnow()
            await self.db.commit()
            return 0
        installations = (await self.db.execute(select(DeviceInstallation).where(DeviceInstallation.user_id == notification.user_id, DeviceInstallation.tenant_id == notification.tenant_id, DeviceInstallation.enabled.is_(True)))).scalars().all()
        prior = dict(outbox.provider_results or {})
        sent = 0
        for installation in installations:
            key = str(installation.id)
            if prior.get(key, {}).get("kind") in {"delivered", "permanent", "invalid_token"}:
                continue
            provider = await self._provider(installation.platform)
            if provider is None:
                result = ProviderResult.permanent("unsupported_platform")
            else:
                result = await provider.send(installation, payload)
            prior[key] = {"kind": result.kind, "code": result.code}
            sent += result.kind == "delivered"
            if result.kind == "invalid_token":
                installation.enabled = False
                installation.provider_token = f"revoked:{installation.id}"
        # Aggregate prior and current per-installation outcomes. Terminal
        # failures remain terminal even when another device delivered.
        outbox.provider_results = prior
        kinds = {entry.get("kind") for entry in prior.values() if isinstance(entry, dict)}
        transient = "transient" in kinds
        terminal_failure = bool(kinds & {"permanent", "invalid_token"})
        attempts = outbox.attempts + 1
        outbox.attempts = attempts
        now = datetime.utcnow()
        pending = transient and attempts < 5
        if pending:
            outbox.status = "pending"
            base_delay = min(15 * (2 ** attempts), 900)
            outbox.available_at = now + timedelta(seconds=base_delay + random.uniform(0, min(5, base_delay * 0.1)))
            outbox.last_error_code = "transient_failure"
        else:
            outbox.status = "failed" if terminal_failure or (transient and attempts >= 5) else "delivered"
            outbox.last_error_code = "permanent_failure" if terminal_failure else ("transient_failure" if transient else None)
            outbox.delivered_at = None if outbox.status == "failed" else now
        outbox.locked_at, outbox.updated_at = None, now
        await self.db.commit()
        return sent

    async def dispatch_pending(self, batch_size: int = 100) -> int:
        now = datetime.utcnow()
        # Requeue only locks old enough to indicate a crashed worker.
        await self.db.execute(
            update(NotificationOutbox)
            .where(
                NotificationOutbox.status == "processing",
                NotificationOutbox.locked_at < now - timedelta(minutes=15),
            )
            .values(status="pending", locked_at=None, updated_at=now)
        )
        await self.db.commit()
        result = await self.db.execute(
            select(NotificationOutbox).where(NotificationOutbox.status == "pending", NotificationOutbox.available_at <= now).order_by(NotificationOutbox.available_at).limit(batch_size).with_for_update(skip_locked=True)
        )
        rows = list(result.scalars().all())
        for row in rows:
            row.status, row.locked_at, row.updated_at = "processing", now, now
        await self.db.commit()
        delivered = 0
        for row in rows:
            try:
                delivered += await self.dispatch_one(row.id)
            except Exception:
                await self._recover_dispatch_error(row.id)
        return delivered

    async def _recover_dispatch_error(self, outbox_id: UUID) -> None:
        """Release a claimed row after an unexpected worker/provider failure."""
        await self.db.rollback()
        result = await self.db.execute(select(NotificationOutbox).where(NotificationOutbox.id == outbox_id))
        outbox = result.scalar_one_or_none()
        if outbox is None or outbox.status in {"delivered", "failed"}:
            return
        now = datetime.utcnow()
        outbox.attempts += 1
        outbox.locked_at = None
        outbox.last_error_code = "dispatcher_error"
        if outbox.attempts >= 5:
            outbox.status = "failed"
            outbox.delivered_at = None
        else:
            outbox.status = "pending"
            base_delay = min(15 * (2 ** outbox.attempts), 900)
            outbox.available_at = now + timedelta(seconds=base_delay + random.uniform(0, min(5, base_delay * 0.1)))
            outbox.delivered_at = None
        outbox.updated_at = now
        await self.db.commit()


async def _dispatch_pending_outbox(batch_size: int = 100) -> int:
    async with async_session() as session:
        return await PushDispatcher(session).dispatch_pending(batch_size)


def dispatch_pending_outbox(batch_size: int = 100) -> int:
    """Synchronous Celery-facing wrapper that owns its async session lifecycle."""
    return asyncio.run(_dispatch_pending_outbox(batch_size))
