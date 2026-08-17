import stripe
from uuid import UUID, uuid4
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.deps import get_db
from app.config import get_settings
from app.core.permissions import get_current_tenant, get_current_user_optional
from app.core.stripe_resolver import get_stripe_keys
from app.models.tenant import Tenant
from app.services.event_service import EventService
from app.models.event import Event
from app.models.enums import EventCategory, EventStatus
from app.models.user import User
from app.middleware.tenant import get_frontend_url as _frontend_url

router = APIRouter(prefix="/events", tags=["Events"])
settings = get_settings()

# Event posting prices in cents
EVENT_PRICE_FORPROFIT = 1999  # $19.99
EVENT_PRICE_NONPROFIT = 0     # Free for verified nonprofits


class EventSubmitRequest(BaseModel):
    title: str
    description: str | None = None
    start_date: str
    end_date: str | None = None
    location: str | None = None
    category: str = "community"
    image_url: str | None = None
    is_nonprofit: bool = False
    nonprofit_doc_url: str | None = None
    submitted_by_name: str
    submitted_by_email: str
    coupon_code: str | None = None


def get_service(db: AsyncSession = Depends(get_db)):
    return EventService(db)


def _serialize_event(e):
    return {
        "id": str(e.id),
        "title": e.title,
        "description": e.description,
        "start_date": str(e.start_date),
        "end_date": str(e.end_date) if e.end_date else None,
        "location": e.location,
        "category": e.category.value if hasattr(e.category, "value") else e.category,
        "image_url": e.image_url,
        "source": e.source,
        "source_url": e.source_url,
        "is_featured": e.is_featured,
        "status": e.status.value if hasattr(e.status, "value") else e.status,
        "created_at": str(e.created_at),
    }


@router.get("")
async def list_events(
    category: str | None = Query(None),
    start_after: str | None = Query(None),
    start_before: str | None = Query(None),
    search: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(50, le=500),
    service: EventService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
    viewer: User | None = Depends(get_current_user_optional),
):
    service.tenant_id = tenant.id if tenant else None
    sa = datetime.fromisoformat(start_after) if start_after else None
    sb = datetime.fromisoformat(start_before) if start_before else None
    result = await service.browse_events(category=category, start_after=sa, start_before=sb, search=search, cursor=cursor, limit=limit, viewer_id=viewer.id if viewer else None)
    items = [_serialize_event(e) for e in result.items]
    return {"items": items, "next_cursor": result.next_cursor, "has_more": result.has_more}


@router.get("/upcoming")
async def upcoming_events(
    limit: int = Query(5, le=20),
    service: EventService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
    viewer: User | None = Depends(get_current_user_optional),
):
    service.tenant_id = tenant.id if tenant else None
    events = await service.get_upcoming(limit, viewer_id=viewer.id if viewer else None)
    return {"items": [_serialize_event(e) for e in events]}


@router.get("/pricing")
async def event_pricing():
    """Return event posting prices."""
    return {
        "for_profit": {"price_cents": EVENT_PRICE_FORPROFIT, "label": "For-Profit Business", "price": "$19.99"},
        "nonprofit": {"price_cents": EVENT_PRICE_NONPROFIT, "label": "Not-for-Profit Organization", "price": "Free"},
    }


