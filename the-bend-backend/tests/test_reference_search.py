import types, uuid, pytest
from app.services import reference_service as rs

class _Result:
    def __init__(self, rows): self._rows = rows
    def scalars(self): return self
    def all(self): return self._rows
class _DB:
    def __init__(self, rows): self._rows = rows
    async def execute(self, _q): return _Result(self._rows)

@pytest.mark.asyncio
async def test_search_shops_returns_cards():
    tid = uuid.uuid4()
    shop = types.SimpleNamespace(id=uuid.uuid4(), tenant_id=tid, name="Blue Bakery",
                                 business_type="Food", avatar_url=None)
    items = await rs.search_references(_DB([shop]), tid, "blue", "shop")
    assert items and items[0]["type"] == "shop" and items[0]["title"] == "Blue Bakery"
