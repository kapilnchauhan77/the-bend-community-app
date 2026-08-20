import asyncio
import ipaddress
import os
import time
from contextlib import asynccontextmanager

import pytest

from app.services.bender_link_urls import LinkPreviewURLRejected
from app.services.link_preview_errors import (
    LinkPreviewDeadlineExceeded,
    LinkPreviewResponseTooLarge,
    LinkPreviewUpstreamFailure,
)
from app.services.safe_external_fetcher import SafeExternalFetcher, aiohttp_session_factory
from app.services.bender_link_urls import prepare_external_url


PUBLIC = "93.184.216.34"


class _Resolver:
    def __init__(self, *addresses):
        self.addresses = addresses
        self.calls = []

    async def __call__(self, hostname, port):
        self.calls.append((hostname, port))
        return self.addresses


class _ResolverForHosts:
    def __init__(self, answers):
        self.answers = answers
        self.calls = []

    async def __call__(self, hostname, port):
        self.calls.append((hostname, port))
        return self.answers[hostname]


class _ChangingResolver:
    def __init__(self, answers):
        self.answers = iter(answers)

    async def __call__(self, _hostname, _port):
        return next(self.answers)


class _PeerTransport:
    def __init__(self, peer):
        self.peer = peer

    def get_extra_info(self, name):
        return self.peer if name == "peername" else None


class _Connection:
    def __init__(self, peer=PUBLIC):
        self.transport = _PeerTransport((peer, 443)) if peer is not None else None


class _Content:
    def __init__(self, chunks, delay=0):
        self.chunks = chunks
        self.delay = delay

    def __aiter__(self):
        return self._iterate()

    async def _iterate(self):
        for chunk in self.chunks:
            if self.delay:
                await asyncio.sleep(self.delay)
            yield chunk


class _FakeResponse:
    def __init__(self, *, status=200, content_type="text/html", chunks=(b"<title>ok</title>",), location=None, content_length=None, peer=PUBLIC, delay=0):
        self.status = status
        self.headers = {"Content-Type": content_type}
        if location is not None:
            self.headers["Location"] = location
        if content_length is not None:
            self.headers["Content-Length"] = content_length
        self.connection = _Connection(peer)
        self.content = _Content(chunks, delay)


class _ResponseContext:
    def __init__(self, response):
        self.response = response

    async def __aenter__(self):
        return self.response

    async def __aexit__(self, *exc_info):
        return False


class _Session:
    def __init__(self, response, calls):
        self.response = response
        self.calls = calls

    def get(self, url, *, headers, allow_redirects, proxy):
        self.calls.append((url, headers, allow_redirects, proxy))
        return _ResponseContext(self.response)


class _SessionFactory:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    @asynccontextmanager
    async def __call__(self, target, addresses):
        response = self.responses.pop(0)
        session = _Session(response, self.calls)
        yield session


def _fetcher_for(*responses, resolver=None):
    factory = _SessionFactory(list(responses))
    return SafeExternalFetcher(resolver=resolver or _Resolver(PUBLIC), session_factory=factory), factory


@pytest.mark.asyncio
async def test_mixed_public_and_private_dns_answers_are_rejected():
    fetcher, _ = _fetcher_for(_FakeResponse(), resolver=_Resolver(PUBLIC, "127.0.0.1"))
    with pytest.raises(LinkPreviewURLRejected):
        await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)


@pytest.mark.asyncio
async def test_dns_failure_maps_to_typed_generic_error_without_hostname():
    async def failing_resolver(_hostname, _port):
        raise OSError("resolver failed for example.org")

    fetcher = SafeExternalFetcher(resolver=failing_resolver)
    with pytest.raises(LinkPreviewUpstreamFailure) as error:
        await fetcher.validate_destination("https://example.org/private?token=secret", deadline=time.monotonic() + 1)
    assert error.value.reason == "upstream_failure"
    assert "example.org" not in str(error.value)
    assert "secret" not in str(error.value)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    ["https://127.0.0.1/", "ftp://example.org/", "https://example.org:444/"],
)
async def test_validate_destination_preserves_url_policy_rejection(url):
    fetcher = SafeExternalFetcher(resolver=_Resolver("93.184.216.34"))
    with pytest.raises(LinkPreviewURLRejected):
        await fetcher.validate_destination(url, deadline=time.monotonic() + 1)


