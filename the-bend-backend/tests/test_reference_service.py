import types, uuid
import pytest
from app.services import reference_service as rs


class _Result:
    def __init__(self, obj): self._obj = obj
    def scalar_one_or_none(self): return self._obj
    def scalars(self): return self
    def all(self): return [self._obj] if self._obj is not None else []


class _DB:
    """Returns queued objects from execute(), in order."""
    def __init__(self, objs): self._objs = list(objs)
    async def execute(self, _q): return _Result(self._objs.pop(0) if self._objs else None)


def _tenant(): return uuid.uuid4()


@pytest.mark.asyncio
async def test_listing_card():
    tid = _tenant()
    listing = types.SimpleNamespace(
        id=uuid.uuid4(), tenant_id=tid, title="Spare oven",
        category=types.SimpleNamespace(value="equipment"),
        urgency=types.SimpleNamespace(value="urgent"),
        images=[types.SimpleNamespace(url="/uploads/a.jpg", thumbnail_url="/uploads/a_t.jpg", sort_order=0)],
    )
    db = _DB([listing])
    card = await rs.resolve_reference(db, tid, "listing", listing.id)
    assert card["type"] == "listing"
    assert card["title"] == "Spare oven"
    assert card["subtitle"] == "equipment · urgent"
    assert card["image_url"] == "/uploads/a_t.jpg"
    assert card["url"] == f"/listing/{listing.id}"


@pytest.mark.asyncio
async def test_cross_tenant_returns_none():
    listing = types.SimpleNamespace(id=uuid.uuid4(), tenant_id=uuid.uuid4(), title="x",
                                    category=types.SimpleNamespace(value="c"),
                                    urgency=types.SimpleNamespace(value="normal"), images=[])
    db = _DB([listing])
    card = await rs.resolve_reference(db, _tenant(), "listing", listing.id)  # different tenant
    assert card is None


@pytest.mark.asyncio
async def test_missing_returns_none():
    db = _DB([None])
    assert await rs.resolve_reference(db, _tenant(), "listing", uuid.uuid4()) is None


@pytest.mark.asyncio
async def test_unknown_type_returns_none():
    assert await rs.resolve_reference(_DB([]), _tenant(), "bogus", uuid.uuid4()) is None


@pytest.mark.asyncio
async def test_user_with_shop_links_to_business():
    tid = _tenant(); sid = uuid.uuid4()
    user = types.SimpleNamespace(id=uuid.uuid4(), tenant_id=tid, name="Dana",
                                 avatar_url=None, shop_id=sid,
                                 role=types.SimpleNamespace(value="shop_admin"))
    card = await rs.resolve_reference(_DB([user]), tid, "user", user.id)
    assert card["url"] == f"/business/{sid}"


@pytest.mark.asyncio
async def test_user_without_shop_has_null_url():
    tid = _tenant()
    user = types.SimpleNamespace(id=uuid.uuid4(), tenant_id=tid, name="Sam",
                                 avatar_url=None, shop_id=None,
                                 role=types.SimpleNamespace(value="individual"))
    card = await rs.resolve_reference(_DB([user]), tid, "user", user.id)
    assert card["url"] is None


@pytest.mark.asyncio
async def test_bender_card_uses_canonical_focused_post_path():
    tid = _tenant()
    post = types.SimpleNamespace(id=uuid.uuid4(), tenant_id=tid, caption="Fresh update", media_thumbnail_url=None, media_url=None, author_user_id=uuid.uuid4())
    card = await rs.resolve_reference(_DB([post]), tid, "bender", post.id)
    assert card["url"] == f"/bender/{post.id}"
