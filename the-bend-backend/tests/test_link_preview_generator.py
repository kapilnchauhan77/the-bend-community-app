import asyncio
import time
from dataclasses import dataclass

import pytest

from app.schemas.bender import LinkPreviewMetadata
from app.services.bender_link_urls import LinkPreviewURLRejected, PreparedExternalUrl
from app.services.link_preview_errors import (
    LinkPreviewDeadlineExceeded,
    LinkPreviewResponseTooLarge,
    LinkPreviewTitleMissing,
    LinkPreviewUpstreamFailure,
)
from app.services.link_preview_image_store import LinkPreviewImageProcessingError
from app.services.link_preview_metadata import ParsedLinkPreview
from app.services.safe_external_fetcher import SafeFetchResponse


PAGE_URL = "https://example.org/event"
CANONICAL_URL = "https://example.org/events/community"
IMAGE_URLS = tuple(f"https://cdn.example.org/{name}.jpg" for name in "abcd")
LOCAL_IMAGE = "/uploads/link-previews/" + "a" * 64 + ".webp"


@dataclass
class _FakeFetcher:
    page: SafeFetchResponse
    image_errors: dict[str, Exception] | None = None
    image_bodies: dict[str, bytes] | None = None
    canonical_error: Exception | None = None

    def __post_init__(self):
        self.deadlines = []
        self.calls = []

    async def fetch_html(self, url, *, deadline):
        self.calls.append(("html", url))
        self.deadlines.append(deadline)
        return self.page

    async def validate_destination(self, url, *, deadline):
        self.calls.append(("validate", url))
        self.deadlines.append(deadline)
        if self.canonical_error:
            raise self.canonical_error
        return PreparedExternalUrl(url, "example.org", 443, "https")

    async def fetch_image(self, url, *, deadline):
        self.calls.append(("image", url))
        self.deadlines.append(deadline)
        if self.image_errors and url in self.image_errors:
            raise self.image_errors[url]
        return SafeFetchResponse(url, (self.image_bodies or {}).get(url, b"image"), "image/jpeg")


class _FakeParser:
    def __init__(self, parsed):
        self.parsed = parsed
        self.calls = []
        self.deadlines = []

    def parse(self, body, *, final_url, deadline=None):
        self.calls.append((body, final_url))
        if deadline is not None:
            self.deadlines.append(deadline)
        return self.parsed


