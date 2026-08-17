import uuid

import pytest


@pytest.mark.asyncio
async def test_auth_me_returns_user_and_owned_shop_for_current_tenant():
    from app.api.v1.auth import me
    from app.models.enums import ShopStatus, UserRole

    tenant_id = uuid.uuid4()
    shop_id = uuid.uuid4()
    user = type("User", (), {"id": uuid.uuid4(), "name": "Ada", "email": "ada@example.com", "role": UserRole.INDIVIDUAL, "avatar_url": None, "shop_id": shop_id, "tenant_id": tenant_id})()
    shop = type("Shop", (), {"id": shop_id, "name": "Ada Cafe", "status": ShopStatus.ACTIVE, "avatar_url": None, "tenant_id": tenant_id})()

    class Result:
        def scalar_one_or_none(self): return shop

    class DB:
        async def execute(self, _query): return Result()

    response = await me(current_user=user, tenant=type("Tenant", (), {"id": tenant_id})(), db=DB())
    assert response["user"]["id"] == str(user.id)
    assert response["shop"]["id"] == str(shop.id)


@pytest.mark.asyncio
async def test_auth_me_does_not_return_shop_from_another_tenant():
    from app.api.v1.auth import me
    from app.core.exceptions import NotFoundError
    from app.models.enums import UserRole

    tenant_id = uuid.uuid4()
    user = type("User", (), {"id": uuid.uuid4(), "name": "Ada", "email": "ada@example.com", "role": UserRole.INDIVIDUAL, "avatar_url": None, "shop_id": uuid.uuid4(), "tenant_id": tenant_id})()

    class Result:
        def scalar_one_or_none(self): return None

    class DB:
        async def execute(self, _query): return Result()

    with pytest.raises(NotFoundError):
        await me(current_user=user, tenant=type("Tenant", (), {"id": tenant_id})(), db=DB())
