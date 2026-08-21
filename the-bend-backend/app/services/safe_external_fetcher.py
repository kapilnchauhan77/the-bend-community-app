import asyncio
import ipaddress
import re
import socket
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncContextManager, Awaitable, Callable, Mapping, Protocol
from urllib.parse import urljoin

import aiohttp

from app.services.bender_link_urls import (
    LinkPreviewURLRejected,
    PreparedExternalUrl,
    prepare_external_url,
    resolve_public_addresses,
    socket_resolver,
    is_public_unicast,
)
from app.services.link_preview_errors import (
    LinkPreviewDeadlineExceeded,
    LinkPreviewResponseTooLarge,
    LinkPreviewUpstreamFailure,
)


HTML_LIMIT = 512 * 1024
IMAGE_LIMIT = 3 * 1024 * 1024
MAX_REDIRECTS = 3
USER_AGENT = "TheBendLinkPreview/1.0"

Resolver = Callable[[str, int], Awaitable[tuple[str, ...]]]


@dataclass(frozen=True)
class SafeFetchResponse:
    final_url: str
    body: bytes
    content_type: str


class ClientResponseLike(Protocol):
    status: int
    headers: Mapping[str, str]
    connection: object | None
    content: object


class SingleRequestSession(Protocol):
    def get(
        self,
        url: str,
        *,
        headers: Mapping[str, str],
        allow_redirects: bool,
        proxy: str | None,
    ) -> AsyncContextManager[ClientResponseLike]: ...


SessionFactory = Callable[
    [
        PreparedExternalUrl,
        tuple[ipaddress.IPv4Address | ipaddress.IPv6Address, ...],
    ],
    AsyncContextManager[SingleRequestSession],
]


class PinnedResolver(aiohttp.abc.AbstractResolver):
    def __init__(self, hostname: str, addresses: tuple[ipaddress.IPv4Address | ipaddress.IPv6Address, ...]):
        self.hostname = hostname
        self.addresses = addresses

    async def resolve(self, host: str, port: int = 0, family: int = socket.AF_UNSPEC):
        if host != self.hostname:
            raise OSError("unexpected resolver host")
        return [
            {
                "hostname": host,
                "host": str(address),
                "port": port,
                "family": socket.AF_INET6 if address.version == 6 else socket.AF_INET,
                "proto": 0,
                "flags": socket.AI_NUMERICHOST,
            }
            for address in self.addresses
        ]

    async def close(self) -> None:
        return None

class _PinnedTCPConnector(aiohttp.TCPConnector):
    def __init__(self, addresses, *args, **kwargs):
        self._pinned_addresses = set(addresses)
        super().__init__(*args, **kwargs)

    async def _create_connection(self, req, traces, timeout):
        protocol = await super()._create_connection(req, traces, timeout)
        transport = getattr(protocol, "transport", None)
        peer = transport.get_extra_info("peername") if transport is not None else None
        host = peer[0] if isinstance(peer, tuple) and peer else None
        try:
            address = ipaddress.ip_address(host)
        except (ValueError, TypeError):
            address = None
        if address is None or not is_public_unicast(address) or address not in self._pinned_addresses:
            protocol.close()
            raise aiohttp.ClientError("peer_mismatch")
        return protocol


@asynccontextmanager
async def aiohttp_session_factory(target: PreparedExternalUrl, addresses):
    connector = _PinnedTCPConnector(
        addresses,
        resolver=PinnedResolver(target.hostname, addresses),
        use_dns_cache=False,
        limit=1,
    )
    session = aiohttp.ClientSession(
        connector=connector,
        trust_env=False,
        auto_decompress=True,
        cookie_jar=aiohttp.DummyCookieJar(),
    )
    try:
        yield _AiohttpSession(session)
    finally:
        await session.close()


class _AiohttpSession:
    peer_validated_during_connect = True

    def __init__(self, session: aiohttp.ClientSession):
        self.session = session

    def get(self, url, *, headers, allow_redirects, proxy):
        return self.session.get(
            url,
            headers=headers,
            allow_redirects=allow_redirects,
            proxy=proxy,
        )


