from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.listing import Listing
from app.models.event import Event
from app.models.volunteer import Volunteer
from app.models.talent import Talent
from app.models.enums import ListingStatus, EventStatus

router = APIRouter(prefix="/digest", tags=["Digest"])


@router.get("/weekly")
async def get_weekly_digest(db: AsyncSession = Depends(get_db)):
    """Get content for weekly email digest (public, used by email service)."""
    one_week_ago = datetime.utcnow() - timedelta(days=7)

    # New listings this week
    new_listings_result = await db.execute(
        select(func.count()).select_from(Listing).where(
            Listing.created_at >= one_week_ago,
            Listing.status == ListingStatus.ACTIVE,
        )
    )
    new_listings = new_listings_result.scalar_one()

    # Fulfilled this week
    fulfilled_result = await db.execute(
        select(func.count()).select_from(Listing).where(
            Listing.fulfilled_at >= one_week_ago,
        )
    )
    fulfilled = fulfilled_result.scalar_one()

    # Upcoming events (next 7 days)
    next_week = datetime.utcnow() + timedelta(days=7)
    events_result = await db.execute(
        select(Event).where(
            Event.status == EventStatus.ACTIVE,
            Event.start_date >= datetime.utcnow(),
            Event.start_date <= next_week,
        ).order_by(Event.start_date).limit(5)
    )
    upcoming_events = [{
        "title": e.title,
        "start_date": str(e.start_date),
        "location": e.location,
    } for e in events_result.scalars().all()]

    # New volunteers
    new_volunteers = (await db.execute(
        select(func.count()).select_from(Volunteer).where(Volunteer.created_at >= one_week_ago)
    )).scalar_one()

    # New talent
    new_talent = (await db.execute(
        select(func.count()).select_from(Talent).where(Talent.created_at >= one_week_ago)
    )).scalar_one()

    return {
        "period": "weekly",
        "generated_at": str(datetime.utcnow()),
        "stats": {
            "new_listings": new_listings,
            "fulfilled_listings": fulfilled,
            "new_volunteers": new_volunteers,
            "new_talent": new_talent,
        },
        "upcoming_events": upcoming_events,
    }