@router.post("/submit")
async def submit_event(
    data: EventSubmitRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Submit an event and create a Stripe checkout session for payment."""
    # Validate nonprofit doc if claiming nonprofit
    if data.is_nonprofit and not data.nonprofit_doc_url:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Not-for-profit documentation is required for the nonprofit rate")

    price_cents = EVENT_PRICE_NONPROFIT if data.is_nonprofit else EVENT_PRICE_FORPROFIT
    price_label = "Not-for-Profit" if data.is_nonprofit else "For-Profit"

    # Apply a platform-issued event coupon (admin-minted, coupon_type='event').
    # Reduces price_cents in cents; usage is bumped right after creation when
    # the discount actually lands (free path skips Stripe → bump immediately;
    # paid path bumps when we know the checkout was set up successfully).
    applied_coupon = None
    if data.coupon_code:
        from app.services.discount_code_service import DiscountCodeService
        from fastapi import HTTPException
        dc_service = DiscountCodeService(db)
        applied_coupon = await dc_service.lookup_event_code(
            data.coupon_code, tenant.id if tenant else None,
        )
        if not applied_coupon:
            raise HTTPException(status_code=400, detail="Coupon is not valid")
        if applied_coupon.discount_type == "percentage":
            price_cents = int(price_cents * (100 - applied_coupon.discount_value) / 100)
        else:
            price_cents = max(0, price_cents - applied_coupon.discount_value)

    # Parse category
    try:
        cat = EventCategory(data.category)
    except ValueError:
        cat = EventCategory.COMMUNITY

    # Create event with pending status
    event = Event(
        id=uuid4(),
        title=data.title,
        description=data.description,
        start_date=datetime.fromisoformat(data.start_date),
        end_date=datetime.fromisoformat(data.end_date) if data.end_date else None,
        location=data.location,
        category=cat,
        image_url=data.image_url,
        source="submission",
        is_nonprofit=data.is_nonprofit,
        nonprofit_doc_url=data.nonprofit_doc_url,
        submitted_by_name=data.submitted_by_name,
        submitted_by_email=data.submitted_by_email,
        submitted_by_user_id=current_user.id if current_user and current_user.tenant_id == (tenant.id if tenant else None) else None,
        status=EventStatus.PENDING if hasattr(EventStatus, 'PENDING') else EventStatus.ACTIVE,
        paid=False,
        tenant_id=tenant.id if tenant else None,
    )
    db.add(event)
    await db.flush()

    # Free path (nonprofits): skip Stripe entirely. Mark the row as paid=True
    # so the existing community-admin review queue picks it up like any other
    # paid submission — the only difference is no money changed hands.
    if price_cents == 0:
        event.paid = True
        if applied_coupon is not None:
            # We've already validated this row above; mark_used does its own
            # SELECT FOR UPDATE + bounds re-check before bumping.
            await dc_service.mark_used(applied_coupon.id)
        await db.flush()
        return {
            "checkout_url": None, "session_id": None,
            "price_cents": 0, "free": True,
            "coupon_code": applied_coupon.code if applied_coupon else None,
        }

    # Create Stripe checkout session
    stripe.api_key = get_stripe_keys(tenant).secret

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "usd",
                "unit_amount": price_cents,
                "product_data": {
                    "name": f"Event Posting: {data.title}",
                    "description": f"{price_label} event posting on The Bend Community",
                },
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=f"{_frontend_url(tenant)}/events?posted=success&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{_frontend_url(tenant)}/events?posted=cancelled",
        customer_email=data.submitted_by_email,
        metadata={
            "event_id": str(event.id),
            "type": "event_posting",
            "coupon_code_id": str(applied_coupon.id) if applied_coupon else "",
        },
    )

    event.stripe_session_id = session.id
    # Optimistic redemption — bump usage now that the Stripe session is set
    # up. Same trade-off as the sponsor checkout path: we don't currently
    # process webhooks for these flows, so we accept a small drift if the
    # user abandons before paying.
    if applied_coupon is not None:
        await dc_service.mark_used(applied_coupon.id)
    await db.flush()

    return {
        "checkout_url": session.url, "session_id": session.id,
        "price_cents": price_cents,
        "coupon_code": applied_coupon.code if applied_coupon else None,
    }


CONNECTOR_PRICE = 39900  # $399.00


class ConnectorPurchaseRequest(BaseModel):
    website_url: str
    contact_name: str
    contact_email: str
    business_name: str
    notes: str | None = None


@router.post("/connector-checkout")
async def purchase_connector(
    data: ConnectorPurchaseRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    """Purchase a 90-day Automatic Website Events Linker."""
    stripe.api_key = get_stripe_keys(tenant).secret

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "usd",
                "unit_amount": CONNECTOR_PRICE,
                "product_data": {
                    "name": "Automatic Website Events Linker",
                    "description": f"90-day automated event sync from {data.website_url} to The Bend Community",
                },
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=f"{_frontend_url(tenant)}/advertise/success?session_id={{CHECKOUT_SESSION_ID}}&type=connector",
        cancel_url=f"{_frontend_url(tenant)}/advertise?cancelled=true",
        customer_email=data.contact_email,
        metadata={
            "type": "connector_purchase",
            "website_url": data.website_url,
            "contact_name": data.contact_name,
            "contact_email": data.contact_email,
            "business_name": data.business_name,
            "notes": data.notes or "",
        },
    )

    return {"checkout_url": session.url, "session_id": session.id}


@router.get("/{event_id}")
async def get_event(event_id: UUID, service: EventService = Depends(get_service)):
    event = await service.get_event(event_id)
    return _serialize_event(event)
