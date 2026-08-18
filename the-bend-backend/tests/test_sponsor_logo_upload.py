import io
import types

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from PIL import Image

from app.api.deps import get_db
from app.api.v1.upload import router as upload_router
from app.core.exceptions import AppException
from app.core.permissions import get_current_user
from app.models.enums import UserRole
import app.services.file_service as file_service_module


MAX_SPONSOR_LOGO_BYTES = 5 * 1024 * 1024


def _image_bytes(format_name: str, mode: str = "RGB") -> bytes:
    color = (20, 80, 140, 64) if mode == "RGBA" else (20, 80, 140)
    image = Image.new(mode, (12, 8), color)
    buffer = io.BytesIO()
    image.save(buffer, format=format_name)
    return buffer.getvalue()


def _transparent_png_bytes(mode: str) -> bytes:
    if mode == "RGB":
        color = (20, 80, 140)
        transparency = color
    else:
        color = 20
        transparency = color

    image = Image.new(mode, (12, 8), color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", transparency=transparency)
    return buffer.getvalue()


def _highly_compressed_oversized_image() -> bytes:
    image = Image.new("1", (5000, 5000), 0)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def _test_app(role: UserRole | None) -> FastAPI:
    app = FastAPI()

    @app.exception_handler(AppException)
    async def app_exception_handler(_request, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    async def no_database():
        yield None

    app.dependency_overrides[get_db] = no_database
    if role is not None:
        async def current_user():
            return types.SimpleNamespace(role=role)

        app.dependency_overrides[get_current_user] = current_user

    app.include_router(upload_router, prefix="/api/v1")
    return app


@pytest.fixture(autouse=True)
def isolated_uploads(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    (upload_dir / "images").mkdir(parents=True)
    monkeypatch.setattr(file_service_module, "UPLOAD_DIR", upload_dir)
    return upload_dir


def _post_logo(client: TestClient, content: bytes, content_type: str):
    return client.post(
        "/api/v1/upload/sponsor-logo",
        files={"file": ("logo", content, content_type)},
    )


def test_sponsor_logo_upload_requires_authentication():
    with TestClient(_test_app(role=None)) as client:
        response = _post_logo(client, _image_bytes("PNG"), "image/png")

    assert response.status_code == 401


def test_sponsor_logo_upload_rejects_non_admin():
    with TestClient(_test_app(role=UserRole.INDIVIDUAL)) as client:
        response = _post_logo(client, _image_bytes("PNG"), "image/png")

    assert response.status_code == 403


@pytest.mark.parametrize(
    ("format_name", "content_type"),
    [
        ("JPEG", "image/jpeg"),
        ("PNG", "image/png"),
        ("WEBP", "image/webp"),
    ],
)
def test_sponsor_logo_upload_accepts_supported_images(
    format_name: str,
    content_type: str,
    isolated_uploads,
):
    with TestClient(_test_app(role=UserRole.COMMUNITY_ADMIN)) as client:
        response = _post_logo(client, _image_bytes(format_name), content_type)

    assert response.status_code == 200
    assert set(response.json()) == {"logo_url"}
    logo_url = response.json()["logo_url"]
    assert logo_url.startswith("/uploads/images/")

    stored_path = isolated_uploads / logo_url.removeprefix("/uploads/")
    thumbnail_path = stored_path.with_name(f"{stored_path.stem}_thumb{stored_path.suffix}")
    assert stored_path.is_file()
    assert thumbnail_path.is_file()
    with Image.open(stored_path) as stored:
        stored.verify()


def test_sponsor_logo_upload_preserves_png_transparency(isolated_uploads):
    with TestClient(_test_app(role=UserRole.COMMUNITY_ADMIN)) as client:
        response = _post_logo(client, _image_bytes("PNG", mode="RGBA"), "image/png")

    assert response.status_code == 200
    logo_url = response.json()["logo_url"]
    assert logo_url.endswith(".png")
    stored_path = isolated_uploads / logo_url.removeprefix("/uploads/")
    with Image.open(stored_path) as stored:
        assert stored.mode == "RGBA"
        assert stored.getpixel((0, 0))[3] == 64


@pytest.mark.parametrize("mode", ["RGB", "L"])
def test_sponsor_logo_upload_preserves_png_trns_transparency(mode: str, isolated_uploads):
    with TestClient(_test_app(role=UserRole.COMMUNITY_ADMIN)) as client:
        response = _post_logo(client, _transparent_png_bytes(mode), "image/png")

    assert response.status_code == 200
    logo_url = response.json()["logo_url"]
    assert logo_url.endswith(".png")
    stored_path = isolated_uploads / logo_url.removeprefix("/uploads/")
    with Image.open(stored_path).convert("RGBA") as stored:
        assert stored.getpixel((0, 0))[3] == 0


@pytest.mark.parametrize(
    ("payload", "content_type"),
    [
        (_image_bytes("GIF"), "image/gif"),
        (b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", "image/svg+xml"),
    ],
)
def test_sponsor_logo_upload_rejects_unsupported_declared_mime(payload: bytes, content_type: str):
    with TestClient(_test_app(role=UserRole.COMMUNITY_ADMIN)) as client:
        response = _post_logo(client, payload, content_type)

    assert response.status_code == 415


@pytest.mark.parametrize(
    "payload",
    [
        b"not an image",
        _image_bytes("GIF"),
        b"<svg xmlns='http://www.w3.org/2000/svg'></svg>",
        _image_bytes("JPEG"),
    ],
)
def test_sponsor_logo_upload_rejects_invalid_or_spoofed_image_bytes(payload: bytes):
    with TestClient(_test_app(role=UserRole.COMMUNITY_ADMIN)) as client:
        response = _post_logo(client, payload, "image/png")

    assert response.status_code == 422


def test_sponsor_logo_upload_rejects_truncated_image_that_cannot_decode():
    truncated_jpeg = _image_bytes("JPEG")[:-5]

    with TestClient(
        _test_app(role=UserRole.COMMUNITY_ADMIN),
        raise_server_exceptions=False,
    ) as client:
        response = _post_logo(client, truncated_jpeg, "image/jpeg")

    assert response.status_code == 422


def test_sponsor_logo_upload_rejects_files_over_five_megabytes():
    oversized = b"x" * (MAX_SPONSOR_LOGO_BYTES + 1)

    with TestClient(_test_app(role=UserRole.COMMUNITY_ADMIN)) as client:
        response = _post_logo(client, oversized, "image/png")

    assert response.status_code == 413


def test_sponsor_logo_upload_rejects_highly_compressed_oversized_dimensions(isolated_uploads):
    payload = _highly_compressed_oversized_image()
    assert len(payload) < MAX_SPONSOR_LOGO_BYTES

    with TestClient(_test_app(role=UserRole.COMMUNITY_ADMIN)) as client:
        response = _post_logo(client, payload, "image/png")

    assert response.status_code == 422
    assert list((isolated_uploads / "images").iterdir()) == []
