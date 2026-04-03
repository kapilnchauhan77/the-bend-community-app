"""Scheduled background tasks (Celery Beat)."""
import logging
from datetime import datetime, timedelta
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task
def check_expiring_listings():
    """Find listings with expiry_date within 24 hours. Runs every hour."""
    import asyncio
    asyncio.run(_check_expiring())


async def _check_expiring():
    from app.database import async_session
    from app.models.listing import Listing
    from app.models.enums import ListingStatus, UrgencyLevel
    from sqlalchemy import select, update

    async with async_session() as session:
        threshold = datetime.utcnow() + timedelta(hours=24)
        result = await session.execute(
            select(Listing).where(
                Listing.status == ListingStatus.ACTIVE,
                Listing.expiry_date.isnot(None),
                Listing.expiry_date <= threshold,
                Listing.urgency != UrgencyLevel.CRITICAL,
            )
        )
        listings = result.scalars().all()
        for listing in listings:
            listing.urgency = UrgencyLevel.URGENT
            logger.info(f"Boosted urgency for listing {listing.id} (expiring {listing.expiry_date})")
        await session.commit()
        logger.info(f"Checked expiring listings: {len(listings)} boosted")


@celery_app.task
def auto_expire_listings():
    """Expire listings past their expiry_date. Runs every hour."""
    import asyncio
    asyncio.run(_auto_expire())


async def _auto_expire():
    from app.database import async_session
    from app.models.listing import Listing
    from app.models.enums import ListingStatus
    from sqlalchemy import update

    async with async_session() as session:
        now = datetime.utcnow()
        result = await session.execute(
            update(Listing).where(
                Listing.status == ListingStatus.ACTIVE,
                Listing.expiry_date.isnot(None),
                Listing.expiry_date < now,
            ).values(status=ListingStatus.EXPIRED)
        )
        await session.commit()
        logger.info(f"Auto-expired {result.rowcount} listings")


@celery_app.task
def auto_expire_old_listings():
    """Expire active listings older than 7 days with no activity. Runs daily."""
    import asyncio
    asyncio.run(_expire_old())


async def _expire_old():
    from app.database import async_session
    from app.models.listing import Listing
    from app.models.enums import ListingStatus
    from sqlalchemy import update

    async with async_session() as session:
        cutoff = datetime.utcnow() - timedelta(days=7)
        result = await session.execute(
            update(Listing).where(
                Listing.status == ListingStatus.ACTIVE,
                Listing.created_at < cutoff,
                Listing.interest_count == 0,
            ).values(status=ListingStatus.EXPIRED)
        )
        await session.commit()
        logger.info(f"Expired {result.rowcount} old inactive listings")


@celery_app.task
def cleanup_read_notifications():
    """Delete read notifications older than 30 days. Runs weekly."""
    import asyncio
    asyncio.run(_cleanup_notifications())


async def _cleanup_notifications():
    from app.database import async_session
    from app.models.notification import Notification
    from sqlalchemy import delete

    async with async_session() as session:
        cutoff = datetime.utcnow() - timedelta(days=30)
        result = await session.execute(
            delete(Notification).where(
                Notification.is_read == True,
                Notification.created_at < cutoff,
            )
        )
        await session.commit()
        logger.info(f"Cleaned up {result.rowcount} old read notifications")
