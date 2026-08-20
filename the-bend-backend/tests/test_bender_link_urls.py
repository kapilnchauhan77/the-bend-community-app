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


def test_preserves_non_default_port():
    result = prepare_external_url("http://Example.org:8080/path")
    assert result.normalized_url == "http://example.org:8080/path"
    assert result.port == 8080


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
