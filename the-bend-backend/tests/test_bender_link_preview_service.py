from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.schemas.bender import BenderLinkPreviewSnapshot, LinkPreviewMetadata
from app.services.bender_link_preview_service import BenderLinkPreviewService
from app.services.link_preview_errors import (
    LinkPreviewDeadlineExceeded,
    LinkPreviewResponseTooLarge,
    LinkPreviewTitleMissing,
    LinkPreviewUpstreamFailure,
)
from app.services.bender_link_urls import LinkPreviewURLRejected


SOURCE = "https://example.org/event"


def _metadata(image_url="/uploads/link-previews/" + "a" * 64 + ".webp"):
    return LinkPreviewMetadata(url=SOURCE, title="Event", image_url=image_url)


class FakeStore:
    def __init__(self, cached=None):
        self.cached = cached
        self.calls = []
        self.outcomes = []
        self.tokens = []

    async def get_cached_metadata(self, url):
        self.calls.append(("get", url))
        return self.cached

    async def cache_metadata(self, url, metadata, *, final_url=None):
        self.calls.append(("cache", url, metadata, final_url))

    async def issue_draft(self, snapshot, *, user_id, tenant_id):
        self.calls.append(("draft", snapshot, user_id, tenant_id))
        token = f"token-{len(self.tokens)}"
        self.tokens.append(token)
        return token

    async def record_outcome(self, outcome):
        self.outcomes.append(outcome)


class FakeGenerator:
    def __init__(self, generated=None, cached_image=True, error=None):
        self.generated = generated
        self.cached_image = cached_image
        self.error = error
        self.calls = []

    def normalize_request_url(self, url):
        self.calls.append(("normalize", url))
        return "normalized:" + url

    async def touch_cached_image(self, image_url):
        self.calls.append(("touch", image_url))
        return self.cached_image

    async def generate(self, url):
        self.calls.append(("generate", url))
        if self.error:
            raise self.error
        return self.generated


def _generated():
    from app.services.link_preview_generator import GeneratedLinkPreview

    return GeneratedLinkPreview(_metadata(), "normalized:" + SOURCE, "https://example.org/final", frozenset({"success", "image_processing_failure"}))


@pytest.mark.asyncio
async def test_length_guard_runs_before_normalization_and_generator():
    store = FakeStore()
    generator = FakeGenerator(generated=_generated())
    service = BenderLinkPreviewService(store, generator)

    for value in ("", "x" * 2049):
        with pytest.raises(LinkPreviewURLRejected):
            await service.create_preview(value, user_id=uuid4(), tenant_id=None)
    assert generator.calls == []
    assert store.calls == []


@pytest.mark.asyncio
async def test_cache_miss_caches_fresh_source_and_records_success_after_draft():
    store = FakeStore()
    generator = FakeGenerator(generated=_generated())
    service = BenderLinkPreviewService(store, generator)
    user_id, tenant_id = uuid4(), uuid4()

    result = await service.create_preview("  " + SOURCE + "  ", user_id=user_id, tenant_id=tenant_id)

    assert result.preview_token == "token-0"
    assert result.preview.source_url == SOURCE
    assert store.calls[1][0] == "cache"
    assert store.calls[1][3] == "https://example.org/final"
    assert store.calls[2][0] == "draft"
    assert store.calls[2][1].source_url == SOURCE
    assert store.outcomes == ["image_processing_failure", "success"]


@pytest.mark.asyncio
async def test_cache_hit_touches_image_and_issues_fresh_draft_each_time():
    cached = _metadata()
    store = FakeStore(cached=cached)
    generator = FakeGenerator(generated=_generated())
    service = BenderLinkPreviewService(store, generator)

    first = await service.create_preview(SOURCE, user_id=uuid4(), tenant_id=None)
    second = await service.create_preview(SOURCE, user_id=uuid4(), tenant_id=None)

    assert first.preview_token != second.preview_token
    assert [call[0] for call in generator.calls] == ["normalize", "touch", "normalize", "touch"]
    assert generator.calls[2][0] == "normalize"
    assert store.outcomes == ["cache_hit", "success", "cache_hit", "success"]


@pytest.mark.asyncio
async def test_stale_cached_image_regenerates_without_cache_hit():
    store = FakeStore(cached=_metadata())
    generator = FakeGenerator(generated=_generated(), cached_image=False)
    service = BenderLinkPreviewService(store, generator)

    await service.create_preview(SOURCE, user_id=uuid4(), tenant_id=None)

    assert any(call[0] == "generate" for call in generator.calls)
    assert "cache_hit" not in store.outcomes


@pytest.mark.parametrize(
    ("error", "outcome"),
    [
        (LinkPreviewURLRejected("x"), "blocked_destination"),
        (LinkPreviewResponseTooLarge("x"), "oversized_response"),
        (LinkPreviewDeadlineExceeded("x"), "timeout"),
        (LinkPreviewTitleMissing("x"), "invalid_content"),
        (LinkPreviewUpstreamFailure("x"), "invalid_content"),
    ],
)
@pytest.mark.asyncio
async def test_typed_generation_failures_record_bounded_mapping_and_reraise(error, outcome):
    store = FakeStore()
    generator = FakeGenerator(error=error)
    service = BenderLinkPreviewService(store, generator)

    with pytest.raises(type(error)):
        await service.create_preview(SOURCE, user_id=uuid4(), tenant_id=None)
    assert store.outcomes == [outcome]