class _FakeStore:
    def __init__(self, result=LOCAL_IMAGE, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def store(self, body, *, deadline=None):
        self.calls.append((body, deadline))
        if self.error:
            raise self.error
        return self.result

    def touch(self, path):
        self.calls.append(("touch", path))
        return path == LOCAL_IMAGE


class _SleepingParser(_FakeParser):
    def parse(self, body, *, final_url, deadline=None):
        self.seen_deadline = deadline
        time.sleep(0.05)
        return super().parse(body, final_url=final_url, deadline=deadline)


def _generator(*, fetcher=None, parsed=None, store=None, clock=None, deadline_seconds=4.5):
    from app.services.link_preview_generator import BenderLinkPreviewGenerator

    return BenderLinkPreviewGenerator(
        fetcher or _FakeFetcher(SafeFetchResponse(PAGE_URL, b"html", "text/html")),
        _FakeParser(parsed or ParsedLinkPreview("Community Event", "Details", "Example", None, IMAGE_URLS)),
        store or _FakeStore(),
        clock=clock or time.monotonic,
        deadline_seconds=deadline_seconds,
    )


@pytest.mark.asyncio
async def test_invalid_overlong_destination_metadata_stops_before_image_fetch_or_store():
    store = _FakeStore()
    fetcher = _FakeFetcher(SafeFetchResponse(PAGE_URL, b"html", "text/html"))
    parser = _FakeParser(ParsedLinkPreview("Title", None, "Example", "https://example.org/" + "x" * 2100, ()))
    from app.services.link_preview_generator import BenderLinkPreviewGenerator
    generator = BenderLinkPreviewGenerator(fetcher, parser, store)
    generated = await generator.generate(PAGE_URL)
    assert generated.metadata.url == PAGE_URL
    assert [call[0] for call in fetcher.calls] == ["html", "validate"]
    assert not any(call[0] == "image" for call in fetcher.calls)
    assert store.calls == []


@pytest.mark.asyncio
async def test_invalid_text_metadata_stops_before_image_fetch_or_store():
    store = _FakeStore()
    fetcher = _FakeFetcher(SafeFetchResponse(PAGE_URL, b"html", "text/html"))
    parser = _FakeParser(ParsedLinkPreview("T" * 181, None, "Example", None, IMAGE_URLS))
    from app.services.link_preview_generator import BenderLinkPreviewGenerator
    with pytest.raises(LinkPreviewUpstreamFailure, match="invalid_metadata"):
        await BenderLinkPreviewGenerator(fetcher, parser, store).generate(PAGE_URL)
    assert not any(call[0] == "image" for call in fetcher.calls)
    assert store.calls == []


def test_normalize_request_url_uses_safe_external_url_policy():
    assert _generator().normalize_request_url("HTTPS://EXAMPLE.ORG:443/event#section") == PAGE_URL


@pytest.mark.asyncio
async def test_fetches_html_then_parses_and_uses_safe_canonical_without_fetching_it():
    parsed = ParsedLinkPreview("Title", "Description", "Example", CANONICAL_URL, ())
    fetcher = _FakeFetcher(SafeFetchResponse(PAGE_URL, b"html", "text/html"))
    parser = _FakeParser(parsed)
    from app.services.link_preview_generator import BenderLinkPreviewGenerator

    generated = await BenderLinkPreviewGenerator(fetcher, parser, _FakeStore()).generate(PAGE_URL)
    assert generated.metadata.url == CANONICAL_URL
    assert [kind for kind, _ in fetcher.calls] == ["html", "validate"]
    assert parser.calls == [(b"html", PAGE_URL)]


@pytest.mark.asyncio
async def test_unsafe_canonical_falls_back_to_fetched_final_url():
    parsed = ParsedLinkPreview("Title", None, "Example", "http://127.0.0.1/private", ())
    fetcher = _FakeFetcher(SafeFetchResponse("https://example.org/final", b"html", "text/html"), canonical_error=LinkPreviewURLRejected("destination_not_public"))
    generated = await _generator(fetcher=fetcher, parsed=parsed).generate(PAGE_URL)
    assert generated.metadata.url == "https://example.org/final"
    assert all(kind != "html" for kind, _ in fetcher.calls[1:])


@pytest.mark.asyncio
async def test_canonical_timeout_is_not_swallowed_into_fallback_success():
    parsed = ParsedLinkPreview("Title", None, "Example", CANONICAL_URL, ())
    fetcher = _FakeFetcher(
        SafeFetchResponse(PAGE_URL, b"html", "text/html"),
        canonical_error=LinkPreviewDeadlineExceeded("deadline_exceeded"),
    )
    with pytest.raises(LinkPreviewDeadlineExceeded):
        await _generator(fetcher=fetcher, parsed=parsed).generate(PAGE_URL)


@pytest.mark.asyncio
async def test_missing_title_raises_without_leaking_full_url():
    fetcher = _FakeFetcher(SafeFetchResponse("https://example.org/final?secret=1", b"html", "text/html"))
    parsed = ParsedLinkPreview(None, "Description", "Example", None, ())
    with pytest.raises(LinkPreviewTitleMissing) as error:
        await _generator(fetcher=fetcher, parsed=parsed).generate(PAGE_URL)
    assert error.value.reason == "title_missing"
    assert error.value.hostname == "example.org"
    assert "secret" not in str(error.value)


@pytest.mark.asyncio
async def test_first_successful_image_wins_and_returns_only_local_image_path():
    parsed = ParsedLinkPreview("Title", None, "Example", None, IMAGE_URLS[:2])
    fetcher = _FakeFetcher(SafeFetchResponse(PAGE_URL, b"html", "text/html"), image_errors={IMAGE_URLS[0]: LinkPreviewUpstreamFailure("upstream_failure")})
    generated = await _generator(fetcher=fetcher, parsed=parsed).generate(PAGE_URL)
    assert generated.metadata.image_url == LOCAL_IMAGE
    assert [kind for kind, _ in fetcher.calls] == ["html", "image", "image"]


@pytest.mark.asyncio
async def test_attempts_no_more_than_four_image_candidates():
    candidates = tuple(f"https://cdn.example.org/{i}.jpg" for i in range(8))
    parsed = ParsedLinkPreview("Title", None, "Example", None, candidates)
    fetcher = _FakeFetcher(SafeFetchResponse(PAGE_URL, b"html", "text/html"), image_errors={url: LinkPreviewUpstreamFailure("upstream_failure") for url in candidates})
    generated = await _generator(fetcher=fetcher, parsed=parsed).generate(PAGE_URL)
    assert generated.metadata.image_url is None
    assert [url for kind, url in fetcher.calls if kind == "image"] == list(candidates[:4])


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error", "secondary"),
    [
        (LinkPreviewURLRejected("destination_not_public"), "blocked_destination"),
        (LinkPreviewDeadlineExceeded("deadline_exceeded"), "timeout"),
        (LinkPreviewResponseTooLarge("response_too_large"), "oversized_response"),
        (LinkPreviewUpstreamFailure("invalid_content"), "invalid_content"),
    ],
)
async def test_image_only_failures_return_text_only_and_record_outcomes(error, secondary):
    parsed = ParsedLinkPreview("Title", "Description", "Example", None, (IMAGE_URLS[0],))
    fetcher = _FakeFetcher(SafeFetchResponse(PAGE_URL, b"html", "text/html"), image_errors={IMAGE_URLS[0]: error})
    generated = await _generator(fetcher=fetcher, parsed=parsed).generate(PAGE_URL)
    assert generated.metadata.image_url is None
    assert generated.outcomes == frozenset({"success", "image_processing_failure", secondary})


