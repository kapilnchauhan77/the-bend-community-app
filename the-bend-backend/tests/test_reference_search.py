import types, uuid, pytest
from sqlalchemy.sql.elements import BooleanClauseList
from app.services import reference_service as rs

class _Result:
    def __init__(self, rows): self._rows = rows
    def scalars(self): return self
    def all(self): return self._rows
class _DB:
    def __init__(self, rows): self._rows = rows
    async def execute(self, _q): return _Result(self._rows)

_MISSING = object()


def _tenant_filter_value(stmt, table_name, column_name):
    """Best-effort introspection: find a `<table>.<column> == <value>` equality
    criterion in the statement's WHERE clause and return the bound value, or
    _MISSING if no such criterion exists (i.e. the query is NOT scoped by it)."""
    clause = stmt.whereclause
    if clause is None:
        return _MISSING
    criteria = clause.clauses if isinstance(clause, BooleanClauseList) else [clause]
    for c in criteria:
        left = getattr(c, "left", None)
        right = getattr(c, "right", None)
        if (
            left is not None
            and getattr(left, "name", None) == column_name
            and getattr(getattr(left, "table", None), "name", None) == table_name
        ):
            return getattr(right, "value", _MISSING)
    return _MISSING


class _TenantAwareDB:
    """A fake DB that actually respects a `users.tenant_id == X` WHERE criterion
    if the query includes one, and otherwise (bug: unscoped query) returns every
    queued row regardless of tenant -- so this test genuinely fails against an
    unscoped query and passes once the query is tenant-scoped."""
    def __init__(self, rows): self._rows = rows
    async def execute(self, q):
        val = _tenant_filter_value(q, "users", "tenant_id")
        rows = self._rows if val is _MISSING else [r for r in self._rows if getattr(r, "tenant_id", None) == val]
        return _Result(rows)


@pytest.mark.asyncio
async def test_search_shops_returns_cards():
    tid = uuid.uuid4()
    shop = types.SimpleNamespace(id=uuid.uuid4(), tenant_id=tid, name="Blue Bakery",
                                 business_type="Food", avatar_url=None)
    items = await rs.search_references(_DB([shop]), tid, "blue", "shop")
    assert items and items[0]["type"] == "shop" and items[0]["title"] == "Blue Bakery"


@pytest.mark.asyncio
async def test_search_users_excludes_other_tenant():
    """Cross-tenant leak regression: a user search must be scoped to the
    caller's tenant, matching the listing/shop/bender branches."""
    tid = uuid.uuid4()
    other_tid = uuid.uuid4()
    same_tenant_user = types.SimpleNamespace(
        id=uuid.uuid4(), tenant_id=tid, name="Dana Smith",
        avatar_url=None, shop_id=None, role=types.SimpleNamespace(value="individual"),
    )
    other_tenant_user = types.SimpleNamespace(
        id=uuid.uuid4(), tenant_id=other_tid, name="Dana Jones",
        avatar_url=None, shop_id=None, role=types.SimpleNamespace(value="individual"),
    )
    db = _TenantAwareDB([same_tenant_user, other_tenant_user])
    items = await rs.search_references(db, tid, "dana", "user")
    titles = {i["title"] for i in items}
    assert titles == {"Dana Smith"}
