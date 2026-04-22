from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.api.deps import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.models.success_story import SuccessStory
from app.models.listing import Listing
from app.models.enums import ListingStatus

router = APIRouter(prefix="/stories", tags=["Success Stories"])


class StoryCreate(BaseModel):
    listing_id: str
    quote: str
    author_name: str | None = None


@router.get("")
async def list_stories(
    featured: bool | None = Query(None),
    limit: int = Query(10, le=50),
    db: AsyncSession = Depends(get_db),
):
    """List success stories (public)."""
    query = (
        select(SuccessStory)
        .order_by(SuccessStory.created_at.desc())
        .limit(limit)
    )
    if featured is not None:
        query = query.where(SuccessStory.is_featured == featured)

    result = await db.execute(query)
    stories = result.scalars().all()

    # Get listing info for each story
    items = []
    for s in stories:
        listing_result = await db.execute(
            select(Listing)
            .options(selectinload(Listing.shop))
            .where(Listing.id == s.listing_id)
        )
        listing = listing_result.scalar_one_or_none()
        items.append({
            "id": str(s.id),
            "listing_id": str(s.listing_id),
            "listing_title": listing.title if listing else "Unknown",
            "listing_category": listing.category.value if listing and hasattr(listing.category, 'value') else str(listing.category) if listing else "unknown",
            "shop_name": listing.shop.name if listing and listing.shop else "Unknown",
            "shop_id": str(listing.shop.id) if listing and listing.shop else None,
            "author_name": s.author_name,
            "quote": s.quote,
            "is_featured": s.is_featured,
            "created_at": str(s.created_at),
        })

    return {"items": items}


@router.post("")
async def create_story(
    data: StoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a success story for a fulfilled listing."""
    listing_uuid = UUID(data.listing_id)

    # Verify listing exists and is fulfilled
    result = await db.execute(select(Listing).where(Listing.id == listing_uuid))
    listing = result.scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status != ListingStatus.FULFILLED:
        raise HTTPException(status_code=400, detail="Only fulfilled listings can have success stories")

    # Check if story already exists
    existing = await db.execute(select(SuccessStory).where(SuccessStory.listing_id == listing_uuid))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A success story already exists for this listing")

    story = SuccessStory(
        id=uuid4(),
        listing_id=listing_uuid,
        author_name=data.author_name or current_user.name,
        quote=data.quote,
    )
    db.add(story)
    await db.flush()
    return {"id": str(story.id), "status": "created"}
