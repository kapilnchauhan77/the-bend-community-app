"""SSRF-resistant HTTP fetches for administrator-managed event sources."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from typing import Awaitable, Callable, Mapping, Sequence
from urllib.parse import urljoin, urlsplit, urlunsplit

import aiohttp

from app.services.external_urls import is_public_ip, normalize_external_url


Resolver = Callable[[str, int], Awaitable[Sequence[str]]]
Requester = Callable[[str, tuple[str, ...], int, float], Awaitable[object]]


def _canonical_address(value: object) -> str:
    raw = str(value)
    if "%" in raw:
        raise ValueError("Scoped IP addresses are not allowed")
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError as exc:
        raise ValueError("DNS returned an invalid IP address") from exc


@dataclass(frozen=True)
class FetchHop:
    status_code: int
    headers: Mapping[str, str]
    body: bytes
    peer_ip: str


@dataclass(frozen=True)
class SafeFetchResponse:
    status_code: int
    headers: Mapping[str, str]
    body: bytes
    url: str

    @property
    def text(self) -> str:
        content_type = self.headers.get("content-type", "")
        charset = "utf-8"
        for part in content_type.split(";")[1:]:
            key, separator, value = part.strip().partition("=")
            if separator and key.lower() == "charset":
                charset = value.strip().strip('"')[:64] or "utf-8"
                break
        try:
            return self.body.decode(charset, errors="replace")
        except LookupError:
            return self.body.decode("utf-8", errors="replace")

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise ValueError(f"Remote server returned HTTP {self.status_code}")


class _PinnedResolver(aiohttp.abc.AbstractResolver):
    def __init__(self, hostname: str, addresses: tuple[str, ...]):
        self.hostname = hostname
        self.addresses = addresses

    async def resolve(
        self,
        host: str,
        port: int = 0,
        family: socket.AddressFamily = socket.AF_INET,
    ):
        if host.rstrip(".").lower() != self.hostname:
            raise OSError("Unexpected host passed to pinned resolver")
        results = []
        for address in self.addresses:
            address_family = socket.AF_INET6 if ":" in address else socket.AF_INET
            results.append(
                {
                    "hostname": host,
                    "host": address,
                    "port": port,
                    "family": address_family,
                    "proto": socket.IPPROTO_TCP,
                    "flags": socket.AI_NUMERICHOST,
                }
            )
        return results

    async def close(self) -> None:
        return None


class _PeerRecordingConnector(aiohttp.TCPConnector):
    """Capture the peer before a small response can release its connection.

    This overrides an aiohttp connection seam, so pyproject intentionally locks
    aiohttp to the regression-tested 3.14 minor series.
    """

    def __init__(self, *args, expected_addresses: tuple[str, ...], **kwargs):
        super().__init__(*args, **kwargs)
        self.expected_addresses = expected_addresses
        self.peer_ip: str | None = None

    async def _wrap_create_connection(self, *args, **kwargs):
        transport, protocol = await super()._wrap_create_connection(*args, **kwargs)
        peer = transport.get_extra_info("peername")
        peer_ip = _canonical_address(peer[0]) if peer else ""
        if not is_public_ip(peer_ip) or peer_ip not in self.expected_addresses:
            transport.close()
            raise ValueError("Connected peer did not match the validated DNS result")
        self.peer_ip = peer_ip
        return transport, protocol


async def _resolve_host(host: str, port: int) -> list[str]:
    loop = asyncio.get_running_loop()
    answers = await loop.getaddrinfo(
        host,
        port,
        family=socket.AF_UNSPEC,
        type=socket.SOCK_STREAM,
        proto=socket.IPPROTO_TCP,
    )
    return list(dict.fromkeys(answer[4][0] for answer in answers))


class SafeExternalFetcher:
    def __init__(
        self,
        *,
        resolver: Resolver | None = None,
        requester: Requester | None = None,
        headers: Mapping[str, str] | None = None,
        max_redirects: int = 5,
        max_bytes: int = 5 * 1024 * 1024,
        timeout_seconds: float = 30.0,
    ):
        self.resolver = resolver or _resolve_host
        self.requester = requester or self._request_once
        self.headers = dict(headers or {})
        self.max_redirects = max_redirects
        self.max_bytes = max_bytes
        self.timeout_seconds = timeout_seconds

    async def fetch_text(self, url: str) -> SafeFetchResponse:
        try:
            async with asyncio.timeout(self.timeout_seconds):
                return await self._fetch_with_redirects(url)
        except TimeoutError as exc:
            raise ValueError("External source request timed out") from exc

    async def _fetch_with_redirects(self, url: str) -> SafeFetchResponse:
        current_url = self._fetchable_url(url)
        loop = asyncio.get_running_loop()
        deadline = loop.time() + self.timeout_seconds

        for redirect_index in range(self.max_redirects + 1):
            parsed = urlsplit(current_url)
            host = parsed.hostname
            if host is None:
                raise ValueError("URL host is required")
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            addresses = tuple(
                dict.fromkeys(
                    _canonical_address(address)
                    for address in await self.resolver(host, port)
                )
            )
            if not addresses or any(not is_public_ip(address) for address in addresses):
                raise ValueError("URL DNS result is not public")

            remaining = deadline - loop.time()
            if remaining <= 0:
                raise ValueError("External source request timed out")
            raw = await self.requester(
                current_url,
                addresses,
                self.max_bytes,
                remaining,
            )
            peer_ip = _canonical_address(raw.peer_ip)
            if not is_public_ip(peer_ip) or peer_ip not in addresses:
                raise ValueError(
                    "Connected peer did not match the validated DNS result"
                )

            headers = {
                str(key).lower(): str(value) for key, value in raw.headers.items()
            }
            body = bytes(raw.body)
            if len(body) > self.max_bytes:
                raise ValueError("External source response is too large")

            if raw.status_code in {301, 302, 303, 307, 308}:
                location = headers.get("location")
                if not location:
                    raise ValueError("Redirect response did not include a location")
                if redirect_index >= self.max_redirects:
                    raise ValueError("External source redirected too many times")
                current_url = self._fetchable_url(urljoin(current_url, location))
                continue

            return SafeFetchResponse(raw.status_code, headers, body, current_url)

        raise ValueError("External source redirected too many times")

    @staticmethod
    def _fetchable_url(url: str) -> str:
        normalized = normalize_external_url(url)
        parsed = urlsplit(normalized)
        return urlunsplit(parsed._replace(fragment=""))

    async def _request_once(
        self,
        url: str,
        resolved_ips: tuple[str, ...],
        max_bytes: int,
        timeout_seconds: float,
    ) -> FetchHop:
        parsed = urlsplit(url)
        hostname = parsed.hostname
        if hostname is None:
            raise ValueError("URL host is required")
        resolver = _PinnedResolver(hostname.rstrip(".").lower(), resolved_ips)
        connector = _PeerRecordingConnector(
            resolver=resolver,
            expected_addresses=resolved_ips,
            use_dns_cache=False,
            ttl_dns_cache=0,
            family=socket.AF_UNSPEC,
            limit=1,
            force_close=True,
        )
        timeout = aiohttp.ClientTimeout(
            total=timeout_seconds,
            connect=min(10.0, timeout_seconds),
            sock_read=min(15.0, timeout_seconds),
        )
        async with aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            trust_env=False,
            cookie_jar=aiohttp.DummyCookieJar(),
            auto_decompress=True,
            headers=self.headers,
        ) as session:
            async with session.get(url, allow_redirects=False) as response:
                if connector.peer_ip is None:
                    raise ValueError("Could not verify the connected peer")

                content_length = response.headers.get("content-length")
                if content_length is not None:
                    try:
                        declared_length = int(content_length)
                    except ValueError:
                        declared_length = None
                    if declared_length is not None and declared_length > max_bytes:
                        raise ValueError("External source response is too large")

                body = bytearray()
                async for chunk in response.content.iter_chunked(64 * 1024):
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise ValueError("External source response is too large")
                return FetchHop(
                    response.status,
                    dict(response.headers),
                    bytes(body),
                    connector.peer_ip,
                )
