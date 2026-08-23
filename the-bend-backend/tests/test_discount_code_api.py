import types
from datetime import datetime
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import get_db
from app.api.v1.discount_codes import get_service, router
from app.core.permissions import get_current_user


class FakeDiscountCodeService:
    def __init__(self, rows):
        self.rows = rows

    async def list_mine(self, _current_user):
        return self.rows


def _discount_code():
    return types.SimpleNamespace(
        id=uuid4(),
        owner_shop_id=None,
        owner_user_id=None,
        code="CHURCHFREEEVENT",
        name="Free Nonprofit Church Event",
        description="One free event placement for a nonprofit church.",
        discount_type="percentage",
        discount_value=100,
        expiry_date=None,
        max_uses=1,
        usage_count=0,
        is_active=True,
        coupon_type="event",
        created_at=datetime(2026, 8, 24, 12, 0, 0),
    )


def _app():
    app = FastAPI()

    async def no_database():
        yield None

    async def current_user():
        return types.SimpleNamespace(id=uuid4(), tenant_id=uuid4())

    app.dependency_overrides[get_db] = no_database
    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_service] = lambda: FakeDiscountCodeService([_discount_code()])
    app.include_router(router, prefix="/api/v1")
    return app


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/discount-codes",
        "/api/v1/discount-codes/mine",
    ],
)
def test_owner_discount_codes_support_current_and_cached_client_routes(path):
    with TestClient(_app()) as client:
        response = client.get(path)

    assert response.status_code == 200
    assert [row["code"] for row in response.json()] == ["CHURCHFREEEVENT"]
