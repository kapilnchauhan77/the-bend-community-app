from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from redis.exceptions import RedisError

from app.schemas.bender import BenderLinkPreviewSnapshot, BenderPostCreate
from app.services.bender_service import BenderService


class _RecordingDB:
    def __init__(self):
        self.added = []
        self.flush_count = 0
        self.refresh_count = 0

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        self.flush_count += 1
        for post in self.added:
            if post.created_at is None:
                post.created_at = datetime.now(UTC)

    async def refresh(self, value):
        self.refresh_count += 1


class _PreviewStore:
    def __init__(self, snapshot=None, error=None):
        self.snapshot = snapshot
        self.error = error
        self.calls = []

    async def resolve_draft(self, token, *, user_id, tenant_id, caption):
        self.calls.append(
            {
                "token": token,
                "user_id": user_id,
                "tenant_id": tenant_id,
                "caption": caption,
            }
        )
        if self.error:
            raise self.error
        return self.snapshot


def _user(*, tenant_id=None):
    return SimpleNamespace(
        id=uuid4(),
        tenant_id=tenant_id,
        shop_id=None,
    )


def _snapshot():
    return BenderLinkPreviewSnapshot(
        source_url="https://example.org/event",
        url="https://example.org/event",
        title="Community Event",
    )


@pytest.mark.asyncio
async def test_valid_bound_token_persists_versioned_snapshot_and_preserves_post_fields():
    snapshot = _snapshot()
    store = _PreviewStore(snapshot=snapshot)
    db = _RecordingDB()
    user = _user(tenant_id=uuid4())

    post = await BenderService(db, link_preview_store=store).create_post(
        BenderPostCreate(
            caption="  Join https://example.org/event  ",
            preview_token="draft-token",
            media_url="/uploads/photo.jpg",
            media_thumbnail_url="/uploads/thumb.jpg",
            media_type="image",
        ),
        user,
    )

    assert post.caption == "Join https://example.org/event"
    assert post.link_preview == snapshot.model_dump(mode="json")
    assert post.media_url == "/uploads/photo.jpg"
    assert post.media_thumbnail_url == "/uploads/thumb.jpg"
    assert post.media_type == "image"
    assert post.author_user_id == user.id
    assert post.tenant_id == user.tenant_id
    assert post.like_count == 0
    assert post.comment_count == 0
    assert db.flush_count == 1
    assert db.refresh_count == 1
    assert store.calls == [
        {
            "token": "draft-token",
            "user_id": user.id,
            "tenant_id": user.tenant_id,
            "caption": "Join https://example.org/event",
        }
    ]


@pytest.mark.asyncio
async def test_caption_is_trimmed_once_before_resolution_and_storage():
    store = _PreviewStore(snapshot=None)
    db = _RecordingDB()
    post = await BenderService(db, link_preview_store=store).create_post(
        BenderPostCreate(caption="  hello world  ", preview_token="token"),
        _user(),
    )
    assert post.caption == "hello world"
    assert store.calls[0]["caption"] == "hello world"


@pytest.mark.asyncio
@pytest.mark.parametrize("token", [None, "", "x" * 129])
async def test_missing_empty_or_overlong_token_creates_normal_post_without_store_call(token):
    store = _PreviewStore(snapshot=_snapshot())
    db = _RecordingDB()
    post = await BenderService(db, link_preview_store=store).create_post(
        BenderPostCreate(caption="hello", preview_token=token),
        _user(),
    )
    assert post.link_preview is None
    assert store.calls == []


@pytest.mark.asyncio
async def test_redis_error_fails_open_but_other_errors_are_not_swallowed():
    db = _RecordingDB()
    post = await BenderService(
        db, link_preview_store=_PreviewStore(error=RedisError("down"))
    ).create_post(BenderPostCreate(caption="hello", preview_token="token"), _user())
    assert post.link_preview is None

    with pytest.raises(RuntimeError, match="bug"):
        await BenderService(
            db, link_preview_store=_PreviewStore(error=RuntimeError("bug"))
        ).create_post(BenderPostCreate(caption="hello", preview_token="token"), _user())


def test_preview_token_has_no_pydantic_maximum_and_metadata_is_not_client_input():
    data = BenderPostCreate(
        caption="hello",
        preview_token="x" * 1000,
    )
    assert data.preview_token == "x" * 1000
    assert not hasattr(data, "link_preview")


def test_public_preview_block_omits_storage_version_and_rejects_legacy_invalid_data():
    stored = _snapshot().model_dump(mode="json")
    public = BenderService._preview_block(stored)
    assert public is not None
    assert public.model_dump() == {
        "source_url": "https://example.org/event",
        "url": "https://example.org/event",
        "title": "Community Event",
        "description": None,
        "site_name": None,
        "image_url": None,
    }
    assert "version" not in public.model_dump()
    assert BenderService._preview_block(None) is None
    assert BenderService._preview_block({"version": 2}) is None


@pytest.mark.parametrize("version", [None, True])
def test_public_preview_block_rejects_missing_or_non_strict_storage_version(version):
    stored = _snapshot().model_dump(mode="json")
    if version is None:
        stored.pop("version")
    else:
        stored["version"] = version
    assert BenderService._preview_block(stored) is None


@pytest.mark.parametrize("stored", [[], "bad", 1, True])
def test_public_preview_block_treats_non_object_storage_as_null(stored):
    assert BenderService._preview_block(stored) is None
