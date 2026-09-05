from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.exceptions import BusinessRuleViolation, ForbiddenError, NotFoundError
from app.api.v1.bender import router
from app.core.permissions import get_current_user
from app.schemas.bender import BenderLinkPreviewSnapshot, BenderPostUpdate
from app.services.bender_service import BenderService


class RecordingDB:
    async def flush(self):
        return None

    async def refresh(self, _post):
        return None


class LookupDB(RecordingDB):
    def __init__(self, target):
        self.target = target
        self.executed = 0

    async def execute(self, _statement):
        self.executed += 1
        target = self.target

        class Result:
            def scalar_one_or_none(self):
                return target

        return Result()

class PreviewStore:
    def __init__(self, snapshot=None):
        self.snapshot = snapshot
        self.calls = []

    async def resolve_draft(self, token, **kwargs):
        self.calls.append((token, kwargs))
        return self.snapshot


def user(tenant_id, user_id=None):
    return SimpleNamespace(id=user_id or uuid4(), tenant_id=tenant_id, shop_id=None)


def post(author_id, tenant_id, preview=None):
    return SimpleNamespace(
        id=uuid4(), author_user_id=author_id, tenant_id=tenant_id,
        caption="Old https://example.org/old", media_url="/uploads/photo.jpg",
        media_thumbnail_url="/uploads/thumb.jpg", media_type="image",
        link_preview=preview, like_count=4, comment_count=2,
        created_at=datetime.now(UTC), author=SimpleNamespace(name="Author"), shop=None,
    )


@pytest.mark.asyncio
async def test_author_edit_preserves_media_counters_and_unchanged_preview():
    tenant_id = uuid4()
    author = user(tenant_id)
    existing = BenderLinkPreviewSnapshot(source_url="https://example.org/old", url="https://example.org/old", title="Old").model_dump(mode="json")
    target = post(author.id, tenant_id, existing)
    service = BenderService(RecordingDB())
    async def visible(*_args):
        return target
    service._get_visible_post_or_404 = visible

    updated = await service.update_post(target.id, BenderPostUpdate(caption="  Updated https://example.org/old  "), author)

    assert updated.caption == "Updated https://example.org/old"
    assert updated.link_preview == existing
    assert (updated.media_url, updated.media_thumbnail_url, updated.media_type) == ("/uploads/photo.jpg", "/uploads/thumb.jpg", "image")
    assert (updated.like_count, updated.comment_count, updated.author_user_id) == (4, 2, author.id)


@pytest.mark.asyncio
async def test_new_valid_draft_replaces_preview_and_non_author_is_forbidden():
    tenant_id = uuid4()
    author = user(tenant_id)
    target = post(author.id, tenant_id)
    snapshot = BenderLinkPreviewSnapshot(source_url="https://example.org/new", url="https://example.org/new", title="New")
    store = PreviewStore(snapshot)
    service = BenderService(LookupDB(target), link_preview_store=store)

    await service.update_post(target.id, BenderPostUpdate(caption="New https://example.org/new", preview_token="draft"), author)
    assert target.link_preview == snapshot.model_dump(mode="json")
    assert store.calls[0][0] == "draft"

    with pytest.raises(ForbiddenError):
        await service.update_post(target.id, BenderPostUpdate(caption="Nope"), user(tenant_id))


@pytest.mark.asyncio
async def test_cross_tenant_edit_is_not_found():
    target_tenant = uuid4()
    target = post(uuid4(), target_tenant)
    class ForeignLookupDB(RecordingDB):
        async def execute(self, _statement):
            class Result:
                def scalar_one_or_none(self):
                    return None
            return Result()

    service = BenderService(ForeignLookupDB())
    with pytest.raises(NotFoundError):
        await service.update_post(target.id, BenderPostUpdate(caption="Nope"), user(uuid4()))


@pytest.mark.asyncio
async def test_removed_or_changed_url_clears_preview_and_unusable_token_cannot_keep_stale_data():
    tenant_id = uuid4()
    author = user(tenant_id)
    existing = BenderLinkPreviewSnapshot(source_url="https://example.org/old", url="https://example.org/old", title="Old").model_dump(mode="json")
    target = post(author.id, tenant_id, existing)
    service = BenderService(LookupDB(target), link_preview_store=PreviewStore(None))

    await service.update_post(target.id, BenderPostUpdate(caption="Changed https://example.org/new", preview_token="wrong"), author)
    assert target.link_preview is None
    target.link_preview = existing
    await service.update_post(target.id, BenderPostUpdate(caption="Removed URL"), author)
    assert target.link_preview is None
    target.link_preview = existing
    await service.update_post(target.id, BenderPostUpdate(caption="Still https://example.org/old", preview_token="wrong"), author)
    assert target.link_preview == existing


def test_update_schema_requires_caption_and_limits_length():
    with pytest.raises(ValueError):
        BenderPostUpdate()
    with pytest.raises(ValueError):
        BenderPostUpdate(caption="x" * 2001)


def test_update_route_is_patch_and_requires_authenticated_user():
    route = next(route for route in router.routes if route.path == "/bender/posts/{post_id}" and "PATCH" in route.methods)
    assert get_current_user in {dependency.call for dependency in route.dependant.dependencies}


@pytest.mark.asyncio
async def test_blank_caption_without_media_is_rejected():
    tenant_id = uuid4()
    author = user(tenant_id)
    target = post(author.id, tenant_id)
    target.media_url = None
    service = BenderService(LookupDB(target))
    with pytest.raises(BusinessRuleViolation, match="Provide a caption or media"):
        await service.update_post(target.id, BenderPostUpdate(caption="   "), author)
