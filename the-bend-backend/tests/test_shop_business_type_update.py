import types
import uuid

import pytest

from app.api.v1.shops import update_shop
from app.core.business_types import BUSINESS_TYPES
from app.core.exceptions import ForbiddenError, ValidationError
from app.models.shop import Shop
from app.models.enums import ShopStatus
from app.schemas.shop import ShopUpdateRequest
from app.services.shop_service import ShopService


class _Result:
    def __init__(self, shop):
        self.shop = shop

    def scalar_one_or_none(self):
        return self.shop


class _RecordingSession:
    def __init__(self, shop):
        self.shop = shop
        self.execute_count = 0
        self.flush_count = 0
        self.refresh_count = 0

    async def execute(self, _statement):
        self.execute_count += 1
        return _Result(self.shop)

    async def flush(self):
        self.flush_count += 1

    async def refresh(self, instance):
        assert instance is self.shop
        self.refresh_count += 1


def _shop_owner(shop_id, owner_id, business_type="food_and_drink"):
    return Shop(
        id=shop_id,
        name="Original business",
        admin_user_id=owner_id,
        business_type=business_type,
        contact_phone="555-0100",
        status=ShopStatus.ACTIVE,
    )


def _user(user_id):
    return types.SimpleNamespace(
        id=user_id,
        role=types.SimpleNamespace(value="shop_admin"),
    )


def test_supported_business_categories_match_the_settings_selector():
    assert BUSINESS_TYPES == frozenset(
        {
            "food_and_drink",
            "lodging_and_travel",
            "retail",
            "home_and_property_services",
            "auto_and_marine",
            "health_and_wellness",
            "professional_services",
            "agriculture_and_outdoors",
            "arts_events_experiences",
            "family_community_education",
            "trades_industrial_b2b",
            "public_services_utilities",
        }
    )


@pytest.mark.asyncio
async def test_shop_owner_can_update_business_category_through_api():
    shop_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    shop = _shop_owner(shop_id, owner_id, business_type="restaurant")
    session = _RecordingSession(shop)
    service = ShopService(session)

    result = await update_shop(
        shop_id,
        ShopUpdateRequest(business_type="retail"),
        service,
        _user(owner_id),
    )

    assert shop.business_type == "retail"
    assert session.flush_count == 1
    assert session.refresh_count == 1
    assert result == {"id": str(shop_id), "status": "updated"}


@pytest.mark.asyncio
async def test_shop_category_update_rejects_a_new_unsupported_value():
    shop_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    shop = _shop_owner(shop_id, owner_id)
    session = _RecordingSession(shop)

    with pytest.raises(ValidationError):
        await update_shop(
            shop_id,
            ShopUpdateRequest(business_type="unlisted_category"),
            ShopService(session),
            _user(owner_id),
        )

    assert shop.business_type == "food_and_drink"
    assert session.flush_count == 0


@pytest.mark.asyncio
async def test_unchanged_legacy_category_does_not_block_other_settings_updates():
    shop_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    shop = _shop_owner(shop_id, owner_id, business_type="restaurant")
    session = _RecordingSession(shop)

    await update_shop(
        shop_id,
        ShopUpdateRequest(
            name="Updated business",
            business_type="restaurant",
        ),
        ShopService(session),
        _user(owner_id),
    )

    assert shop.name == "Updated business"
    assert shop.business_type == "restaurant"
    assert session.flush_count == 1


@pytest.mark.asyncio
async def test_shop_category_update_preserves_owner_authorization():
    shop_id = uuid.uuid4()
    shop = _shop_owner(shop_id, uuid.uuid4())
    session = _RecordingSession(shop)
    service = ShopService(session)

    with pytest.raises(ForbiddenError):
        await update_shop(
            shop_id,
            ShopUpdateRequest(business_type="retail"),
            service,
            _user(uuid.uuid4()),
        )

    assert session.flush_count == 0