@pytest.mark.asyncio
async def test_redirect_destination_is_resolved_and_validated_again():
    resolver = _ResolverForHosts({"example.org": (PUBLIC,), "internal.test": ("10.0.0.2",)})
    factory = _SessionFactory([_FakeResponse(status=302, location="http://internal.test/private")])
    fetcher = SafeExternalFetcher(resolver=resolver, session_factory=factory)
    with pytest.raises(LinkPreviewURLRejected):
        await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)
    assert [host for host, _ in resolver.calls] == ["example.org", "internal.test"]


@pytest.mark.asyncio
async def test_changed_dns_answer_between_hops_is_rejected():
    resolver = _ChangingResolver([(PUBLIC,), ("10.0.0.2",)])
    factory = _SessionFactory([_FakeResponse(status=302, location="/next")])
    fetcher = SafeExternalFetcher(resolver=resolver, session_factory=factory)
    with pytest.raises(LinkPreviewURLRejected):
        await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)


@pytest.mark.asyncio
async def test_redirect_statuses_and_relative_locations_are_followed():
    for status in (301, 302, 303, 307, 308):
        resolver = _Resolver(PUBLIC)
        factory = _SessionFactory([_FakeResponse(status=status, location="/next"), _FakeResponse()])
        fetcher = SafeExternalFetcher(resolver=resolver, session_factory=factory)
        response = await fetcher.fetch_html("https://example.org/start", deadline=time.monotonic() + 1)
        assert response.body == b"<title>ok</title>"
        assert [call[0] for call in factory.calls] == ["https://example.org/start", "https://example.org/next"]


@pytest.mark.asyncio
async def test_redirect_loop_and_fourth_redirect_are_rejected():
    loop_factory = _SessionFactory([_FakeResponse(status=302, location="/same")] * 4)
    fetcher = SafeExternalFetcher(resolver=_Resolver(PUBLIC), session_factory=loop_factory)
    with pytest.raises(LinkPreviewUpstreamFailure):
        await fetcher.fetch_html("https://example.org/same", deadline=time.monotonic() + 1)

    fourth_factory = _SessionFactory([_FakeResponse(status=302, location=f"/hop-{i}") for i in range(4)])
    fetcher = SafeExternalFetcher(resolver=_Resolver(PUBLIC), session_factory=fourth_factory)
    with pytest.raises(LinkPreviewUpstreamFailure):
        await fetcher.fetch_html("https://example.org/start", deadline=time.monotonic() + 1)


@pytest.mark.asyncio
async def test_peer_must_match_validated_address_and_missing_peer_fails_closed():
    for peer in ("93.184.216.35", None):
        fetcher, _ = _fetcher_for(_FakeResponse(peer=peer))
        with pytest.raises(LinkPreviewUpstreamFailure):
            await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)


@pytest.mark.asyncio
async def test_decoded_body_cannot_exceed_html_limit():
    response = _FakeResponse(content_type="text/html", chunks=(b"x" * 524288, b"y"))
    fetcher, _ = _fetcher_for(response)
    with pytest.raises(LinkPreviewResponseTooLarge):
        await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)


@pytest.mark.asyncio
async def test_gzip_expansion_is_limited_after_decoding():
    response = _FakeResponse(content_type="text/html", chunks=(b"x" * 524289,))
    response.headers["Content-Encoding"] = "gzip"
    fetcher, _ = _fetcher_for(response)
    with pytest.raises(LinkPreviewResponseTooLarge):
        await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)


