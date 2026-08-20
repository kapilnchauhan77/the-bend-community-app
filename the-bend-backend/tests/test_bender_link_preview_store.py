import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from app.schemas.bender import (
    BenderLinkPreviewSnapshot,
    LinkPreviewMetadata,
)
from app.services.bender_link_preview_store import BenderLinkPreviewStore


class _FakePipeline:
    def __init__(self, redis):
        self.redis = redis
        self.commands = []

    def incr(self, key):
        self.commands.append(("incr", key))
        return self

    def expire(self, key, seconds):
        self.commands.append(("expire", key, seconds))
        return self

    async def execute(self):
        for command in self.commands:
            if command[0] == "incr":
                await self.redis.incr(command[1])
            else:
                await self.redis.expire(command[1], command[2])


class _FakeRedis:
    def __init__(self):
        self.data = {}
        self.ttls = {}
        self.calls = []

    async def get(self, key):
        self.calls.append(("get", key))
        return self.data.get(key)

    async def setex(self, key, ttl, value):
        self.calls.append(("setex", key, ttl, value))
        self.data[key] = value
        self.ttls[key] = ttl

    async def delete(self, key):
        self.calls.append(("delete", key))
        self.data.pop(key, None)

    async def scan_iter(self, match=None):
        self.calls.append(("scan_iter", match))
        for key in tuple(self.data):
            if match is None or key.startswith(match.removesuffix("*")):
                yield key

    async def incr(self, key):
        self.calls.append(("incr", key))
        self.data[key] = str(int(self.data.get(key, "0")) + 1)

    async def expire(self, key, seconds):
        self.calls.append(("expire", key, seconds))
        self.ttls[key] = seconds

    def pipeline(self, transaction=True):
        self.calls.append(("pipeline", transaction))
        return _FakePipeline(self)

    def values(self):
        return tuple(self.data.values())


class _FailingRedis:
    async def get(self, key):
        raise RuntimeError("redis unavailable")


def _metadata(image_url="/uploads/link-previews/" + "a" * 64 + ".webp"):
    return LinkPreviewMetadata(
        url="https://example.org/final",
        title="Example title",
        description="Description",
        site_name="Example",
        image_url=image_url,
    )


def _snapshot(source_url="https://example.org/start"):
    return BenderLinkPreviewSnapshot(
        source_url=source_url,
        url="https://example.org/final",
        title="Example title",
        description="Description",
        site_name="Example",
        image_url="/uploads/link-previews/" + "b" * 64 + ".webp",
    )


@pytest.mark.asyncio
async def test_cache_uses_hashed_aliases_and_exact_ttl_without_source_data():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    await store.cache_metadata("https://example.org/start", _metadata(), final_url="https://example.org/final")
    keys = [call[1] for call in redis.calls if call[0] == "setex"]
    assert len(keys) == 2
    assert all(key.startswith(store.CACHE_PREFIX) for key in keys)
    assert all(key.removeprefix(store.CACHE_PREFIX) == hashlib.sha256(value.encode()).hexdigest() for key, value in zip(keys, ("https://example.org/start", "https://example.org/final")))
    assert all("example.org" not in key for key in keys)
    assert all(redis.ttls[key] == 1200 for key in keys)
    assert all("source_url" not in value and "start" not in value for value in redis.values())


@pytest.mark.asyncio
async def test_cache_alias_same_url_is_deduplicated_and_hit_rejects_invalid_records():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    await store.cache_metadata("https://example.org/final", _metadata(), final_url="https://example.org/final")
    assert len([call for call in redis.calls if call[0] == "setex"]) == 1
    key = store.CACHE_PREFIX + hashlib.sha256(b"https://example.org/final").hexdigest()
    assert await store.get_cached_metadata("https://example.org/final") == _metadata()
    redis.data[key] = "{" + "x" * 50000
    assert await store.get_cached_metadata("https://example.org/final") is None
    assert ("delete", key) in redis.calls


@pytest.mark.asyncio
async def test_cache_accepts_bytes_and_deletes_stale_version_or_unknown_fields():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    key = store.CACHE_PREFIX + hashlib.sha256(b"https://example.org/final").hexdigest()
    redis.data[key] = json.dumps({"version": 1, "metadata": _metadata().model_dump()}).encode()
    assert await store.get_cached_metadata("https://example.org/final") == _metadata()
    redis.data[key] = json.dumps({"version": 2, "metadata": _metadata().model_dump()})
    assert await store.get_cached_metadata("https://example.org/final") is None
    redis.data[key] = json.dumps({"version": 1, "metadata": _metadata().model_dump(), "extra": True})
    assert await store.get_cached_metadata("https://example.org/final") is None


