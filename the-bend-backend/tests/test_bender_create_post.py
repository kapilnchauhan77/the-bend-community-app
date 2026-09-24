"""Regression coverage for creating Bender posts as a business account."""

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.v1.bender import create_post
from app.models.shop import Shop
from app.schemas.bender import BenderPostCreate
from app.services.bender_service import BenderService


@pytest.mark.asyncio
async def test_business_post_response_loads_shop_without_lazy_relationship_access():
    shop_id = uuid4()
    user_id = uuid4()

    class BusinessUser:
        def __init__(self):
            self.id = user_id
            self.name = "Market owner"
            self.avatar_url = None
            self.shop_id = shop_id

        @property
        def shop(self):
            raise AssertionError("Async ORM relationship was lazy-loaded")

    class Db:
        async def get(self, model, identity):
            assert model is Shop
            assert identity == shop_id
            return SimpleNamespace(id=shop_id, name="Westmoreland Market")

    class Service(BenderService):
        async def create_post(self, data, current_user):
            return SimpleNamespace(
                id=uuid4(),
                caption=data.caption,
                media_url=data.media_url,
                media_thumbnail_url=data.media_thumbnail_url,
                media_type=data.media_type,
                link_preview=None,
                like_count=0,
                comment_count=0,
                created_at=datetime.now(timezone.utc),
            )

    result = await create_post(
        BenderPostCreate(
            caption="Saturday market",
            media_url="/uploads/images/poster.jpg",
            media_thumbnail_url="/uploads/images/poster_thumb.jpg",
            media_type="image",
        ),
        service=Service(Db()),
        current_user=BusinessUser(),
    )

    assert result.caption == "Saturday market"
    assert result.media_url == "/uploads/images/poster.jpg"
    assert result.author.shop_id == str(shop_id)
    assert result.author.shop_name == "Westmoreland Market"
