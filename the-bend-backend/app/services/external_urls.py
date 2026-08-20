"""Validation and normalization for untrusted external HTTP URLs."""

from __future__ import annotations

import hashlib
import ipaddress
import re
import socket
from urllib.parse import SplitResult, urlsplit, urlunsplit


_ALLOWED_SCHEMES = {"http", "https"}
_ALLOWED_PORTS = {80, 443}
_MAX_STORED_URL_LENGTH = 500
_EVENT_KEY_FRAGMENT_RE = re.compile(r"event-[0-9a-f]{32}")
_BLOCKED_HOSTS = {
    "localhost",
    "localhost.localdomain",
    "metadata",
    "metadata.google.internal",
}
_BLOCKED_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
    ".lan",
    ".home",
    ".corp",
    ".onion",
)


def _canonical_ip(host: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        pass

    # The operating system accepts abbreviated, decimal, octal, and hexadecimal
    # IPv4 forms. Treat those as numeric disguises rather than DNS names.
    try:
        packed = socket.inet_aton(host)
    except OSError:
        return None
    disguised = ipaddress.ip_address(packed)
    if host != str(disguised):
        raise ValueError("Numeric IP address disguises are not allowed")
    return disguised


def is_public_ip(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        return False
    if (
        address.is_multicast
        or address.is_reserved
        or address.is_unspecified
        or address.is_loopback
        or address.is_link_local
        or address.is_private
    ):
        return False
    return address.is_global


def normalize_external_url(value: str) -> str:
    """Return a canonical public HTTP(S) URL or raise ``ValueError``."""
    if not isinstance(value, str):
        raise ValueError("URL must be text")
    raw = value.strip()
    if not raw or len(raw) > _MAX_STORED_URL_LENGTH:
        raise ValueError("URL is empty or too long")
    if "\\" in raw:
        raise ValueError("URL contains an ambiguous path separator")
    if any(character.isspace() or ord(character) < 32 for character in raw):
        raise ValueError("URL contains whitespace or control characters")

    try:
        parsed = urlsplit(raw)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("URL is malformed") from exc

    scheme = parsed.scheme.lower()
    if scheme not in _ALLOWED_SCHEMES:
        raise ValueError("Only HTTP and HTTPS URLs are allowed")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("URL credentials are not allowed")
    if port is not None and port not in _ALLOWED_PORTS:
        raise ValueError("URL port is not allowed")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL host is required")
    hostname = hostname.rstrip(".").lower()
    if not hostname or "%" in hostname:
        raise ValueError("URL host is malformed")
    try:
        ascii_host = hostname.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise ValueError("URL host is malformed") from exc

    if ascii_host in _BLOCKED_HOSTS or ascii_host.endswith(_BLOCKED_SUFFIXES):
        raise ValueError("URL host is not public")

    address = _canonical_ip(ascii_host)
    if address is not None and not is_public_ip(str(address)):
        raise ValueError("URL address is not public")

    display_host = f"[{ascii_host}]" if ":" in ascii_host else ascii_host
    default_port = 443 if scheme == "https" else 80
    netloc = display_host if port in (None, default_port) else f"{display_host}:{port}"
    path = parsed.path or "/"
    normalized = SplitResult(scheme, netloc, path, parsed.query, parsed.fragment)
    return urlunsplit(normalized)


def deterministic_source_url(
    feed_url: str,
    candidate_url: str | None,
    identity: str,
) -> str:
    """Build a safe, stable storage key for one imported source entry."""
    source_url = feed_url
    if candidate_url:
        try:
            source_url = normalize_external_url(candidate_url)
        except ValueError:
            pass

    return identity_namespaced_url(source_url, identity)


def sanitize_imported_source_url(feed_url: str, candidate_url: str | None) -> str:
    """Keep a safe parser key unchanged or replace an unsafe one deterministically."""
    if candidate_url:
        try:
            return normalize_external_url(candidate_url)
        except ValueError:
            pass
    return identity_namespaced_url(feed_url, candidate_url or "")


def legacy_source_url(source_url: str) -> str | None:
    """Return the plain URL used before imported keys gained event fragments."""
    parsed_source = urlsplit(source_url)
    if not _EVENT_KEY_FRAGMENT_RE.fullmatch(parsed_source.fragment):
        return None
    return urlunsplit(parsed_source._replace(fragment=""))


def identity_namespaced_url(source_url: str, identity: str) -> str:
    """Namespace a safe URL by identity without exceeding its DB column."""
    normalized_source = normalize_external_url(source_url)
    parsed_source = urlsplit(normalized_source)
    anchor_base = urlunsplit(parsed_source._replace(fragment=""))
    digest = hashlib.sha256(identity.encode("utf-8", errors="replace")).hexdigest()[:32]
    fragment = f"#event-{digest}"
    if len(anchor_base) + len(fragment) <= _MAX_STORED_URL_LENGTH:
        return f"{anchor_base}{fragment}"

    origin = urlunsplit((parsed_source.scheme, parsed_source.netloc, "/", "", ""))
    if len(origin) + len(fragment) > _MAX_STORED_URL_LENGTH:
        raise ValueError("URL host is too long")
    return f"{origin}{fragment}"
