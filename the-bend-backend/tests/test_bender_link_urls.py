import json
import ipaddress
from pathlib import Path

import pytest

from app.services.bender_link_urls import (
    LinkPreviewURLRejected,
    caption_contains_source_url,
    extract_http_urls,
    first_http_url,
    prepare_external_url,
    resolve_public_addresses,
)


FIXTURE = Path(__file__).parents[2] / "test-fixtures/bender-link-url-cases.json"


@pytest.mark.parametrize("case", json.loads(FIXTURE.read_text()))
def test_extracts_exact_caption_tokens(case):
    assert extract_http_urls(case["caption"]) == case["urls"]
    assert first_http_url(case["caption"]) == (case["urls"][0] if case["urls"] else None)
    assert caption_contains_source_url(case["caption"], case["urls"][0] if case["urls"] else "https://missing.example") is bool(case["urls"])


@pytest.mark.parametrize(
    "url",
    [
        "https://user:pass@example.org/",
        "https://example.org:bad/",
        "https://example.org:0/",
        "https://example.org:65536/",
        "https://example.org/a b",
        "https://example.org/a\\b",
        "https://example.org/\n",
        "https://localhost/",
        "https://api.localhost/",
        "https://example/",
        "https://127.0.0.1/",
        "https://192.0.2.1/",
        "https://169.254.1.1/",
        "https://100.64.0.1/",
        "https://198.51.100.1/",
        "https://203.0.113.1/",
        "https://[::1]/",
        "https://[fe80::1]/",
        "https://[2001:db8::1]/",
        "https://[fe80::1%25en0]/",
        "https://2130706433/",
        "https://0177.0.0.1/",
        "https://0x7f000001/",
        "https://127.1/",
        "https://１２７。０。０。１/",
        "https://１２７.０.０.１/",
        "https://0x7f.0.0.1/",
        "https://0x7f.0x0.0x0.0x1/",
        "https://example.org/%zz",
        "https://example.org/%1",
        "https://example.org/%gg",
        "https://example.org:8080/path",
        "https://[2606:2800:220:1:248:1893:25C8:1946]/",
    ],
)
def test_rejects_unsafe_external_urls(url):
    with pytest.raises(LinkPreviewURLRejected):
        prepare_external_url(url)


def test_canonicalizes_idna_default_port_fragment_and_path():
    result = prepare_external_url("HTTPS://BÜCHER.Example.:443#fragment")
    assert result.normalized_url == "https://xn--bcher-kva.example/"
    assert result.hostname == "xn--bcher-kva.example"
    assert result.port == 443
    assert result.scheme == "https"


def test_accepts_only_scheme_default_ports():
    assert prepare_external_url("http://Example.org:80/path").normalized_url == "http://example.org/path"
    assert prepare_external_url("https://Example.org:443/path").normalized_url == "https://example.org/path"


def test_accepts_canonical_global_ipv6_literal():
    result = prepare_external_url("https://[2606:2800:220:1:248:1893:25c8:1946]/")
    assert result.hostname == "2606:2800:220:1:248:1893:25c8:1946"
    assert result.normalized_url == "https://[2606:2800:220:1:248:1893:25c8:1946]/"


@pytest.mark.asyncio
async def test_resolve_public_addresses_rejects_mixed_results():
    target = prepare_external_url("https://example.org")

    async def resolver(_hostname, _port):
        return ("93.184.216.34", "192.0.2.1")

    with pytest.raises(LinkPreviewURLRejected, match="destination_not_public"):
        await resolve_public_addresses(target, resolver)


@pytest.mark.asyncio
async def test_resolve_public_addresses_deduplicates_and_returns_ip_objects():
    target = prepare_external_url("https://example.org")

    async def resolver(_hostname, _port):
        return ("93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946", "93.184.216.34")

    assert await resolve_public_addresses(target, resolver) == (
        ipaddress.ip_address("93.184.216.34"),
        ipaddress.ip_address("2606:2800:220:1:248:1893:25c8:1946"),
        ipaddress.ip_address("93.184.216.34"),
    )
