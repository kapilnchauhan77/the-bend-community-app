import types
import uuid
from datetime import datetime

import pytest

from app.api.v1.shops import list_shops
from app.core.pagination import decode_cursor
from app.models.enums import ShopStatus
from app.services.admin_service import AdminService


class _RowsResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _ScalarsResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _ValueResult:
    def __init__(self, value):
        self._value = value

    def scalar_one(self):
        return self._value


def _limit_for_statement(statement, rows):
    limit_clause = statement._limit_clause
    limit = limit_clause.value if limit_clause is not None else len(rows)
    return rows[:limit]


class _PublicDirectoryDB:
    def __init__(self, page_shops):
        self._page_shops = page_shops
        self._main_query_seen = False
        self.main_statement = None

    async def execute(self, statement):
        if not self._main_query_seen:
            self._main_query_seen = True
            self.main_statement = statement
            rows = [(shop, 0) for shop in self._page_shops]
            return _RowsResult(_limit_for_statement(statement, rows))
        return _ValueResult(0)


class _AdminDirectoryDB:
    def __init__(self, page_shops):
        self._page_shops = page_shops
        self._main_query_seen = False
        self.main_statement = None

    async def execute(self, statement):
        if not self._main_query_seen:
            self._main_query_seen = True
            self.main_statement = statement
            return _ScalarsResult(_limit_for_statement(statement, self._page_shops))
        return _ValueResult(0)


def _shop(index, status=ShopStatus.ACTIVE):
    return types.SimpleNamespace(
        id=uuid.UUID(int=index + 1),
        name=f"Business {index + 1}",
        business_type="Professional_services",
        address=None,
        avatar_url=None,
        contact_phone=None,
        created_at=datetime(2026, 9, index + 1),
        admin_user_id=None,
        status=status,
    )


@pytest.mark.asyncio
async def test_public_shop_directory_cursor_returns_the_next_page():
    shops = [_shop(index) for index in range(3)]
    first_db = _PublicDirectoryDB(shops)

    first_page = await list_shops(
        search=None,
        business_type=None,
        cursor=None,
        limit=2,
        db=first_db,
        tenant=None,
        current_user=None,
    )
    second_db = _PublicDirectoryDB([shops[2]])
    second_page = await list_shops(
        search=None,
        business_type=None,
        cursor=first_page["next_cursor"],
        limit=2,
        db=second_db,
        tenant=None,
        current_user=None,
    )

    assert [item["id"] for item in first_page["items"]] == [str(shops[0].id), str(shops[1].id)]
    assert first_page["has_more"] is True
    assert decode_cursor(first_page["next_cursor"])["id"] == str(shops[1].id)
    assert [item["id"] for item in second_page["items"]] == [str(shops[2].id)]
    assert second_page["has_more"] is False
    assert second_page["next_cursor"] is None
    assert len(second_db.main_statement._where_criteria) > len(first_db.main_statement._where_criteria)


@pytest.mark.asyncio
async def test_admin_shop_directory_cursor_returns_the_next_page():
    shops = [_shop(index, ShopStatus.REJECTED if index == 2 else ShopStatus.ACTIVE) for index in range(3)]
    first_db = _AdminDirectoryDB(shops)

    first_page = await AdminService(first_db).get_shops(limit=2)
    second_db = _AdminDirectoryDB([shops[2]])
    second_page = await AdminService(second_db).get_shops(
        cursor=first_page["next_cursor"],
        limit=2,
    )

    assert [item["id"] for item in first_page["items"]] == [str(shops[0].id), str(shops[1].id)]
    assert first_page["has_more"] is True
    assert decode_cursor(first_page["next_cursor"])["id"] == str(shops[1].id)
    assert [item["id"] for item in second_page["items"]] == [str(shops[2].id)]
    assert second_page["items"][0]["status"] == "rejected"
    assert second_page["has_more"] is False
    assert second_page["next_cursor"] is None
    assert len(second_db.main_statement._where_criteria) > len(first_db.main_statement._where_criteria)
