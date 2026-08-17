import stripe
from uuid import UUID, uuid4
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.deps import get_db
from app.config import get_settings
from app.core.permissions import get_current_tenant
from app.core.stripe_resolver import get_stripe_keys
from app.models.tenant import Tenant
from app.models.ad_pricing import AdPricing
from app.models.sponsor import Sponsor
from app.middleware.tenant import get_frontend_url as _frontend_url
from app.services.discount_code_service import DiscountCodeService

router = APIRouter(prefix="/advertising", tags=["Advertising"])
settings = get_settings()


class AdOrderRequest(BaseModel):
    pricing_id: str
    name: str
    description: str | None = None
    website_url: str | None = None
    logo_url: str | None = None
    contact_email: str
    contact_name: str
    coupon_code: str | None = None


async def _mark_paid_and_notify(db: AsyncSession, sponsor: Sponsor, pricing: "AdPricing | None" = None) -> bool:
    """Mark a sponsor paid and notify community admins it awaits approval.

    Idempotent: returns True only on the unpaid->paid transition, so the Stripe
    webhook and the success-page verification can both call it without sending
    duplicate notifications. The sponsor flow previously created no admin
    notification at all, so nobody was alerted when a sponsor paid.
    """
    if sponsor.paid:
        return False
    sponsor.paid = True
    if pricing is not None and sponsor.starts_at is None:
        sponsor.starts_at = datetime.utcnow()
        sponsor.expires_at = datetime.utcnow() + timedelta(days=pricing.duration_days)

    if getattr(sponsor, "coupon_code_id", None):
        from app.services.discount_code_service import DiscountCodeService
        await DiscountCodeService(db).mark_used(sponsor.coupon_code_id)

    from app.models.user import User
    from app.models.enums import UserRole, NotificationType
    from app.services.notification_service import NotificationService

    admin_q = select(User).where(
        User.role == UserRole.COMMUNITY_ADMIN, User.is_active == True
    )
    if sponsor.tenant_id:
        admin_q = admin_q.where(User.tenant_id == sponsor.tenant_id)
    admins = (await db.execute(admin_q)).scalars().all()

    notifier = NotificationService(db)
    for admin in admins:
        await notifier.notify(
            user_id=admin.id,
            type=NotificationType.REGISTRATION_SUBMITTED,
            title="New Sponsor Awaiting Approval",
            body=f"{sponsor.name} has paid for a {sponsor.placement} ad placement and is awaiting your approval.",
            data={"sponsor_id": str(sponsor.id), "placement": sponsor.placement},
        )
    await db.flush()
    return True


