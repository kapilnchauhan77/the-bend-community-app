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

    def zremrangebyscore(self, key, minimum, maximum):
        self.commands.append(("zremrangebyscore", key, minimum, maximum))
        return self

    def zadd(self, key, values):
        self.commands.append(("zadd", key, values))
        return self

    def zcard(self, key):
        self.commands.append(("zcard", key))
        return self

    async def execute(self):
        results = []
        for command in self.commands:
            if command[0] == "incr":
                await self.redis.incr(command[1])
                results.append(1)
            elif command[0] == "expire":
                await self.redis.expire(command[1], command[2])
                results.append(True)
            elif command[0] == "zcard":
                results.append(1)
            else:
                results.append(0)
        return results


class _FakeRedis:
    def __init__(self):
        self.data = {}
        self.ttls = {}
        self.expires_at = {}
        self.now = 0
        self.calls = []

    async def get(self, key):
        self.calls.append(("get", key))
        if key in self.expires_at and self.expires_at[key] <= self.now:
            self.data.pop(key, None)
            self.expires_at.pop(key, None)
        return self.data.get(key)

    async def setex(self, key, ttl, value):
        self.calls.append(("setex", key, ttl, value))
        self.data[key] = value
        self.ttls[key] = ttl
        self.expires_at[key] = self.now + ttl

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
        self.expires_at[key] = self.now + seconds

    def pipeline(self, transaction=True):
        self.calls.append(("pipeline", transaction))
        return _FakePipeline(self)

    def values(self):
        return tuple(self.data.values())

    def advance(self, seconds):
        self.now += seconds


class _FailingRedis:
    async def get(self, key):
        raise RuntimeError("redis unavailable")


class _FailureRedis(_FakeRedis):
    def __init__(self, failure):
        super().__init__()
        self.failure = failure

    async def setex(self, key, ttl, value):
        if self.failure == "setex":
            raise RuntimeError("setex failed")
        return await super().setex(key, ttl, value)

    async def delete(self, key):
        if self.failure == "delete":
            raise RuntimeError("delete failed")
        return await super().delete(key)

    async def scan_iter(self, match=None):
        if self.failure == "scan":
            raise RuntimeError("scan failed")
        async for key in super().scan_iter(match):
            yield key

    def pipeline(self, transaction=True):
        if self.failure == "pipeline":
            raise RuntimeError("pipeline failed")
        return _FailingPipeline(self, self.failure)


class _FailingPipeline(_FakePipeline):
    def __init__(self, redis, failure):
        super().__init__(redis)
        self.failure = failure

    async def execute(self):
        if self.failure == "execute":
            raise RuntimeError("execute failed")
        return await super().execute()


class _NoPipelineFailureRedis(_FakeRedis):
    def __init__(self, failure):
        super().__init__()
        self.failure = failure

    def pipeline(self, transaction=True):
        return None

    async def incr(self, key):
        if self.failure == "incr":
            raise RuntimeError("incr failed")
        return await super().incr(key)

    async def expire(self, key, seconds):
        if self.failure == "expire":
            raise RuntimeError("expire failed")
        return await super().expire(key, seconds)


class _DisappearingRedis(_FakeRedis):
    async def get(self, key):
        self.calls.append(("get", key))
        return None


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
    assert await store.resolve_draft(token, user_id=user_id, tenant_id=tenant_id, caption='See https://example.org/start” and https://other.example') == _snapshot()
    assert await store.resolve_draft(token, user_id=user_id, tenant_id=tenant_id, caption=None) is None


@pytest.mark.asyncio
async def test_generation_budget_uses_one_atomic_sliding_window_pipeline():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    assert await store.reserve_generation(user_id=uuid4()) is True
    pipeline_calls = [call for call in redis.calls if call[0] == "pipeline"]
    assert pipeline_calls == [("pipeline", True)]


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
async def test_missing_or_expired_draft_is_a_miss_without_delete():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    user_id = uuid4()
    tenant_id = uuid4()
    token = await store.issue_draft(_snapshot(), user_id=user_id, tenant_id=tenant_id)
    assert await store.resolve_draft(
        token,
        user_id=user_id,
        tenant_id=tenant_id,
        caption="https://example.org/start",
    ) == _snapshot()
    redis.advance(store.ttl_seconds)
    assert await store.resolve_draft(
        token,
        user_id=user_id,
        tenant_id=tenant_id,
        caption="https://example.org/start",
    ) is None
    assert not any(call[0] == "delete" for call in redis.calls)


