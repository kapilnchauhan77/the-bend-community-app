"""Caption URL extraction and outbound public-destination validation."""

import asyncio
import ipaddress
import re
import socket
from dataclasses import dataclass
from typing import Awaitable, Callable, Literal
from urllib.parse import SplitResult, urlsplit, urlunsplit

import idna


@dataclass(frozen=True)
class PreparedExternalUrl:
    normalized_url: str
    hostname: str
    port: int
    scheme: Literal["http", "https"]


class LinkPreviewURLRejected(ValueError):
    def __init__(self, reason: str, hostname: str | None = None):
        super().__init__(reason)
        self.reason = reason
        self.hostname = hostname


_URL_RE = re.compile(r"https?://[^\s<>\"'“”‘’]+", re.IGNORECASE)
_TRAILING_PUNCTUATION = ".,!?;:"
_NAT64_PREFIXES = (ipaddress.ip_network("64:ff9b::/96"), ipaddress.ip_network("64:ff9b:1::/48"))
MAX_EXTERNAL_URL_LENGTH = 2048

def is_public_unicast(address):
    if not address.is_global or address.is_multicast or address.is_private or address.is_reserved:
        return False
    if getattr(address, "is_link_local", False) or getattr(address, "is_loopback", False):
        return False
    if isinstance(address, ipaddress.IPv6Address):
        if address.scope_id or address.is_site_local or address.ipv4_mapped or any(address in network for network in _NAT64_PREFIXES):
            return False
        if address in ipaddress.ip_network("2002::/16") or address in ipaddress.ip_network("2001::/32"):
            return False
    return True


def _clean_token(token: str) -> str:
    token = token.rstrip(_TRAILING_PUNCTUATION + "’‘\"'“”")
    while token.endswith("]") and token.count("]") > token.count("["):
        token = token[:-1]
    while token.endswith("}") and token.count("}") > token.count("{"):
        token = token[:-1]
    while token.endswith(")") and token.count(")") > token.count("("):
        token = token[:-1]
    return token


def _caption_token_is_valid(token: str) -> bool:
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in token) or re.search(r"%(?![0-9A-Fa-f]{2})", token):
        return False
    try:
        parsed = urlsplit(token)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
            return False
        if parsed.username is not None or parsed.password is not None:
            return False
        parsed.port
    except (ValueError, UnicodeError):
        return False
    return True


def extract_http_urls(text: str | None) -> list[str]:
    """Return exact HTTP(S) caption tokens after sentence punctuation cleanup."""
    if not text:
        return []
    return [cleaned for match in _URL_RE.finditer(text) if (cleaned := _clean_token(match.group(0))) and _caption_token_is_valid(cleaned)]


def first_http_url(text: str | None) -> str | None:
    urls = extract_http_urls(text)
    return urls[0] if urls else None


def caption_contains_source_url(caption: str | None, source_url: str) -> bool:
    return first_http_url(caption) == source_url


def _reject(reason: str, hostname: str | None = None) -> None:
    raise LinkPreviewURLRejected(reason, hostname)


def _canonical_hostname(raw_hostname: str) -> tuple[str, ipaddress.IPv4Address | ipaddress.IPv6Address | None]:
    if not raw_hostname or raw_hostname.endswith("%"):
        _reject("invalid_hostname", raw_hostname or None)
    try:
        literal = ipaddress.ip_address(raw_hostname)
    except ValueError:
        literal = None
    if literal is not None:
        if str(literal) != raw_hostname or not is_public_unicast(literal):
            _reject("destination_not_public", raw_hostname)
        return str(literal), literal
    if "%" in raw_hostname:
        _reject("invalid_hostname", raw_hostname)
    try:
        mapped = idna.encode(raw_hostname, uts46=True, std3_rules=True).decode("ascii").lower().rstrip(".")
    except (idna.IDNAError, UnicodeError):
        _reject("invalid_hostname", raw_hostname)
    if not mapped or "." not in mapped or mapped == "localhost" or mapped.endswith(".localhost"):
        _reject("destination_not_public", mapped or raw_hostname)
    if re.fullmatch(r"(?:[0-9]+|0[xX][0-9a-fA-F]+)(?:\.(?:[0-9]+|0[xX][0-9a-fA-F]+))*", mapped):
        _reject("numeric_hostname", mapped)
    return mapped, None


def prepare_external_url(raw_url: str) -> PreparedExternalUrl:
    """Canonicalize one outbound URL without performing DNS or I/O."""
    if not isinstance(raw_url, str) or not raw_url or len(raw_url) > MAX_EXTERNAL_URL_LENGTH or any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in raw_url) or "\\" in raw_url:
        _reject("invalid_url")
    if re.search(r"%(?![0-9A-Fa-f]{2})", raw_url):
        _reject("invalid_escape")
    try:
        parsed = urlsplit(raw_url)
    except ValueError:
        _reject("invalid_url")
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"} or parsed.username is not None or parsed.password is not None:
        _reject("invalid_url")
    raw_netloc = parsed.netloc.rsplit("@", 1)[-1]
    if raw_netloc.startswith("["):
        if "]" not in raw_netloc:
            _reject("invalid_url")
        raw_hostname = raw_netloc[1 : raw_netloc.index("]")]
    else:
        raw_hostname = raw_netloc.split(":", 1)[0]
    try:
        input_port = parsed.port
    except ValueError:
        _reject("invalid_port")
    if not raw_hostname or "@" in parsed.netloc:
        _reject("invalid_url", raw_hostname)
    hostname, literal = _canonical_hostname(raw_hostname)
    default_port = 80 if scheme == "http" else 443
    port = default_port if input_port is None else input_port
    if port not in {80, 443}:
        _reject("invalid_port", hostname)
    if literal is not None:
        netloc_host = f"[{hostname}]" if literal.version == 6 else hostname
    else:
        netloc_host = hostname
    netloc = netloc_host if port == default_port else f"{netloc_host}:{port}"
    path = parsed.path or "/"
    normalized = urlunsplit(SplitResult(scheme, netloc, path, parsed.query, ""))
    return PreparedExternalUrl(normalized, hostname, port, scheme)  # type: ignore[arg-type]


Resolver = Callable[[str, int], Awaitable[tuple[str, ...]]]


async def socket_resolver(hostname: str, port: int) -> tuple[str, ...]:
    rows = await asyncio.to_thread(socket.getaddrinfo, hostname, port, type=socket.SOCK_STREAM)
    return tuple(dict.fromkeys(row[4][0] for row in rows))


async def resolve_public_addresses(
    target: PreparedExternalUrl,
    resolver: Resolver,
) -> tuple[ipaddress.IPv4Address | ipaddress.IPv6Address, ...]:
    raw_addresses = await resolver(target.hostname, target.port)
    try:
        addresses = tuple(ipaddress.ip_address(item) for item in raw_addresses)
    except ValueError:
        _reject("invalid_destination", target.hostname)
    if not addresses or any(not is_public_unicast(address) for address in addresses):
        _reject("destination_not_public", target.hostname)
    return addresses
