import stripe
from uuid import UUID, uuid4
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.deps import get_db
from app.config import get_settings
from app.models.ad_pricing import AdPricing
from app.models.sponsor import Sponsor

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


@router.get("/pricing")
async def list_pricing(db: AsyncSession = Depends(get_db)):
    """List available ad placements and pricing."""
    result = await db.execute(
        select(AdPricing).where(AdPricing.is_active == True).order_by(AdPricing.sort_order, AdPricing.price_cents)
    )
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
async def create_checkout(data: AdOrderRequest, db: AsyncSession = Depends(get_db)):
    """Create a Stripe Checkout session for an ad purchase."""
    # Get pricing
    try:
        pricing_uuid = UUID(data.pricing_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid pricing ID")
    result = await db.execute(select(AdPricing).where(AdPricing.id == pricing_uuid))
    pricing = result.scalar_one_or_none()
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing plan not found")

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
    )
    db.add(sponsor)
    await db.flush()

    # Create Stripe checkout session
    stripe.api_key = settings.STRIPE_SECRET_KEY

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "usd",
                "unit_amount": pricing.price_cents,
                "product_data": {
                    "name": f"Ad Placement: {pricing.name}",
                    "description": f"{pricing.duration_days}-day ad on The Bend Community - {pricing.placement} page",
                },
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=f"{settings.FRONTEND_URL}/advertise/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.FRONTEND_URL}/advertise?cancelled=true",
        customer_email=data.contact_email,
        metadata={
            "sponsor_id": str(sponsor.id),
            "pricing_id": str(pricing.id),
        },
    )

    # Save stripe session ID
    sponsor.stripe_session_id = session.id
    await db.flush()

    return {"checkout_url": session.url, "session_id": session.id}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Stripe webhook for payment confirmation."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        if settings.STRIPE_WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
        else:
            import json
            event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid webhook")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        sponsor_id = session.get("metadata", {}).get("sponsor_id")
        pricing_id = session.get("metadata", {}).get("pricing_id")

        if sponsor_id:
            result = await db.execute(select(Sponsor).where(Sponsor.id == sponsor_id))
            sponsor = result.scalar_one_or_none()
            if sponsor:
                sponsor.paid = True
                sponsor.stripe_payment_intent = session.get("payment_intent")

                # Get pricing for duration
                if pricing_id:
                    pricing_result = await db.execute(select(AdPricing).where(AdPricing.id == pricing_id))
                    pricing = pricing_result.scalar_one_or_none()
                    if pricing:
                        sponsor.starts_at = datetime.utcnow()
                        sponsor.expires_at = datetime.utcnow() + timedelta(days=pricing.duration_days)

                await db.flush()

    return {"status": "ok"}


@router.get("/status/{session_id}")
async def check_status(session_id: str, db: AsyncSession = Depends(get_db)):
    """Check payment status for a checkout session."""
    result = await db.execute(
        select(Sponsor).where(Sponsor.stripe_session_id == session_id)
    )
    sponsor = result.scalar_one_or_none()
    if not sponsor:
        raise HTTPException(status_code=404, detail="Order not found")

    return {
        "paid": sponsor.paid,
        "approved": sponsor.approved,
        "is_active": sponsor.is_active,
        "name": sponsor.name,
    }
