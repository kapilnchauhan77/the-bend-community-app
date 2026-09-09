import types
import uuid
from datetime import datetime, timedelta

import pytest

from app.core.pagination import decode_cursor
from app.models.enums import ShopStatus
from app.services.admin_service import AdminService


class _ScalarRows:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows

    def scalar_one_or_none(self):
        return None


class _Count:
    def __init__(self, value):
        self.value = value

    def scalar_one(self):
        return self.value


class _RegistrationDB:
    def __init__(self, shops, counts=(0, 0, 0)):
        self.shops = shops
        self.counts = iter(counts)
        self.main_seen = False

    async def execute(self, statement):
        # The registration query is the only query selecting Shop. The remaining
        # per-row queries select User and return no admin in this focused seam.
        if getattr(statement, "_limit_clause", None) is not None and not self.main_seen:
            self.main_seen = True
            params = statement.compile().params
            cursor_time = params.get("created_at_1")
            cursor_id = params.get("id_1")
            rows = sorted(self.shops, key=lambda shop: (shop.created_at, shop.id), reverse=True)
            status = params.get("status_1")
            tenant_id = params.get("tenant_id_1")
            if status is not None:
                rows = [shop for shop in rows if shop.status == status]
            if tenant_id is not None:
                rows = [shop for shop in rows if shop.tenant_id == tenant_id]
            if cursor_time is not None and cursor_id is not None:
                rows = [
                    shop for shop in rows
                    if shop.created_at < cursor_time
                    or (shop.created_at == cursor_time and shop.id < cursor_id)
                ]
            limit = statement._limit_clause.value
            return _ScalarRows(rows[:limit])
        if next(self._is_count_query(statement), False):
            return _Count(next(self.counts))
        return _ScalarRows([])

    @staticmethod
    def _is_count_query(statement):
        yield any("count" in str(column).lower() for column in statement._raw_columns)


def _shop(index, *, status=ShopStatus.ACTIVE, tenant_id=None, created_at=None):
    return types.SimpleNamespace(
        id=uuid.UUID(int=index + 1),
        name=f"Approved Business {index + 1}",
        business_type="Professional_services",
        status=status,
        address=None,
        contact_phone=None,
        whatsapp=None,
        rejection_reason=None,
        admin_user_id=None,
        tenant_id=tenant_id,
        created_at=created_at or datetime(2026, 9, 10) - timedelta(minutes=index),
    )


@pytest.mark.asyncio
async def test_registration_pages_are_stable_and_cover_all_rows_without_duplicates():
    shops = [_shop(index) for index in range(25)]
    first_db = _RegistrationDB(shops)
    first_page = await AdminService(first_db).get_registrations(status="approved", limit=20)

    assert len(first_page["items"]) == 20
    assert first_page["has_more"] is True
    assert first_page["next_cursor"]
    decoded = decode_cursor(first_page["next_cursor"])
    assert set(decoded) == {"created_at", "id"}

    second_db = _RegistrationDB(shops)
    second_page = await AdminService(second_db).get_registrations(
        status="approved", cursor=first_page["next_cursor"], limit=20
    )
    first_ids = [item["id"] for item in first_page["items"]]
    second_ids = [item["id"] for item in second_page["items"]]
    assert len(second_ids) == 5
    assert not set(first_ids) & set(second_ids)
    assert set(first_ids + second_ids) == {str(shop.id) for shop in shops}
    assert second_page["has_more"] is False
    assert second_page["next_cursor"] is None


@pytest.mark.asyncio
async def test_registration_order_uses_id_as_tie_breaker_and_filters_status_and_tenant():
    same_time = datetime(2026, 9, 10, 12, 0)
    tenant = uuid.uuid4()
    shops = [
        _shop(1, tenant_id=tenant, created_at=same_time),
        _shop(2, tenant_id=tenant, created_at=same_time),
        _shop(3, tenant_id=uuid.uuid4(), created_at=same_time),
        _shop(4, tenant_id=tenant, status=ShopStatus.REJECTED, created_at=same_time),
    ]
    result = await AdminService(_RegistrationDB(shops), tenant_id=tenant).get_registrations(
        status="approved", limit=20
    )

    assert [item["id"] for item in result["items"]] == [str(shops[1].id), str(shops[0].id)]
    assert all(item["status"] == "approved" for item in result["items"])


@pytest.mark.asyncio
async def test_registration_counts_are_full_filtered_totals():
    db = _RegistrationDB([], counts=(7, 25, 4))
    counts = await AdminService(db, tenant_id=uuid.uuid4()).get_registration_counts()

    assert counts == {"pending": 7, "approved": 25, "rejected": 4}