@pytest.mark.asyncio
async def test_image_store_processing_failure_is_text_only_at_store_stage():
    parsed = ParsedLinkPreview("Title", "Description", "Example", None, (IMAGE_URLS[0],))
    generated = await _generator(
        fetcher=_FakeFetcher(SafeFetchResponse(PAGE_URL, b"html", "text/html")),
        parsed=parsed,
        store=_FakeStore(error=LinkPreviewImageProcessingError("invalid_image")),
    ).generate(PAGE_URL)
    assert generated.metadata.image_url is None
    assert generated.outcomes == frozenset({"success", "image_processing_failure", "invalid_content"})


@pytest.mark.asyncio
async def test_image_store_oserror_is_text_only_and_invalid_content():
    parsed = ParsedLinkPreview("Title", "Description", "Example", None, (IMAGE_URLS[0],))
    generated = await _generator(
        fetcher=_FakeFetcher(SafeFetchResponse(PAGE_URL, b"html", "text/html")),
        parsed=parsed,
        store=_FakeStore(error=OSError("disk full")),
    ).generate(PAGE_URL)
    assert generated.metadata.image_url is None
    assert generated.outcomes == frozenset({"success", "image_processing_failure", "invalid_content"})


@pytest.mark.asyncio
async def test_invalid_remote_store_result_is_text_only():
    parsed = ParsedLinkPreview("Title", None, "Example", None, (IMAGE_URLS[0],))
    generated = await _generator(fetcher=_FakeFetcher(SafeFetchResponse(PAGE_URL, b"html", "text/html")), parsed=parsed, store=_FakeStore("https://cdn.example.org/stored.webp")).generate(PAGE_URL)
    assert generated.metadata.image_url is None
    assert "invalid_content" in generated.outcomes


@pytest.mark.asyncio
async def test_one_absolute_deadline_is_reused_by_all_dependencies():
    loop_clock = asyncio.get_running_loop().time
    clock = loop_clock
    fetcher = _FakeFetcher(SafeFetchResponse(PAGE_URL, b"html", "text/html"))
    parser = _FakeParser(ParsedLinkPreview("Title", None, "Example", CANONICAL_URL, (IMAGE_URLS[0],)))
    store = _FakeStore()
    generated = await _generator(fetcher=fetcher, parsed=parser.parsed, store=store, clock=clock).generate(PAGE_URL)
    assert generated.metadata.image_url == LOCAL_IMAGE
    expected_deadline = clock() + 4.5
    assert all(abs(deadline - expected_deadline) < 0.1 for deadline in fetcher.deadlines)
    assert all(abs(deadline - expected_deadline) < 0.1 for deadline in parser.deadlines)
    assert abs(store.calls[0][1] - expected_deadline) < 0.1


@pytest.mark.asyncio
async def test_page_deadline_is_not_converted_to_text_only():
    class SlowFetcher(_FakeFetcher):
        async def fetch_html(self, url, *, deadline):
            raise LinkPreviewDeadlineExceeded("deadline_exceeded")

    with pytest.raises(LinkPreviewDeadlineExceeded):
        await _generator(fetcher=SlowFetcher(SafeFetchResponse(PAGE_URL, b"", "text/html"))).generate(PAGE_URL)


@pytest.mark.asyncio
async def test_parser_timeout_uses_same_absolute_deadline_and_raises_typed_error():
    fetcher = _FakeFetcher(SafeFetchResponse(PAGE_URL, b"html", "text/html"))
    parser = _SleepingParser(ParsedLinkPreview("Title", None, "Example", None, ()))
    from app.services.link_preview_generator import BenderLinkPreviewGenerator

    loop_clock = asyncio.get_running_loop().time
    with pytest.raises(LinkPreviewDeadlineExceeded):
        await BenderLinkPreviewGenerator(
            fetcher,
            parser,
            _FakeStore(),
            clock=loop_clock,
            deadline_seconds=0.001,
        ).generate(PAGE_URL)
    assert fetcher.deadlines and parser.seen_deadline == fetcher.deadlines[0]


@pytest.mark.asyncio
async def test_touch_cached_image_has_no_work_for_none_and_uses_thread_for_path():
    store = _FakeStore()
    generator = _generator(store=store)
    assert await generator.touch_cached_image(None) is True
    assert store.calls == []
    assert await generator.touch_cached_image(LOCAL_IMAGE) is True
    assert store.calls == [("touch", LOCAL_IMAGE)]
    assert await generator.touch_cached_image("") is False
    assert store.calls[-1] == ("touch", "")
    assert await generator.touch_cached_image("/uploads/link-previews/" + "b" * 64 + ".webp") is False
