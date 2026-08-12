import types, uuid, pytest
from app.services.message_service import build_message_reference

class _Result:
    def __init__(self, obj): self._obj = obj
    def scalar_one_or_none(self): return self._obj
    def scalars(self): return self
    def all(self): return []
class _DB:
    def __init__(self, obj): self._obj = obj
    async def execute(self, _q): return _Result(self._obj)

@pytest.mark.asyncio
async def test_present_reference_hydrates_card():
    shop = types.SimpleNamespace(id=uuid.uuid4(), tenant_id=None, name="Bakery",
                                 business_type="Food", avatar_url=None)
    m = types.SimpleNamespace(reference_type="shop", reference_id=shop.id)
    card = await build_message_reference(_DB(shop), None, m)
    assert card["type"] == "shop" and card["title"] == "Bakery"

@pytest.mark.asyncio
async def test_missing_reference_marked_unavailable():
    m = types.SimpleNamespace(reference_type="shop", reference_id=uuid.uuid4())
    card = await build_message_reference(_DB(None), None, m)
    assert card == {"type": "shop", "id": str(m.reference_id), "unavailable": True}

@pytest.mark.asyncio
async def test_no_reference_returns_none():
    m = types.SimpleNamespace(reference_type=None, reference_id=None)
    assert await build_message_reference(_DB(None), None, m) is None