@router.get("/pricing")
async def list_pricing(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    """List available ad placements and pricing."""
    query = select(AdPricing).where(AdPricing.is_active == True).order_by(AdPricing.sort_order, AdPricing.price_cents)
    if tenant:
        query = query.where(AdPricing.tenant_id == tenant.id)
    result = await db.execute(query)
    items = result.scalars().all()
    return {
        "items": [{
            "id": str(p.id),
            "name": p.name,
            "description": p.description,
            "placement": p.placement,
            "duration_days": p.duration_days,
            "price_cents": p.price_cents,
        } for p in items]
    }


@router.post("/checkout")
async def create_checkout(
    data: AdOrderRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    """Create a Stripe Checkout session for an ad purchase."""
    # Get pricing
    try:
        pricing_uuid = UUID(data.pricing_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid pricing ID")
    result = await db.execute(select(AdPricing).where(AdPricing.id == pricing_uuid, AdPricing.tenant_id == tenant.id if tenant else False))
    pricing = result.scalar_one_or_none()
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing plan not found")

    # Resolve optional admin-issued sponsor coupon BEFORE creating the sponsor row
    # so we can stamp coupon_code_id on insert and avoid a follow-up UPDATE.
    applied_code = None
    effective_cents = pricing.price_cents
    if data.coupon_code:
        coupon_service = DiscountCodeService(db)
        applied_code = await coupon_service.lookup_sponsor_code(
            data.coupon_code, tenant.id if tenant else None
        )
        if not applied_code:
            raise HTTPException(status_code=400, detail="Coupon is not valid")
        if applied_code.discount_type == "percentage":
            effective_cents = int(
                pricing.price_cents * (100 - applied_code.discount_value) / 100
            )
        else:  # flat (cents)
            effective_cents = max(0, pricing.price_cents - applied_code.discount_value)

    # Create sponsor record (inactive until paid + approved)
    sponsor = Sponsor(
        id=uuid4(),
        name=data.name,
        description=data.description,
        website_url=data.website_url,
        logo_url=data.logo_url,
        placement=pricing.placement,
        is_active=False,
        paid=False,
        approved=False,
        contact_email=data.contact_email,
        contact_name=data.contact_name,
        pricing_id=pricing.id,
        tenant_id=tenant.id if tenant else None,
        coupon_code_id=applied_code.id if applied_code else None,
        expected_amount=effective_cents,
        expected_currency="usd",
    )
    db.add(sponsor)
    await db.flush()

    # Fully-discounted path: skip Stripe entirely. Mirrors the nonprofit-free
    # event submit flow — sponsor is marked paid=True so the admin queue sees
    # it, approved stays False so it still requires human review, and the
    # coupon's usage_count is incremented right now (no webhook will fire).
    if effective_cents == 0:
        # Free comp still requires human approval — mark paid + notify admins.
        await _mark_paid_and_notify(db, sponsor, pricing)
        await db.flush()
        return {"checkout_url": None, "session_id": None, "free": True}

    # Create Stripe checkout session
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "usd",
                "unit_amount": effective_cents,
                "product_data": {
                    "name": f"Ad Placement: {pricing.name}",
                    "description": f"{pricing.duration_days}-day ad on The Bend Community - {pricing.placement} page",
                },
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=f"{_frontend_url(tenant)}/advertise/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{_frontend_url(tenant)}/advertise?cancelled=true",
        customer_email=data.contact_email,
        metadata={
            "kind": "sponsor",
            "target_id": str(sponsor.id),
            "tenant_id": str(sponsor.tenant_id) if sponsor.tenant_id else "",
            "expected_amount": str(effective_cents),
            "expected_currency": "usd",
            "sponsor_id": str(sponsor.id),
            "pricing_id": str(pricing.id),
            "coupon_code_id": str(applied_code.id) if applied_code else "",
        },
        api_key=get_stripe_keys(tenant).secret,
    )

    # Save stripe session ID
    sponsor.stripe_session_id = session.id

    # Trade-off: the existing sponsor webhook handler (above, this file)
    # only flips paid=True and does not call mark_used on coupons, and we
    # do not want to expand its surface area in this change. Apply the
    # optimistic increment now so usage_count tracks reality even on the
    # paid path. Risk: if the user abandons checkout, the coupon's
    # usage_count drifts up by one. We accept that for simplicity; a
    # future webhook pass can move this into checkout.session.completed.
    await db.flush()

    return {"checkout_url": session.url, "session_id": session.id}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Stripe webhook for payment confirmation.

    Uses env-level Stripe credentials (a single webhook URL is hit by Stripe
    regardless of which tenant initiated the checkout). Per-tenant keys are
    used at checkout creation time only.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    # Resolve tenant from untrusted metadata only to select the signing secret;
    # metadata is still validated against the tenant-owned row below.
    import json
    try:
        envelope = json.loads(payload)
        metadata_hint = envelope.get("data", {}).get("object", {}).get("metadata", {})
        tenant = None
        if metadata_hint.get("tenant_id"):
            tenant_result = await db.execute(select(Tenant).where(Tenant.id == metadata_hint["tenant_id"], Tenant.is_active == True))
            tenant = tenant_result.scalar_one_or_none()
    except (ValueError, TypeError, AttributeError):
        envelope = None
        tenant = None
    webhook_secret = get_stripe_keys(tenant).webhook

    try:
        if webhook_secret:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        elif settings.STRIPE_ALLOW_UNSIGNED_WEBHOOKS and settings.APP_ENV != "production":
            event = stripe.Event.construct_from(json.loads(payload), api_key=settings.STRIPE_SECRET_KEY)
        else:
            raise HTTPException(status_code=400, detail="Invalid webhook")
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid webhook")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        metadata = session.get("metadata", {})
        kind = metadata.get("kind")
        target_id = metadata.get("target_id")
        if kind not in {"sponsor", "event", "connector"} or not target_id or not tenant or session.get("payment_status") != "paid":
            return {"status": "ok"}
        from app.models.connector_purchase import ConnectorPurchase
        target_model = {"sponsor": Sponsor, "event": __import__("app.models.event", fromlist=["Event"]).Event, "connector": ConnectorPurchase}[kind]
        target_result = await db.execute(select(target_model).where(target_model.id == target_id, target_model.tenant_id == tenant.id).with_for_update())
        target = target_result.scalar_one_or_none()
        from app.services.checkout_service import CheckoutVerificationService
        if target is None or not CheckoutVerificationService._matches(kind, target, session):
            return {"status": "ok"}
        sponsor_id = metadata.get("sponsor_id") or (target_id if kind == "sponsor" else None)
        pricing_id = metadata.get("pricing_id")
        event_id = metadata.get("event_id") or (target_id if kind == "event" else None)
        payment_type = metadata.get("type") or ("connector_purchase" if kind == "connector" else "event_posting" if kind == "event" else None)

        # Handle connector purchase — notify admin
        if payment_type == "connector_purchase":
            try:
                from app.models.connector_purchase import ConnectorPurchase
                from app.models.user import User
                from app.models.notification import Notification
                from app.models.enums import UserRole, NotificationType
                target_id = metadata.get("target_id")
                purchase_result = await db.execute(select(ConnectorPurchase).where(ConnectorPurchase.id == target_id, ConnectorPurchase.tenant_id == tenant.id if tenant else False))
                purchase = purchase_result.scalar_one_or_none()
                if purchase is None:
                    return {"status": "ok"}
                if purchase.status in {"paid", "complete"}:
                    return {"status": "ok"}
                purchase.status = "paid"
                purchase.stripe_session_id = session.get("id")
                purchase.stripe_payment_intent = session.get("payment_intent")
                admin_result = await db.execute(
                    select(User).where(User.role == UserRole.COMMUNITY_ADMIN, User.is_active == True, User.tenant_id == purchase.tenant_id)
                )
                admins = admin_result.scalars().all()
                biz_name = purchase.business_name
                website = purchase.website_url
                for admin in admins:
                    notif = Notification(
                        id=uuid4(),
                        user_id=admin.id,
                        type=NotificationType.SYSTEM,
                        title="New Connector Purchase",
                        body=f"{biz_name} purchased a 90-day Automatic Website Events Linker for {website}. Please set up the connector.",
                        data={"website_url": website},
                    )
                    db.add(notif)
                await db.flush()
            except Exception:
                # Never hide database/notification failures: the request must
                # roll back rather than acknowledging a partially-applied payment.
                raise

        # Handle event posting payment
        if payment_type == "event_posting" and event_id:
            from app.models.event import Event
            result = await db.execute(select(Event).where(Event.id == event_id, Event.tenant_id == tenant.id if tenant else False))
            evt = result.scalar_one_or_none()
            if evt:
                if evt.paid:
                    return {"status": "ok"}
                evt.paid = True
                if evt.coupon_code_id:
                    from app.services.discount_code_service import DiscountCodeService
                    await DiscountCodeService(db).mark_used(evt.coupon_code_id)
                await db.flush()

        if sponsor_id:
            result = await db.execute(select(Sponsor).where(Sponsor.id == sponsor_id, Sponsor.tenant_id == tenant.id if tenant else False))
            sponsor = result.scalar_one_or_none()
            if sponsor:
                sponsor.stripe_payment_intent = session.get("payment_intent")
                pricing = None
                if pricing_id:
                    pricing_result = await db.execute(select(AdPricing).where(AdPricing.id == pricing_id))
                    pricing = pricing_result.scalar_one_or_none()
                # Marks paid + notifies admins; idempotent with the success-page path.
                await _mark_paid_and_notify(db, sponsor, pricing)

    return {"status": "ok"}


@router.get("/status/{session_id}")
async def check_status(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    """Check payment status for a checkout session.

    Doubles as a webhook-independent fallback: if the sponsor isn't marked paid
    yet, verify the session directly with Stripe and, if payment succeeded, mark
    it paid and notify admins. This guarantees a paid sponsor reaches the admin's
    "Pending Approval" queue even when the Stripe webhook never arrives.
    """
    from app.services.checkout_service import CheckoutVerificationService
    verified = await CheckoutVerificationService(db, tenant).status("sponsor", session_id)
    if verified is None:
        raise HTTPException(status_code=404, detail="Order not found")
    sponsor = await db.get(Sponsor, UUID(verified["target_id"]))
    return {
        "status": verified["status"],
        "paid": sponsor.paid,
        "approved": sponsor.approved,
        "is_active": sponsor.is_active,
        "name": sponsor.name,
    }
