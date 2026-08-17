import re
import logging
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
logger = logging.getLogger(__name__)


class CheckoutVerificationService:
    def __init__(self, db: AsyncSession, tenant: Tenant | None):
        self.db = db
        self.tenant = tenant

    async def _local(self, kind: str, session_id: str):
        if not self.tenant or kind not in _KINDS or not _SESSION.fullmatch(session_id):
            return None
        model = {"sponsor": Sponsor, "event": Event, "connector": ConnectorPurchase}[kind]
        result = await self.db.execute(select(model).where(model.tenant_id == self.tenant.id, model.stripe_session_id == session_id).with_for_update())
        return result.scalar_one_or_none()

    @staticmethod
    def _status(kind: str, row: Any) -> str:
        status = getattr(row, "checkout_status", None) or getattr(row, "status", "pending")
        if kind == "sponsor" and row.paid:
            return "complete" if row.approved and row.is_active else "paid"
        if kind == "event" and row.paid:
            return "complete" if str(row.status).lower().endswith("active") else "paid"
        if kind == "connector":
            if status == "cancelled":
                return status
            if status in {"paid", "complete"}:
                return "complete" if row.setup_complete else "paid"
        elif status in {"cancelled", "paid", "complete"}:
            return status
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
            if not isinstance(checkout, dict):
                logger.warning("checkout_provider_mismatch kind=%s reason=malformed_response", kind)
                return {"status": "pending", "target_type": kind, "target_id": str(row.id)}
            if not self._matches(kind, row, checkout):
                logger.warning("checkout_provider_mismatch kind=%s reason=metadata_or_amount_mismatch", kind)
                return {"status": "pending", "target_type": kind, "target_id": str(row.id)}
            await self.apply_provider_transition(kind, row, checkout)
            await self.db.flush()
        except (stripe.error.StripeError, OSError, TimeoutError):
            logger.warning("checkout_provider_failure kind=%s reason=provider_unavailable", kind)
            pass
        return {"status": self._status(kind, row), "target_type": kind, "target_id": str(row.id)}

    async def apply_provider_transition(self, kind: str, row: Any, checkout: dict) -> str | None:
        if not self._matches(kind, row, checkout):
            return None
        provider_status = checkout.get("status")
        if provider_status in {"expired", "canceled"}:
            if kind == "connector": row.status = "cancelled"
            else: row.checkout_status = "cancelled"
            return "cancelled"
        if provider_status != "complete" or checkout.get("payment_status") != "paid":
            return None
        if self._status(kind, row) in {"paid", "complete", "cancelled"}:
            return None
        if kind == "sponsor":
            from app.api.v1.advertising import _mark_paid_and_notify
            from app.models.ad_pricing import AdPricing
            pricing = None
            if row.pricing_id:
                pricing = (await self.db.execute(select(AdPricing).where(AdPricing.id == row.pricing_id))).scalar_one_or_none()
            await _mark_paid_and_notify(self.db, row, pricing)
            row.checkout_status = "paid"
        elif kind == "event":
            row.paid = True
            row.checkout_status = "paid"
            if getattr(row, "coupon_code_id", None):
                from app.services.discount_code_service import DiscountCodeService
                await DiscountCodeService(self.db).mark_used(row.coupon_code_id)
        else:
            row.status = "paid"
        if checkout.get("payment_intent"):
            row.stripe_payment_intent = checkout.get("payment_intent")
        return "paid"

    @staticmethod
    def _as_dict(value: Any) -> dict:
        if isinstance(value, dict):
            return value
        data = getattr(value, "_data", None)
        return data if isinstance(data, dict) else {}

    @staticmethod
    def _matches(kind: str, row: Any, checkout: dict) -> bool:
        checkout = CheckoutVerificationService._as_dict(checkout)
        metadata = CheckoutVerificationService._as_dict(checkout.get("metadata"))
        expected = getattr(row, "expected_amount", None)
        currency = (getattr(row, "expected_currency", "usd") or "usd").lower()
        amount = checkout.get("amount_total")
        provider_currency = checkout.get("currency")
        metadata_amount = metadata.get("expected_amount")
        metadata_currency = metadata.get("expected_currency")
        if not isinstance(provider_currency, str) or not isinstance(metadata_currency, str):
            return False
        return (
            checkout.get("id") == row.stripe_session_id
            and metadata.get("kind") == kind
            and metadata.get("target_id") == str(row.id)
            and metadata.get("tenant_id") == str(row.tenant_id)
            and metadata_amount == (str(expected) if expected is not None else metadata_amount)
            and metadata_currency.lower() == currency
            and expected is not None and amount == expected
            and provider_currency.lower() == currency
        )