@pytest.mark.asyncio
async def test_image_limit_and_mime_allowlist():
    fetcher, _ = _fetcher_for(_FakeResponse(content_type="image/jpeg", chunks=(b"x" * (3 * 1024 * 1024 + 1),)))
    with pytest.raises(LinkPreviewResponseTooLarge):
        await fetcher.fetch_image("https://example.org/a.jpg", deadline=time.monotonic() + 1)

    fetcher, _ = _fetcher_for(_FakeResponse(content_type="image/gif"))
    with pytest.raises(LinkPreviewUpstreamFailure):
        await fetcher.fetch_image("https://example.org/a.gif", deadline=time.monotonic() + 1)


@pytest.mark.asyncio
async def test_content_length_is_rejected_before_streaming():
    for content_length in ("not-a-number", "524289", "+1", " 1", "1 ", "1_0", "１２３"):
        response = _FakeResponse(content_length=content_length)
        fetcher, _ = _fetcher_for(response)
        with pytest.raises(LinkPreviewResponseTooLarge):
            await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)


@pytest.mark.asyncio
async def test_production_session_factory_builds_isolated_pinned_session(monkeypatch):
    created = {}

    class FakeConnector:
        def __init__(self, **kwargs):
            created["connector"] = kwargs

    class FakeSession:
        def __init__(self, **kwargs):
            created["session"] = kwargs
            created["session_object"] = self

        async def close(self):
            created["closed"] = True

    import app.services.safe_external_fetcher as fetcher_module

    monkeypatch.setattr(fetcher_module.aiohttp, "TCPConnector", FakeConnector)
    monkeypatch.setattr(fetcher_module.aiohttp, "ClientSession", FakeSession)
    target = prepare_external_url("https://example.org/")
    addresses = (ipaddress.ip_address(PUBLIC),)
    async with aiohttp_session_factory(target, addresses) as session:
        assert session.session is created["session_object"]
    assert created["connector"]["use_dns_cache"] is False
    assert created["connector"]["limit"] == 1
    assert isinstance(created["connector"]["resolver"], fetcher_module.PinnedResolver)
    assert created["session"]["trust_env"] is False
    assert created["session"]["auto_decompress"] is True
    assert isinstance(created["session"]["cookie_jar"], fetcher_module.aiohttp.DummyCookieJar)
    assert created["closed"] is True


@pytest.mark.asyncio
async def test_page_mime_allowlist():
    for content_type in ("application/json", "image/png", "text/plain"):
        fetcher, _ = _fetcher_for(_FakeResponse(content_type=content_type))
        with pytest.raises(LinkPreviewUpstreamFailure):
            await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)
    fetcher, _ = _fetcher_for(_FakeResponse(content_type="application/xhtml+xml"))
    assert (await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)).content_type == "application/xhtml+xml"


@pytest.mark.asyncio
async def test_request_disables_proxy_and_redirects_and_uses_fixed_headers():
    old = os.environ.get("HTTPS_PROXY")
    os.environ["HTTPS_PROXY"] = "http://attacker.invalid:8080"
    try:
        fetcher, factory = _fetcher_for(_FakeResponse())
        await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 1)
    finally:
        if old is None:
            os.environ.pop("HTTPS_PROXY", None)
        else:
            os.environ["HTTPS_PROXY"] = old
    _, headers, allow_redirects, proxy = factory.calls[0]
    assert allow_redirects is False
    assert proxy is None
    assert headers["User-Agent"]
    assert "text/html" in headers["Accept"]


@pytest.mark.asyncio
async def test_one_absolute_deadline_covers_streaming():
    response = _FakeResponse(delay=0.05)
    fetcher, _ = _fetcher_for(response)
    with pytest.raises(LinkPreviewDeadlineExceeded):
        await fetcher.fetch_html("https://example.org/", deadline=time.monotonic() + 0.01)


@pytest.mark.asyncio
async def test_upstream_failures_do_not_include_url():
    response = _FakeResponse(status=500)
    fetcher, _ = _fetcher_for(response)
    with pytest.raises(LinkPreviewUpstreamFailure) as error:
        await fetcher.fetch_html("https://example.org/private?token=secret", deadline=time.monotonic() + 1)
    assert "example.org" not in str(error.value)
    assert "secret" not in str(error.value)
