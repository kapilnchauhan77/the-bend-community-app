from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.exceptions import ForbiddenError, NotFoundError
from app.schemas.bender import BenderLinkPreviewSnapshot, BenderPostUpdate
from app.services.bender_service import BenderService


class RecordingDB:
    async def flush(self):
        return None

    async def refresh(self, _post):
        return None


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
    service = BenderService(RecordingDB(), link_preview_store=store)
    async def visible(*_args):
        return target
    service._get_visible_post_or_404 = visible

    await service.update_post(target.id, BenderPostUpdate(caption="New https://example.org/new", preview_token="draft"), author)
    assert target.link_preview == snapshot.model_dump(mode="json")
    assert store.calls[0][0] == "draft"

    with pytest.raises(ForbiddenError):
        await service.update_post(target.id, BenderPostUpdate(caption="Nope"), user(tenant_id))


@pytest.mark.asyncio
async def test_cross_tenant_edit_is_not_found():
    target_tenant = uuid4()
    target = post(uuid4(), target_tenant)
    service = BenderService(RecordingDB())

    async def not_visible(*_args):
        raise NotFoundError("Post")

    service._get_visible_post_or_404 = not_visible
    with pytest.raises(NotFoundError):
        await service.update_post(target.id, BenderPostUpdate(caption="Nope"), user(uuid4()))
