import re
from typing import Any
from uuid import UUID

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.stripe_resolver import get_stripe_keys
from app.models.connector_purchase import ConnectorPurchase
from app.models.event import Event
from app.models.sponsor import Sponsor
from app.models.tenant import Tenant

_SESSION = re.compile(r"^cs_[A-Za-z0-9_]{1,240}$")
_KINDS = {"sponsor", "event", "connector"}


class CheckoutVerificationService:
    def __init__(self, db: AsyncSession, tenant: Tenant | None):
        self.db = db
        self.tenant = tenant

    async def _local(self, kind: str, session_id: str):
        if not self.tenant or kind not in _KINDS or not _SESSION.fullmatch(session_id):
            return None
        model = {"sponsor": Sponsor, "event": Event, "connector": ConnectorPurchase}[kind]
        result = await self.db.execute(select(model).where(model.tenant_id == self.tenant.id, model.stripe_session_id == session_id))
        return result.scalar_one_or_none()

    @staticmethod
    def _status(kind: str, row: Any) -> str:
        status = getattr(row, "checkout_status", None) or getattr(row, "status", "pending")
        if kind == "connector":
            if status == "cancelled":
                return status
            if status in {"paid", "complete"}:
                return "complete" if row.setup_complete else "paid"
        elif status in {"cancelled", "paid", "complete"}:
            return status
        if kind == "sponsor" and row.paid:
            return "complete" if row.approved and row.is_active else "paid"
        if kind == "event" and row.paid:
            return "complete" if str(row.status).lower().endswith("active") else "paid"
        if kind == "connector" and row.status == "paid":
            return "complete" if row.setup_complete else "paid"
        return "pending"

    async def status(self, kind: str, session_id: str) -> dict | None:
        row = await self._local(kind, session_id)
        if row is None:
            return None
        local_status = self._status(kind, row)
        if local_status != "pending":
            return {"status": local_status, "target_type": kind, "target_id": str(row.id)}
        keys = get_stripe_keys(self.tenant)
        if not keys.secret:
            return {"status": "pending", "target_type": kind, "target_id": str(row.id)}
        try:
            checkout = stripe.checkout.Session.retrieve(session_id, api_key=keys.secret)
            if not self._matches(kind, row, checkout):
                return {"status": "pending", "target_type": kind, "target_id": str(row.id)}
            provider_status = checkout.get("status")
            if provider_status == "expired" or provider_status == "canceled":
                if kind == "connector":
                    row.status = "cancelled"
                else:
                    row.checkout_status = "cancelled"
            elif checkout.get("payment_status") == "paid":
                if kind == "connector":
                    row.status = "paid"
                else:
                    row.checkout_status = "paid"
                if kind == "sponsor":
                    from app.api.v1.advertising import _mark_paid_and_notify
                    from app.models.ad_pricing import AdPricing
                    pricing = None
                    if row.pricing_id:
                        pricing = (await self.db.execute(select(AdPricing).where(AdPricing.id == row.pricing_id))).scalar_one_or_none()
                    await _mark_paid_and_notify(self.db, row, pricing)
                elif kind == "event":
                    row.paid = True
                    if getattr(row, "coupon_code_id", None):
                        from app.services.discount_code_service import DiscountCodeService
                        await DiscountCodeService(self.db).mark_used(row.coupon_code_id)
                if checkout.get("payment_intent"):
                    row.stripe_payment_intent = checkout.get("payment_intent")
            await self.db.flush()
        except Exception:
            pass
        return {"status": self._status(kind, row), "target_type": kind, "target_id": str(row.id)}

    @staticmethod
    def _matches(kind: str, row: Any, checkout: dict) -> bool:
        metadata = checkout.get("metadata") or {}
        expected = getattr(row, "expected_amount", None)
        currency = (getattr(row, "expected_currency", "usd") or "usd").lower()
        amount = checkout.get("amount_total")
        return (
            checkout.get("id") == row.stripe_session_id
            and metadata.get("kind") == kind
            and metadata.get("target_id") == str(row.id)
            and metadata.get("tenant_id") == str(row.tenant_id)
            and metadata.get("expected_amount") == (str(expected) if expected is not None else metadata.get("expected_amount"))
            and metadata.get("expected_currency", "").lower() == currency
            and expected is not None and amount == expected
            and checkout.get("currency", "").lower() == currency
        )