class SafeExternalFetcher:
    def __init__(
        self,
        resolver: Resolver = socket_resolver,
        clock: Callable[[], float] = time.monotonic,
        session_factory: SessionFactory = aiohttp_session_factory,
    ):
        self.resolver = resolver
        self.clock = clock
        self.session_factory = session_factory

    async def validate_destination(self, raw_url: str, *, deadline: float) -> PreparedExternalUrl:
        try:
            async with asyncio.timeout_at(deadline):
                target = prepare_external_url(raw_url)
                await resolve_public_addresses(target, self.resolver)
                return target
        except asyncio.TimeoutError as exc:
            raise LinkPreviewDeadlineExceeded("deadline_exceeded") from exc
        except LinkPreviewURLRejected:
            raise
        except (aiohttp.ClientError, OSError, ValueError) as exc:
            raise LinkPreviewUpstreamFailure("upstream_failure") from exc

    async def fetch_html(self, raw_url: str, *, deadline: float) -> SafeFetchResponse:
        return await self._fetch(raw_url, deadline=deadline, kind="html")

    async def fetch_image(self, raw_url: str, *, deadline: float) -> SafeFetchResponse:
        return await self._fetch(raw_url, deadline=deadline, kind="image")

    async def _fetch(self, raw_url: str, *, deadline: float, kind: str) -> SafeFetchResponse:
        limit = HTML_LIMIT if kind == "html" else IMAGE_LIMIT
        accept = "text/html, application/xhtml+xml" if kind == "html" else "image/jpeg, image/png, image/webp"
        current_url = raw_url
        seen: set[str] = set()
        redirects = 0
        try:
            async with asyncio.timeout_at(deadline):
                while True:
                    target = prepare_external_url(current_url)
                    addresses = await resolve_public_addresses(target, self.resolver)
                    if target.normalized_url in seen or redirects > MAX_REDIRECTS:
                        raise LinkPreviewUpstreamFailure("redirect_limit")
                    seen.add(target.normalized_url)
                    async with self.session_factory(target, addresses) as session:
                        async with session.get(
                            target.normalized_url,
                            headers={"User-Agent": USER_AGENT, "Accept": accept},
                            allow_redirects=False,
                            proxy=None,
                        ) as response:
                            if not getattr(session, "peer_validated_during_connect", False):
                                self._verify_peer(response, addresses)
                            if response.status in {301, 302, 303, 307, 308}:
                                if redirects >= MAX_REDIRECTS:
                                    raise LinkPreviewUpstreamFailure("redirect_limit")
                                location = response.headers.get("Location")
                                if not location:
                                    raise LinkPreviewUpstreamFailure("redirect_missing_location")
                                current_url = urljoin(target.normalized_url, location)
                                redirects += 1
                                continue
                            if response.status < 200 or response.status >= 300:
                                raise LinkPreviewUpstreamFailure("upstream_status")
                            content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
                            allowed = (
                                {"text/html", "application/xhtml+xml"}
                                if kind == "html"
                                else {"image/jpeg", "image/png", "image/webp"}
                            )
                            if content_type not in allowed:
                                raise LinkPreviewUpstreamFailure("invalid_content")
                            self._check_content_length(response.headers.get("Content-Length"), limit)
                            body = await self._read_body(response, limit)
                            return SafeFetchResponse(target.normalized_url, body, content_type)
        except (LinkPreviewURLRejected, LinkPreviewResponseTooLarge, LinkPreviewUpstreamFailure):
            raise
        except asyncio.TimeoutError as exc:
            raise LinkPreviewDeadlineExceeded("deadline_exceeded") from exc
        except (aiohttp.ClientError, OSError, ValueError) as exc:
            raise LinkPreviewUpstreamFailure("upstream_failure") from exc

    @staticmethod
    def _verify_peer(response: ClientResponseLike, addresses) -> None:
        connection = getattr(response, "connection", None)
        transport = getattr(connection, "transport", None)
        peer = transport.get_extra_info("peername") if transport is not None else None
        host = peer[0] if isinstance(peer, tuple) and peer else None
        try:
            peer_address = ipaddress.ip_address(host) if host is not None else None
        except ValueError:
            peer_address = None
        if peer_address is None or not is_public_unicast(peer_address) or peer_address not in addresses:
            raise LinkPreviewUpstreamFailure("peer_mismatch")

    @staticmethod
    def _check_content_length(value: str | None, limit: int) -> None:
        if value is None:
            return
        if not isinstance(value, str) or re.fullmatch(r"[0-9]+", value) is None:
            raise LinkPreviewResponseTooLarge("invalid_content_length")
        length = int(value, 10)
        if length < 0 or length > limit:
            raise LinkPreviewResponseTooLarge("response_too_large")

    @staticmethod
    async def _read_body(response: ClientResponseLike, limit: int) -> bytes:
        chunks: list[bytes] = []
        size = 0
        content = response.content
        iterator = content.iter_chunked(65536) if hasattr(content, "iter_chunked") else content
        async for chunk in iterator:
            size += len(chunk)
            if size > limit:
                raise LinkPreviewResponseTooLarge("response_too_large")
            chunks.append(chunk)
        return b"".join(chunks)


__all__ = [
    "ClientResponseLike",
    "PinnedResolver",
    "SafeExternalFetcher",
    "SafeFetchResponse",
    "SessionFactory",
    "SingleRequestSession",
    "aiohttp_session_factory",
]
