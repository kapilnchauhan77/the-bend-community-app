import io

import httpx
import pytest
from PIL import Image


def _jpeg_bytes() -> bytes:
    image = Image.new("RGB", (24, 16), (20, 80, 140))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


FLICKR_URL = (
    "https://www.flickr.com/photo_download.gne?id=123&secret=public-token&size=w"
)


def _cache_for_response(tmp_path, response_factory):
    from app.services.event_image_cache import EventImageCache

    return EventImageCache(
        upload_dir=tmp_path / "uploads",
        transport=httpx.MockTransport(response_factory),
    )


def test_only_approved_flickr_download_urls_are_cacheable():
    from app.services.event_image_cache import is_cacheable_event_image

    assert is_cacheable_event_image(
        "https://www.flickr.com/photo_download.gne?id=123&secret=public-token&size=w"
    )
    assert is_cacheable_event_image(
        "https://live.staticflickr.com/65535/52149177726_46d2fd7dd3.jpg"
    )
    assert not is_cacheable_event_image("http://www.flickr.com/photo_download.gne?id=123")
    assert not is_cacheable_event_image("https://www.flickr.com/other-path?id=123")
    assert not is_cacheable_event_image("https://127.0.0.1/photo_download.gne?id=123")
    assert not is_cacheable_event_image("https://images.example.org/event.jpg")
    assert not is_cacheable_event_image(
        "https://live.staticflickr.com.evil.example/65535/event.jpg"
    )
    assert not is_cacheable_event_image(
        "https://live.staticflickr.com/65535/event.svg"
    )


def test_oversized_chunk_is_rejected_before_it_is_buffered():
    from app.services.event_image_cache import (
        _MAX_EVENT_IMAGE_BYTES,
        _append_chunk_with_limit,
    )

    content = bytearray(b"already-buffered")

    accepted = _append_chunk_with_limit(
        content,
        b"x" * (_MAX_EVENT_IMAGE_BYTES + 1),
    )

    assert accepted is False
    assert content == b"already-buffered"


@pytest.mark.asyncio
async def test_caches_an_approved_flickr_image_once_in_local_uploads(tmp_path):
    from app.services.event_image_cache import EventImageCache

    requests = 0

    def serve_image(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        return httpx.Response(
            200,
            headers={"content-type": "image/jpeg"},
            content=_jpeg_bytes(),
            request=request,
        )

    cache = EventImageCache(
        upload_dir=tmp_path / "uploads",
        transport=httpx.MockTransport(serve_image),
    )

    first_url = await cache.cache(FLICKR_URL)
    second_url = await cache.cache(FLICKR_URL)

    assert first_url == second_url
    assert first_url is not None
    assert first_url.startswith("/uploads/images/event-")
    assert first_url.endswith(".jpg")
    assert (tmp_path / first_url.lstrip("/")).is_file()
    assert (
        tmp_path
        / first_url.replace("/uploads/", "uploads/").replace(".jpg", "_thumb.jpg")
    ).is_file()
    assert requests == 1


@pytest.mark.asyncio
async def test_cache_atomically_promotes_complete_image_files(tmp_path, monkeypatch):
    import os

    from app.services import event_image_cache

    replacements = []
    real_replace = os.replace

    def track_replace(source, destination):
        replacements.append((source, destination))
        assert source.name.endswith(".tmp")
        real_replace(source, destination)

    monkeypatch.setattr(event_image_cache.os, "replace", track_replace)

    def serve_image(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "image/jpeg"},
            content=_jpeg_bytes(),
            request=request,
        )

    cached_url = await _cache_for_response(tmp_path, serve_image).cache(FLICKR_URL)

    assert cached_url is not None
    assert len(replacements) == 2
    assert not list((tmp_path / "uploads" / "images").glob("*.tmp"))


@pytest.mark.asyncio
async def test_cache_rejects_a_non_image_response(tmp_path):
    def serve_html(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/html"},
            content=b"<html>not an image</html>",
            request=request,
        )

    cached_url = await _cache_for_response(tmp_path, serve_html).cache(FLICKR_URL)

    assert cached_url is None
    assert not (tmp_path / "uploads" / "images").exists()


@pytest.mark.asyncio
async def test_cache_rejects_an_oversized_response(tmp_path):
    def serve_large_image(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "image/jpeg"},
            content=b"x" * (5 * 1024 * 1024 + 1),
            request=request,
        )

    cached_url = await _cache_for_response(tmp_path, serve_large_image).cache(
        FLICKR_URL
    )

    assert cached_url is None
    assert not (tmp_path / "uploads" / "images").exists()


@pytest.mark.asyncio
async def test_cache_rejects_invalid_image_bytes(tmp_path):
    def serve_invalid_image(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "image/jpeg"},
            content=b"not really a jpeg",
            request=request,
        )

    cached_url = await _cache_for_response(tmp_path, serve_invalid_image).cache(
        FLICKR_URL
    )

    assert cached_url is None
    assert not (tmp_path / "uploads" / "images").exists()


@pytest.mark.asyncio
async def test_cache_treats_an_upstream_error_as_a_best_effort_miss(tmp_path):
    def serve_error(request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, request=request)

    cached_url = await _cache_for_response(tmp_path, serve_error).cache(FLICKR_URL)

    assert cached_url is None
    assert not (tmp_path / "uploads" / "images").exists()


@pytest.mark.asyncio
async def test_cache_does_not_follow_an_upstream_redirect(tmp_path):
    def redirect_to_internal_host(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            302,
            headers={"location": "http://127.0.0.1/latest/meta-data"},
            request=request,
        )

    cached_url = await _cache_for_response(
        tmp_path, redirect_to_internal_host
    ).cache(FLICKR_URL)

    assert cached_url is None
    assert not (tmp_path / "uploads" / "images").exists()


@pytest.mark.asyncio
async def test_cache_treats_a_storage_error_as_a_best_effort_miss(tmp_path):
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    (upload_dir / "images").write_text("not a directory")

    def serve_image(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "image/jpeg"},
            content=_jpeg_bytes(),
            request=request,
        )

    cached_url = await _cache_for_response(tmp_path, serve_image).cache(FLICKR_URL)

    assert cached_url is None