@pytest.mark.asyncio
async def test_deep_bounded_cache_json_is_deleted_as_a_corrupt_miss():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    key = store.CACHE_PREFIX + hashlib.sha256(b"https://example.org/deep").hexdigest()
    redis.data[key] = '{"a":' * 10000 + '{}' + '}' * 10000
    assert len(redis.data[key].encode()) < store.MAX_RAW_JSON_BYTES
    assert await store.get_cached_metadata("https://example.org/deep") is None
    assert ("delete", key) in redis.calls


@pytest.mark.asyncio
async def test_deep_bounded_cache_json_is_ignored_by_live_image_scan():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    redis.data[store.CACHE_PREFIX + "deep"] = '{"a":' * 10000 + '{}' + '}' * 10000
    assert await store.live_image_urls() == set()


@pytest.mark.asyncio
async def test_non_utf8_tokens_return_none_before_redis_work():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    assert await store.resolve_draft("\ud800", user_id=uuid4(), tenant_id=None, caption="https://example.org/start") is None
    assert redis.calls == []


@pytest.mark.asyncio
async def test_source_url_mismatch_inside_strict_draft_is_deleted():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    token = "source-mismatch"
    key = store.DRAFT_PREFIX + hashlib.sha256(token.encode()).hexdigest()
    snapshot = _snapshot("https://example.org/start")
    redis.data[key] = json.dumps({
        "user_id": str(UUID(int=1)),
        "tenant_id": None,
        "source_url": "https://example.org/other",
        "created_at": datetime.now(UTC).isoformat(),
        "preview": snapshot.model_dump(),
    })
    assert await store.resolve_draft(token, user_id=UUID(int=1), tenant_id=None, caption="https://example.org/start") is None
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
async def test_live_image_urls_ignores_oversized_invalid_utf8_and_lone_surrogate_records():
    redis = _FakeRedis()
    store = BenderLinkPreviewStore(redis)
    redis.data[store.CACHE_PREFIX + "oversized"] = b"{" + b"x" * (store.MAX_RAW_JSON_BYTES + 1)
    redis.data[store.CACHE_PREFIX + "bytes"] = b"\xff\xfe"
    redis.data[store.DRAFT_PREFIX + "surrogate"] = '{"metadata":"\ud800"}'
    assert await store.live_image_urls() == set()


@pytest.mark.asyncio
async def test_live_image_urls_tolerates_key_disappearing_between_scan_and_get():
    assert await BenderLinkPreviewStore(_DisappearingRedis()).live_image_urls() == set()


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


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["setex"])
async def test_cache_write_failure_escapes(failure):
    redis = _FailureRedis(failure)
    store = BenderLinkPreviewStore(redis)
    with pytest.raises(RuntimeError, match=failure):
        await store.cache_metadata("https://example.org", _metadata())


@pytest.mark.asyncio
async def test_draft_write_failure_escapes():
    redis = _FailureRedis("setex")
    store = BenderLinkPreviewStore(redis)
    with pytest.raises(RuntimeError, match="setex"):
        await store.issue_draft(_snapshot(), user_id=uuid4(), tenant_id=None)


@pytest.mark.asyncio
async def test_corrupt_record_delete_failure_escapes():
    redis = _FailureRedis("delete")
    store = BenderLinkPreviewStore(redis)
    key = store.CACHE_PREFIX + hashlib.sha256(b"https://example.org").hexdigest()
    redis.data[key] = b"\xff"
    with pytest.raises(RuntimeError, match="delete failed"):
        await store.get_cached_metadata("https://example.org")


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["scan"])
async def test_scan_failure_escapes(failure):
    with pytest.raises(RuntimeError, match=failure):
        await BenderLinkPreviewStore(_FailureRedis(failure)).live_image_urls()


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["pipeline", "execute"])
async def test_pipeline_failures_escape(failure):
    with pytest.raises(RuntimeError, match=failure):
        await BenderLinkPreviewStore(_FailureRedis(failure)).record_outcome("success")


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["incr", "expire"])
async def test_counter_command_failures_escape(failure):
    with pytest.raises(RuntimeError, match=failure):
        await BenderLinkPreviewStore(_NoPipelineFailureRedis(failure)).record_outcome("success")