@pytest.mark.asyncio
async def test_issue_draft_generates_random_hashed_token_and_exact_ttl():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    user_id = uuid4()
    token_one = await store.issue_draft(_snapshot(), user_id=user_id, tenant_id=None)
    token_two = await store.issue_draft(_snapshot(), user_id=user_id, tenant_id=None)
    assert token_one != token_two
    assert len(token_one) <= 128
    keys = [call[1] for call in redis.calls if call[0] == "setex"]
    assert keys[0] == store.DRAFT_PREFIX + hashlib.sha256(token_one.encode()).hexdigest()
    assert all(token_one not in value and token_two not in value for value in redis.values())
    assert all(redis.ttls[key] == 1200 for key in keys)


@pytest.mark.asyncio
async def test_resolve_draft_binds_user_nullable_tenant_and_exact_first_caption_url():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    user_id, other_user, tenant_id = uuid4(), uuid4(), uuid4()
    token = await store.issue_draft(_snapshot(), user_id=user_id, tenant_id=tenant_id)
    assert await store.resolve_draft(token, user_id=user_id, tenant_id=tenant_id, caption="See https://example.org/start") == _snapshot()
    assert await store.resolve_draft(token, user_id=other_user, tenant_id=tenant_id, caption="See https://example.org/start") is None
    assert await store.resolve_draft(token, user_id=user_id, tenant_id=None, caption="See https://example.org/start") is None
    assert await store.resolve_draft(token, user_id=user_id, tenant_id=tenant_id, caption="See https://example.org/other") is None
    assert await store.resolve_draft(token, user_id=user_id, tenant_id=tenant_id, caption="See https://example.org/start.") == _snapshot()
    assert await store.resolve_draft(token, user_id=user_id, tenant_id=tenant_id, caption=None) is None


@pytest.mark.asyncio
async def test_overlong_token_returns_none_before_hashing_or_redis_work():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    assert await store.resolve_draft("x" * 129, user_id=uuid4(), tenant_id=None, caption="https://example.org/start") is None
    assert redis.calls == []


@pytest.mark.asyncio
async def test_resolve_invalid_draft_deletes_corrupt_value_and_returns_none():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    token = "raw-token"
    key = store.DRAFT_PREFIX + hashlib.sha256(token.encode()).hexdigest()
    redis.data[key] = json.dumps({"user_id": str(uuid4()), "tenant_id": None, "source_url": "https://example.org/start", "created_at": "not-date", "preview": {}})
    assert await store.resolve_draft(token, user_id=uuid4(), tenant_id=None, caption="https://example.org/start") is None
    assert ("delete", key) in redis.calls


@pytest.mark.asyncio
async def test_live_image_urls_scans_both_prefixes_and_returns_only_strict_paths():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    redis.data[store.CACHE_PREFIX + "one"] = json.dumps({"version": 1, "metadata": _metadata().model_dump()})
    redis.data[store.CACHE_PREFIX + "bad"] = json.dumps({"version": 1, "metadata": {"url": "https://example.org", "title": "bad", "unknown": 1}})
    token = await store.issue_draft(_snapshot(), user_id=uuid4(), tenant_id=None)
    assert await store.live_image_urls() == {_metadata().image_url, _snapshot().image_url}
    assert token not in (await store.live_image_urls())


@pytest.mark.asyncio
async def test_record_outcome_allowlist_and_eight_day_ttl():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    await store.record_outcome("success")
    key = next(call[1] for call in redis.calls if call[0] == "incr")
    assert key.startswith("bender:link-preview:metric:")
    assert key.endswith(":success")
    assert redis.ttls[key] == 8 * 24 * 60 * 60
    with pytest.raises(ValueError):
        await store.record_outcome("unknown")


@pytest.mark.asyncio
async def test_redis_failures_escape_unchanged():
    with pytest.raises(RuntimeError, match="redis unavailable"):
        await BenderLinkPreviewStore(_FailingRedis()).get_cached_metadata("https://example.org")
