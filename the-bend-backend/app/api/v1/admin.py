from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import Permission
from app.models.user import User
from app.models.enums import UserRole
from app.services.admin_service import AdminService
from app.schemas.admin import RejectRequest, SuspendRequest, AdminListingDeleteRequest
from app.services.event_service import EventService
from app.schemas.event import EventCreate, EventUpdate, ConnectorCreate, ConnectorUpdate
from app.services.connector_service import ConnectorService

router = APIRouter(prefix="/admin", tags=["Admin"])


def get_admin_service(db: AsyncSession = Depends(get_db)):
    # tenant_id is set per-request from current_user in route handlers
    return AdminService(db)


@router.get("/dashboard")
async def dashboard(
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    service.tenant_id = current_user.tenant_id
    return await service.get_dashboard()


@router.get("/registrations")
async def get_registrations(
    status: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    service.tenant_id = current_user.tenant_id
    result = await service.get_registrations(status, cursor, limit)
    counts = await service.get_registration_counts()
    result["counts"] = counts
    return result


@router.post("/registrations/{shop_id}/approve")
async def approve_registration(
    shop_id: UUID,
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    shop = await service.approve_registration(shop_id)
    return {"id": str(shop.id), "status": "active"}


@router.post("/registrations/{shop_id}/reject")
async def reject_registration(
    shop_id: UUID, data: RejectRequest,
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    shop = await service.reject_registration(shop_id, data.reason)
    return {"id": str(shop.id), "status": "rejected"}


@router.get("/shops")
async def get_shops(
    status: str | None = Query(None),
    search: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    service.tenant_id = current_user.tenant_id
    return await service.get_shops(status, search, cursor, limit)


@router.post("/shops/{shop_id}/suspend")
async def suspend_shop(
    shop_id: UUID, data: SuspendRequest,
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    shop = await service.suspend_shop(shop_id, data.reason)
    return {"id": str(shop.id), "status": "suspended"}


@router.post("/shops/{shop_id}/reactivate")
async def reactivate_shop(
    shop_id: UUID,
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    shop = await service.reactivate_shop(shop_id)
    return {"id": str(shop.id), "status": "active"}


@router.get("/listings")
async def get_all_listings(
    status: str | None = Query(None),
    category: str | None = Query(None),
    urgency: str | None = Query(None),
    shop_id: UUID | None = Query(None),
    search: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    service.tenant_id = current_user.tenant_id
    return await service.get_all_listings(status, category, urgency, shop_id, search, cursor, limit)


@router.delete("/listings/{listing_id}")
async def remove_listing(
    listing_id: UUID, data: AdminListingDeleteRequest,
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    await service.remove_listing(listing_id, data.reason)
    return {"status": "deleted"}


@router.get("/reports")
async def get_reports(
    period: str = Query("week"),
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(Permission.require_community_admin()),
):
    service.tenant_id = current_user.tenant_id
    return await service.get_reports(period)


def get_event_service(db: AsyncSession = Depends(get_db)):
    return EventService(db)


# --- Event Admin Routes ---

@router.get("/events")
async def admin_list_events(
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
    event_service: EventService = Depends(get_event_service),
    _: User = Depends(Permission.require_community_admin()),
):
    event_service.tenant_id = _.tenant_id
    result = await event_service.list_all_events(cursor, limit)
    from app.api.v1.events import _serialize_event
    items = [_serialize_event(e) for e in result.items]
    return {"items": items, "next_cursor": result.next_cursor, "has_more": result.has_more}


@router.post("/events")
async def admin_create_event(
    data: EventCreate,
    event_service: EventService = Depends(get_event_service),
    _: User = Depends(Permission.require_community_admin()),
):
    event_service.tenant_id = _.tenant_id
    event = await event_service.create_event(data)
    return {"id": str(event.id), "title": event.title}


@router.put("/events/{event_id}")
async def admin_update_event(
    event_id: UUID,
    data: EventUpdate,
    event_service: EventService = Depends(get_event_service),
    _: User = Depends(Permission.require_community_admin()),
):
    event = await event_service.update_event(event_id, data)
    return {"id": str(event.id), "status": "updated"}


@router.delete("/events/{event_id}")
async def admin_delete_event(
    event_id: UUID,
    event_service: EventService = Depends(get_event_service),
    _: User = Depends(Permission.require_community_admin()),
):
    await event_service.delete_event(event_id)
    return {"status": "deleted"}


# --- Connector Admin Routes ---

def _serialize_connector(c):
    return {
        "id": str(c.id),
        "name": c.name,
        "type": c.type.value if hasattr(c.type, "value") else c.type,
        "url": c.url,
        "category": c.category.value if hasattr(c.category, "value") else c.category,
        "is_active": c.is_active,
        "config": c.config,
        "last_synced_at": str(c.last_synced_at) if c.last_synced_at else None,
        "last_sync_count": c.last_sync_count,
        "last_sync_error": c.last_sync_error,
        "created_at": str(c.created_at),
    }


@router.get("/connectors")
async def admin_list_connectors(
    event_service: EventService = Depends(get_event_service),
    _: User = Depends(Permission.require_community_admin()),
):
    event_service.tenant_id = _.tenant_id
    connectors = await event_service.list_connectors()
    return {"items": [_serialize_connector(c) for c in connectors]}


@router.post("/connectors")
async def admin_create_connector(
    data: ConnectorCreate,
    event_service: EventService = Depends(get_event_service),
    _: User = Depends(Permission.require_community_admin()),
):
    event_service.tenant_id = _.tenant_id
    connector = await event_service.create_connector(data)
    return {"id": str(connector.id), "name": connector.name}


@router.put("/connectors/{connector_id}")
async def admin_update_connector(
    connector_id: UUID,
    data: ConnectorUpdate,
    event_service: EventService = Depends(get_event_service),
    _: User = Depends(Permission.require_community_admin()),
):
    connector = await event_service.update_connector(connector_id, data)
    return {"id": str(connector.id), "status": "updated"}


@router.delete("/connectors/{connector_id}")
async def admin_delete_connector(
    connector_id: UUID,
    event_service: EventService = Depends(get_event_service),
    _: User = Depends(Permission.require_community_admin()),
):
    await event_service.delete_connector(connector_id)
    return {"status": "deleted"}


def get_connector_service(db: AsyncSession = Depends(get_db)):
    return ConnectorService(db)


@router.post("/connectors/{connector_id}/sync")
async def admin_sync_connector(
    connector_id: UUID,
    connector_service: ConnectorService = Depends(get_connector_service),
    _: User = Depends(Permission.require_community_admin()),
):
    result = await connector_service.sync_connector(connector_id)
    return result


@router.post("/connectors/{connector_id}/test")
async def admin_test_connector(
    connector_id: UUID,
    event_service: EventService = Depends(get_event_service),
    connector_service: ConnectorService = Depends(get_connector_service),
    _: User = Depends(Permission.require_community_admin()),
):
    connector = await event_service.get_connector(connector_id)
    result = await connector_service.test_connector(
        connector.type.value if hasattr(connector.type, "value") else connector.type,
        connector.url,
        connector.config,
    )
    return result


@router.post("/connectors/sync-all")
async def admin_sync_all(
    connector_service: ConnectorService = Depends(get_connector_service),
    _: User = Depends(Permission.require_community_admin()),
):
    return await connector_service.sync_all()


# --- Sponsor Admin Routes ---

from app.models.sponsor import Sponsor
from app.schemas.sponsor import SponsorCreate, SponsorUpdate


@router.get("/sponsors")
async def admin_list_sponsors(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(Permission.require_community_admin()),
):
    query = select(Sponsor).order_by(Sponsor.sort_order, Sponsor.name)
    if _.tenant_id:
        query = query.where(Sponsor.tenant_id == _.tenant_id)
    result = await db.execute(query)
    sponsors = result.scalars().all()
    return {"items": [{
        "id": str(s.id), "name": s.name, "description": s.description,
        "logo_url": s.logo_url, "banner_url": s.banner_url,
        "website_url": s.website_url, "placement": s.placement,
        "is_active": s.is_active, "sort_order": s.sort_order,
        "paid": s.paid, "approved": s.approved,
        "contact_name": s.contact_name, "contact_email": s.contact_email,
        "starts_at": str(s.starts_at) if s.starts_at else None,
        "expires_at": str(s.expires_at) if s.expires_at else None,
        "stripe_session_id": s.stripe_session_id,
        "created_at": str(s.created_at),
    } for s in sponsors]}


@router.post("/sponsors")
async def admin_create_sponsor(
    data: SponsorCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(Permission.require_community_admin()),
):
    sponsor = Sponsor(id=uuid4(), **data.model_dump(), tenant_id=_.tenant_id)
    db.add(sponsor)
    await db.flush()
    return {"id": str(sponsor.id), "name": sponsor.name}


@router.put("/sponsors/{sponsor_id}")
async def admin_update_sponsor(
    sponsor_id: UUID,
    data: SponsorUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(Permission.require_community_admin()),
):
    result = await db.execute(select(Sponsor).where(Sponsor.id == sponsor_id))
    sponsor = result.scalar_one_or_none()
    if not sponsor:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Sponsor not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(sponsor, k, v)
    await db.flush()
    return {"id": str(sponsor.id), "status": "updated"}


@router.delete("/sponsors/{sponsor_id}")
async def admin_delete_sponsor(
    sponsor_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(Permission.require_community_admin()),
):
    result = await db.execute(select(Sponsor).where(Sponsor.id == sponsor_id))
    sponsor = result.scalar_one_or_none()
    if not sponsor:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Sponsor not found")
    await db.delete(sponsor)
    await db.flush()
    return {"status": "deleted"}


@router.post("/sponsors/{sponsor_id}/approve")
async def admin_approve_sponsor(
    sponsor_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(Permission.require_community_admin()),
):
    result = await db.execute(select(Sponsor).where(Sponsor.id == sponsor_id))
    sponsor = result.scalar_one_or_none()
    if not sponsor:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Sponsor not found")
    sponsor.approved = True
    sponsor.is_active = True
    await db.flush()
    return {"id": str(sponsor.id), "status": "approved"}


# --- Ad Pricing Admin Routes ---

from app.models.ad_pricing import AdPricing


@router.get("/pricing")
async def admin_list_pricing(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(Permission.require_community_admin()),
):
    query = select(AdPricing).order_by(AdPricing.sort_order)
    if _.tenant_id:
        query = query.where(AdPricing.tenant_id == _.tenant_id)
    result = await db.execute(query)
    items = result.scalars().all()
    return {"items": [{
        "id": str(p.id), "name": p.name, "description": p.description,
        "placement": p.placement, "duration_days": p.duration_days,
        "price_cents": p.price_cents, "is_active": p.is_active,
        "sort_order": p.sort_order, "created_at": str(p.created_at),
    } for p in items]}


@router.post("/pricing")
async def admin_create_pricing(
    data: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(Permission.require_community_admin()),
):
    pricing = AdPricing(id=uuid4(), tenant_id=_.tenant_id, **{k: v for k, v in data.items() if hasattr(AdPricing, k) and k != 'tenant_id'})
    db.add(pricing)
    await db.flush()
    return {"id": str(pricing.id)}


@router.put("/pricing/{pricing_id}")
async def admin_update_pricing(
    pricing_id: UUID,
    data: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(Permission.require_community_admin()),
):
    result = await db.execute(select(AdPricing).where(AdPricing.id == pricing_id))
    pricing = result.scalar_one_or_none()
    if not pricing:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Pricing not found")
    for k, v in data.items():
        if hasattr(pricing, k) and k != 'id':
            setattr(pricing, k, v)
    await db.flush()
    return {"id": str(pricing.id), "status": "updated"}


@router.delete("/pricing/{pricing_id}")
async def admin_delete_pricing(
    pricing_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(Permission.require_community_admin()),
):
    result = await db.execute(select(AdPricing).where(AdPricing.id == pricing_id))
    pricing = result.scalar_one_or_none()
    if not pricing:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Pricing not found")
    await db.delete(pricing)
    await db.flush()
    return {"status": "deleted"}


# --- Success Story Admin Routes ---

from app.models.success_story import SuccessStory


@router.post("/stories/{story_id}/feature")
async def admin_toggle_story_featured(
    story_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(Permission.require_community_admin()),
):
    result = await db.execute(select(SuccessStory).where(SuccessStory.id == story_id))
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    story.is_featured = not story.is_featured
    await db.flush()
    return {"id": str(story.id), "is_featured": story.is_featured}


# --- Report Flags Admin Routes ---

from app.models.report import Report
from app.models.listing import Listing


@router.get("/reports/flags")
async def admin_list_reports(
    resolved: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(Permission.require_community_admin()),
):
    query = select(Report).order_by(Report.created_at.desc()).limit(50)
    if resolved is not None:
        query = query.where(Report.resolved == resolved)
    result = await db.execute(query)
    reports = result.scalars().all()

    items = []
    for r in reports:
        # Get listing title
        listing_result = await db.execute(select(Listing).where(Listing.id == r.listing_id))
        listing = listing_result.scalar_one_or_none()
        # Get reporter name
        reporter_result = await db.execute(select(User).where(User.id == r.reporter_id))
        reporter = reporter_result.scalar_one_or_none()
        items.append({
            "id": str(r.id),
            "listing_id": str(r.listing_id),
            "listing_title": listing.title if listing else "Deleted",
            "reporter_name": reporter.name if reporter else "Unknown",
            "reason": r.reason,
            "details": r.details,
            "resolved": r.resolved,
            "created_at": str(r.created_at),
        })
    return {"items": items}


@router.post("/reports/flags/{report_id}/resolve")
async def admin_resolve_report(
    report_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(Permission.require_community_admin()),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.resolved = True
    await db.flush()
    return {"status": "resolved"}


# --- Platform Settings Route ---

@router.get("/settings")
async def admin_get_settings(
    _: User = Depends(Permission.require_community_admin()),
):
    from app.config import get_settings
    settings = get_settings()
    return {
        "stripe_configured": bool(settings.STRIPE_SECRET_KEY),
        "stripe_publishable_key": settings.STRIPE_PUBLISHABLE_KEY[:12] + "..." if settings.STRIPE_PUBLISHABLE_KEY else "",
        "stripe_secret_key_masked": settings.STRIPE_SECRET_KEY[:12] + "..." if settings.STRIPE_SECRET_KEY else "",
        "stripe_webhook_configured": bool(settings.STRIPE_WEBHOOK_SECRET),
        "frontend_url": settings.FRONTEND_URL,
        "app_name": settings.APP_NAME,
    }
