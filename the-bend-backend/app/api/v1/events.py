import stripe
from uuid import UUID, uuid4
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.deps import get_db
from app.config import get_settings
from app.core.permissions import get_current_tenant
from app.core.stripe_resolver import get_stripe_keys
from app.models.tenant import Tenant
from app.services.event_service import EventService
from app.models.event import Event
from app.models.enums import EventCategory, EventStatus
from app.middleware.tenant import get_frontend_url as _frontend_url

router = APIRouter(prefix="/events", tags=["Events"])
settings = get_settings()

# Event posting prices in cents
EVENT_PRICE_FORPROFIT = 1999  # $19.99
EVENT_PRICE_NONPROFIT = 999   # $9.99


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
    limit: int = Query(50, le=200),
    service: EventService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    service.tenant_id = tenant.id if tenant else None
    sa = datetime.fromisoformat(start_after) if start_after else None
    sb = datetime.fromisoformat(start_before) if start_before else None
    result = await service.browse_events(category=category, start_after=sa, start_before=sb, search=search, cursor=cursor, limit=limit)
    items = [_serialize_event(e) for e in result.items]
    return {"items": items, "next_cursor": result.next_cursor, "has_more": result.has_more}


@router.get("/upcoming")
async def upcoming_events(
    limit: int = Query(5, le=20),
    service: EventService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    service.tenant_id = tenant.id if tenant else None
    events = await service.get_upcoming(limit)
    return {"items": [_serialize_event(e) for e in events]}


@router.get("/pricing")
async def event_pricing():
    """Return event posting prices."""
    return {
        "for_profit": {"price_cents": EVENT_PRICE_FORPROFIT, "label": "For-Profit Business", "price": "$19.99"},
        "nonprofit": {"price_cents": EVENT_PRICE_NONPROFIT, "label": "Not-for-Profit Organization", "price": "$9.99"},
    }


@router.post("/submit")
async def submit_event(
    data: EventSubmitRequest,
    db: AsyncSession = Depends(get_db),
    tenant: Tenant | None = Depends(get_current_tenant),
):
    """Submit an event and create a Stripe checkout session for payment."""
    # Validate nonprofit doc if claiming nonprofit
    if data.is_nonprofit and not data.nonprofit_doc_url:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Not-for-profit documentation is required for the nonprofit rate")

    price_cents = EVENT_PRICE_NONPROFIT if data.is_nonprofit else EVENT_PRICE_FORPROFIT
    price_label = "Not-for-Profit" if data.is_nonprofit else "For-Profit"

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
        status=EventStatus.PENDING if hasattr(EventStatus, 'PENDING') else EventStatus.ACTIVE,
        paid=False,
        tenant_id=tenant.id if tenant else None,
    )
    db.add(event)
    await db.flush()

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
        },
    )

    event.stripe_session_id = session.id
    await db.flush()

    return {"checkout_url": session.url, "session_id": session.id, "price_cents": price_cents}


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
