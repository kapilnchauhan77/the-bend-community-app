"""Resolve a polymorphic message reference to a compact preview card.

Single source of truth for send-validation, message hydration, and the
composer search endpoint. Returns None when the target does not exist or is
not visible in the given tenant, so callers can reject-on-send or render an
"unavailable" card.
"""
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.listing import Listing
from app.models.shop import Shop
from app.models.bender import BenderPost
from app.models.user import User

REFERENCE_TYPES: set[str] = {"listing", "shop", "bender", "user"}


def _tenant_ok(obj_tenant_id, tenant_id) -> bool:
    # A reference is visible when the target shares the thread's tenant. Both
    # None (single-tenant/local) also matches.
    return obj_tenant_id == tenant_id


def _listing_card(obj) -> dict:
    imgs = sorted(obj.images or [], key=lambda i: i.sort_order)
    image_url = (imgs[0].thumbnail_url or imgs[0].url) if imgs else None
    return {
        "type": "listing", "id": str(obj.id), "title": obj.title,
        "subtitle": f"{obj.category.value} · {obj.urgency.value}",
        "image_url": image_url, "url": f"/listing/{obj.id}",
    }


def _shop_card(obj) -> dict:
    return {
        "type": "shop", "id": str(obj.id), "title": obj.name,
        "subtitle": obj.business_type, "image_url": obj.avatar_url,
        "url": f"/business/{obj.id}",
    }


def _user_card(obj) -> dict:
    subtitle = obj.role.value.replace("_", " ").title()
    return {
        "type": "user", "id": str(obj.id), "title": obj.name,
        "subtitle": subtitle, "image_url": obj.avatar_url,
        "url": f"/business/{obj.shop_id}" if obj.shop_id else None,
    }


def _bender_card(obj, author) -> dict:
    caption = (obj.caption or "").strip()
    title = (caption[:80] + "…") if len(caption) > 80 else (caption or "Bender post")
    return {
        "type": "bender", "id": str(obj.id), "title": title,
        "subtitle": author.name if author else "",
        "image_url": obj.media_thumbnail_url or obj.media_url,
        "url": f"/bender?post={obj.id}",
    }


async def _bender_card_async(db, obj) -> dict:
    author = await db.execute(select(User).where(User.id == obj.author_user_id))
    author = author.scalar_one_or_none()
    return _bender_card(obj, author)


async def resolve_reference(db, tenant_id: UUID | None, ref_type: str, ref_id: UUID) -> dict | None:
    if ref_type not in REFERENCE_TYPES:
        return None

    if ref_type == "listing":
        res = await db.execute(
            select(Listing).options(selectinload(Listing.images)).where(Listing.id == ref_id)
        )
        obj = res.scalar_one_or_none()
        if not obj or not _tenant_ok(obj.tenant_id, tenant_id):
            return None
        return _listing_card(obj)

    if ref_type == "shop":
        res = await db.execute(select(Shop).where(Shop.id == ref_id))
        obj = res.scalar_one_or_none()
        if not obj or not _tenant_ok(obj.tenant_id, tenant_id):
            return None
        return _shop_card(obj)

    if ref_type == "bender":
        res = await db.execute(select(BenderPost).where(BenderPost.id == ref_id))
        obj = res.scalar_one_or_none()
        if not obj or not _tenant_ok(obj.tenant_id, tenant_id):
            return None
        return await _bender_card_async(db, obj)

    # user
    res = await db.execute(select(User).where(User.id == ref_id))
    obj = res.scalar_one_or_none()
    if not obj or not _tenant_ok(obj.tenant_id, tenant_id):
        return None
    return _user_card(obj)


async def search_references(db, tenant_id, q, type_filter=None) -> list[dict]:
    q = (q or "").strip()
    if not q:
        return []
    like = f"%{q}%"
    out = []
    types_ = [type_filter] if type_filter in REFERENCE_TYPES else list(REFERENCE_TYPES)
    if "listing" in types_:
        rows = (await db.execute(select(Listing).options(selectinload(Listing.images))
                .where(Listing.tenant_id == tenant_id, Listing.title.ilike(like)).limit(8))).scalars().all()
        out += [_listing_card(o) for o in rows]
    if "shop" in types_:
        rows = (await db.execute(select(Shop).where(Shop.tenant_id == tenant_id, Shop.name.ilike(like)).limit(8))).scalars().all()
        out += [_shop_card(o) for o in rows]
    if "user" in types_:
        rows = (await db.execute(select(User).where(User.tenant_id == tenant_id, User.name.ilike(like)).limit(8))).scalars().all()
        out += [_user_card(o) for o in rows]
    if "bender" in types_:
        rows = (await db.execute(select(BenderPost).where(BenderPost.tenant_id == tenant_id, BenderPost.caption.ilike(like)).limit(8))).scalars().all()
        out += [await _bender_card_async(db, o) for o in rows]
    return out
