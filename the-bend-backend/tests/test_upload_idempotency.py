"""ASGI contract matrix for idempotent upload endpoints."""
from __future__ import annotations

import asyncio
import io
import sys
from dataclasses import dataclass, field
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI, HTTPException, Request, UploadFile
from PIL import Image

from app.api.deps import get_db
from app.api.v1.upload import router as upload_router
from app.core.permissions import get_current_user
from app.services import upload_idempotency_service as replay_module
from app.services.upload_idempotency_service import UploadIdempotencyService

KEY = "00000000-0000-4000-8000-000000000123"
CLIENT_ID = "00000000-0000-4000-8000-000000000456"
PAYLOAD = b"never-put-uploaded-bytes-in-redis"


class MemoryRedis:
    def __init__(self): self.values, self.fail_set_once = {}, False
    async def get(self, key): return self.values.get(key)
    async def set(self, key, value, *, ex=None, nx=False):
        if self.fail_set_once and '"state": "complete"' in value:
            self.fail_set_once = False; raise ConnectionError("redis completion unavailable")
        if nx and key in self.values: return False
        self.values[key] = value; return True
    async def delete(self, key): self.values.pop(key, None)


@dataclass
class Storage:
    calls: int = 0
    identities: set[str] = field(default_factory=set)
    fail_once: bool = False
    async def image(self, files, storage_key):
        self.calls += 1
        if self.fail_once:
            self.fail_once = False; raise RuntimeError("image processing failed")
        self.identities.add(f"image:{storage_key}:0")
        return [{"id": "stored", "url": "/uploads/images/stored.jpg", "thumbnail_url": "/uploads/images/stored_thumb.jpg"}]
    async def private(self, file, user_id, storage_key):
        self.calls += 1; self.identities.add(f"avatar:{user_id}:{storage_key}")
        return {"id": "avatar", "url": "/uploads/users/avatar.jpg", "thumbnail_url": "/uploads/users/avatar_thumb.jpg"}
    async def video(self, file, storage_key):
        self.calls += 1; self.identities.add(f"video:{storage_key}")
        return {"url": "/uploads/videos/stored.mp4", "thumbnail_url": "/uploads/videos/stored.jpg", "duration_ms": 100}
    async def audio(self, file, storage_key):
        self.calls += 1; self.identities.add(f"audio:{storage_key}")
        return {"url": "/uploads/audio/stored.webm", "duration_ms": 100}


class FakeDb:
    def add(self, _row): pass
    async def flush(self): pass
    async def execute(self, _statement): return SimpleNamespace(scalar_one_or_none=lambda: None)


@pytest.fixture
def matrix(monkeypatch):
    from app.api.v1 import upload as upload_module
    redis, storage = MemoryRedis(), Storage()
    tenant_id, user_id, public_tenant = uuid4(), uuid4(), uuid4()
    user = SimpleNamespace(id=user_id, tenant_id=tenant_id, shop_id=None, avatar_url=None)
    app = FastAPI()
    @app.middleware("http")
    async def trusted_tenant(request: Request, call_next):
        # Simulates middleware-resolved state and deliberately ignores the header.
        request.state.tenant = SimpleNamespace(id=public_tenant)
        return await call_next(request)
    app.include_router(upload_router, prefix="/api/v1")
    async def override_user(): return user
    async def override_db(): yield FakeDb()
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[get_db] = override_db
    async def get_memory_redis(): return redis
    monkeypatch.setattr(replay_module, "get_redis", get_memory_redis)
    monkeypatch.setattr(upload_module, "idempotency", UploadIdempotencyService())
    class Files:
        async def upload_images(self, files, storage_key=None): return await storage.image(files, storage_key)
        async def upload_private_user_image(self, file, user_id, storage_key=None): return await storage.private(file, user_id, storage_key)
        async def upload_video(self, file, storage_key=None): return await storage.video(file, storage_key)
        async def upload_audio(self, file, storage_key=None): return await storage.audio(file, storage_key)
    files = Files()
    monkeypatch.setattr(upload_module, "file_service", files)
    monkeypatch.setattr(upload_module, "FileService", lambda: files)
    return SimpleNamespace(app=app, redis=redis, storage=storage, tenant_id=tenant_id,
                           user_id=user_id, public_tenant=public_tenant)


def request_parts(endpoint):
    item = ("one.jpg", PAYLOAD, "image/jpeg")
    return {"files": [("files", item)]} if endpoint == "/upload/images" else {"files": {"file": item}}

def headers(endpoint, key=KEY, client_id=CLIENT_ID):
    values = {"Idempotency-Key": key, "X-Tenant-Slug": "forged-tenant"}
    if endpoint == "/upload/photo": values["X-Anonymous-Client-ID"] = client_id
    return values

async def post(subject, endpoint, *, key=KEY, client_id=CLIENT_ID):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=subject.app, raise_app_exceptions=False), base_url="http://test") as client:
        return await client.post("/api/v1" + endpoint, headers=headers(endpoint, key, client_id), **request_parts(endpoint))


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint,expected", [
    ("/upload/images", {"images": [{"id": "stored", "url": "/uploads/images/stored.jpg", "thumbnail_url": "/uploads/images/stored_thumb.jpg"}]}),
    ("/upload/photo", {"photo_url": "/uploads/images/stored.jpg"}),
    ("/upload/avatar", {"avatar_url": "/uploads/users/avatar.jpg"}),
    ("/upload/media", {"url": "/uploads/images/stored.jpg", "thumbnail_url": "/uploads/images/stored_thumb.jpg", "type": "image"}),
])
async def test_each_endpoint_completes_once_and_replays_exact_json(matrix, endpoint, expected):
    first, replay = await post(matrix, endpoint), await post(matrix, endpoint)
    assert first.status_code == replay.status_code == 200
    assert first.json() == replay.json() == expected
    assert matrix.storage.calls == 1
    assert PAYLOAD.decode() not in "".join(matrix.redis.values.values())


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ["/upload/images", "/upload/photo", "/upload/avatar", "/upload/media"])
async def test_each_endpoint_returns_409_without_storage_for_active_claim(matrix, endpoint):
    owner = await UploadIdempotencyService().claim(
        matrix.public_tenant if endpoint == "/upload/photo" else matrix.tenant_id,
        CLIENT_ID if endpoint == "/upload/photo" else matrix.user_id, endpoint, KEY)
    assert not owner.in_progress
    blocked = await post(matrix, endpoint)
    assert blocked.status_code == 409 and blocked.json() == {"detail": "UPLOAD_IN_PROGRESS"}
    assert matrix.storage.calls == 0


@pytest.mark.asyncio
async def test_processing_failure_releases_claim_and_retry_succeeds(matrix):
    matrix.storage.fail_once = True
    assert (await post(matrix, "/upload/images")).status_code == 500
    assert (await post(matrix, "/upload/images")).status_code == 200
    assert matrix.storage.calls == 2


@pytest.mark.asyncio
async def test_redis_unavailable_is_stable_503_before_storage(matrix, monkeypatch):
    async def unavailable(): raise ConnectionError("down")
    monkeypatch.setattr(replay_module, "get_redis", unavailable)
    response = await post(matrix, "/upload/media")
    assert response.status_code == 503
    assert response.json() == {"detail": "UPLOAD_REPLAY_PROTECTION_UNAVAILABLE"}
    assert matrix.storage.calls == 0


@pytest.mark.asyncio
async def test_completion_failure_retry_uses_one_deterministic_storage_identity(matrix):
    matrix.redis.fail_set_once = True
    assert (await post(matrix, "/upload/images")).status_code == 503
    assert (await post(matrix, "/upload/images")).status_code == 200
    assert matrix.storage.calls == 2 and len(matrix.storage.identities) == 1


def upload_file(filename: str, content_type: str, payload: bytes = PAYLOAD) -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(payload), headers={"content-type": content_type})


def png_payload() -> bytes:
    image = Image.new("RGBA", (2, 2), (1, 2, 3, 4))
    payload = io.BytesIO()
    image.save(payload, format="PNG")
    return payload.getvalue()


async def stored_image_retry(
    service, scope: str, upload: UploadFile, user_id, storage_key: str
) -> dict:
    if scope == "avatar":
        return await service.upload_private_user_image(upload, user_id, storage_key)
    return (await service.upload_images([upload], storage_key))[0]


def stored_image_directory(tmp_path, scope: str, user_id):
    return tmp_path / "users" / str(user_id) if scope == "avatar" else tmp_path / "images"


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["image", "avatar"])
@pytest.mark.parametrize("damage", ["missing-thumbnail", "corrupt-thumbnail", "corrupt-primary"])
async def test_deterministic_image_retry_fails_closed_for_partial_or_corrupt_existing_pair(
    tmp_path, monkeypatch, scope, damage
):
    """Removing validation of either stored image must make this test fail."""
    from app.services import file_service as files

    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path)
    service, user_id = files.FileService(), uuid4()
    storage_key = f"upload-idempotency:{scope}"
    first = await stored_image_retry(
        service, scope, upload_file("first.png", "image/png", png_payload()), user_id, storage_key
    )
    directory = stored_image_directory(tmp_path, scope, user_id)
    primary = directory / first["url"].rsplit("/", 1)[-1]
    thumbnail = directory / first["thumbnail_url"].rsplit("/", 1)[-1]

    if damage == "missing-thumbnail":
        thumbnail.unlink()
    elif damage == "corrupt-thumbnail":
        thumbnail.write_bytes(b"not an image")
    else:
        primary.write_bytes(b"not an image")
    before = {path.name: path.read_bytes() for path in directory.iterdir()}

    with pytest.raises(HTTPException) as exc_info:
        await stored_image_retry(
            service, scope, upload_file("retry.jpg", "image/jpeg", png_payload()), user_id, storage_key
        )

    assert getattr(exc_info.value, "status_code", None) == 422
    assert getattr(exc_info.value, "detail", None) == "Could not read stored image"
    assert {path.name: path.read_bytes() for path in directory.iterdir()} == before


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["image", "avatar"])
async def test_deterministic_image_retry_rejects_pillow_readable_unsupported_stored_format(
    tmp_path, monkeypatch, scope
):
    """A Pillow-readable GIF must not qualify as a supported stored upload."""
    from app.services import file_service as files

    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path)
    service, user_id = files.FileService(), uuid4()
    storage_key = f"upload-idempotency:{scope}:unsupported"
    file_id = service._file_id(storage_key, "0" if scope == "image" else "")
    directory = stored_image_directory(tmp_path, scope, user_id)
    directory.mkdir(parents=True)
    image = Image.new("RGB", (2, 2), "red")
    image.save(directory / f"{file_id}.gif", format="GIF")
    image.save(directory / f"{file_id}_thumb.gif", format="GIF")
    before = {path.name: path.read_bytes() for path in directory.iterdir()}

    with pytest.raises(HTTPException) as exc_info:
        await stored_image_retry(
            service, scope, upload_file("retry.png", "image/png", png_payload()), user_id, storage_key
        )

    assert getattr(exc_info.value, "status_code", None) == 422
    assert getattr(exc_info.value, "detail", None) == "Could not read stored image"
    assert {path.name: path.read_bytes() for path in directory.iterdir()} == before


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["image", "avatar"])
async def test_deterministic_image_retry_does_not_overwrite_or_complete_derivative_only_partial_write(
    tmp_path, monkeypatch, scope
):
    """Ignoring an orphan thumbnail would silently overwrite a partial object."""
    from app.services import file_service as files

    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path)
    service, user_id = files.FileService(), uuid4()
    storage_key = f"upload-idempotency:{scope}:orphan"
    file_id = service._file_id(storage_key, "0" if scope == "image" else "")
    directory = stored_image_directory(tmp_path, scope, user_id)
    directory.mkdir(parents=True)
    orphan = directory / f"{file_id}_thumb.png"
    orphan.write_bytes(png_payload())
    before = {path.name: path.read_bytes() for path in directory.iterdir()}

    with pytest.raises(HTTPException) as exc_info:
        await stored_image_retry(
            service, scope, upload_file("retry.jpg", "image/jpeg", png_payload()), user_id, storage_key
        )

    assert getattr(exc_info.value, "status_code", None) == 422
    assert getattr(exc_info.value, "detail", None) == "Could not read stored image"
    assert {path.name: path.read_bytes() for path in directory.iterdir()} == before


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["image", "avatar"])
async def test_deterministic_image_retry_reuses_valid_pair_with_stable_response_and_no_second_write(
    tmp_path, monkeypatch, scope
):
    """Replacing reuse with another physical write must make this test fail."""
    from app.services import file_service as files

    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path)
    service, user_id = files.FileService(), uuid4()
    storage_key = f"upload-idempotency:{scope}:valid"
    first = await stored_image_retry(
        service, scope, upload_file("alpha.png", "image/png", png_payload()), user_id, storage_key
    )
    directory = stored_image_directory(tmp_path, scope, user_id)
    before = {path.name: (path.stat().st_ino, path.read_bytes()) for path in directory.iterdir()}

    retry = await stored_image_retry(
        service, scope, upload_file("extension-variant.jpg", "image/jpeg", PAYLOAD), user_id, storage_key
    )
    after = {path.name: (path.stat().st_ino, path.read_bytes()) for path in directory.iterdir()}

    assert retry == first
    assert after == before
    assert len(after) == 2
    assert {name.split("_thumb", 1)[0].split(".", 1)[0] for name in after} == {first["id"]}


@pytest.mark.asyncio
async def test_deterministic_avatar_reuse_remains_scoped_to_each_user(tmp_path, monkeypatch):
    """Looking outside the requested user's directory must make this test fail."""
    from app.services import file_service as files

    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path)
    service, storage_key = files.FileService(), "upload-idempotency:avatar:scoped"
    first_user, second_user = uuid4(), uuid4()
    first = await service.upload_private_user_image(
        upload_file("first.png", "image/png", png_payload()), first_user, storage_key
    )
    second = await service.upload_private_user_image(
        upload_file("second.png", "image/png", png_payload()), second_user, storage_key
    )

    assert first["id"] == second["id"]
    assert first["url"] != second["url"]
    assert len(list((tmp_path / "users" / str(first_user)).iterdir())) == 2
    assert len(list((tmp_path / "users" / str(second_user)).iterdir())) == 2


@pytest.mark.asyncio
async def test_deterministic_avatar_reuse_rejects_symlink_escape_to_another_user(tmp_path, monkeypatch):
    """Following stored-object symlinks would cross the private user boundary."""
    from app.services import file_service as files

    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path)
    service, storage_key = files.FileService(), "upload-idempotency:avatar:symlink"
    owner_id, attacker_id = uuid4(), uuid4()
    owner = await service.upload_private_user_image(
        upload_file("owner.png", "image/png", png_payload()), owner_id, storage_key
    )
    owner_dir = tmp_path / "users" / str(owner_id)
    attacker_dir = tmp_path / "users" / str(attacker_id)
    attacker_dir.mkdir(parents=True)
    for response_key in ("url", "thumbnail_url"):
        source = owner_dir / owner[response_key].rsplit("/", 1)[-1]
        (attacker_dir / source.name).symlink_to(source)

    with pytest.raises(HTTPException) as exc_info:
        await service.upload_private_user_image(
            upload_file("attacker.jpg", "image/jpeg", png_payload()), attacker_id, storage_key
        )

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Could not read stored image"
    assert all(path.is_symlink() for path in attacker_dir.iterdir())


@pytest.mark.asyncio
async def test_avatar_retry_after_completion_failure_reuses_one_private_object_despite_extension_variant(tmp_path, monkeypatch):
    """Changing a retry filename must not produce another private avatar object."""
    from app.services import file_service as files

    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path)
    user_id = uuid4()
    storage_key = "upload-idempotency:avatar"
    first = await files.FileService().upload_private_user_image(
        upload_file("first.png", "image/png", png_payload()), user_id, storage_key
    )
    retry = await files.FileService().upload_private_user_image(
        upload_file("retry.jpg", "image/jpeg"), user_id, storage_key
    )

    stored = list((tmp_path / "users" / str(user_id)).iterdir())
    assert retry == first
    assert len(stored) == 2  # full image + thumbnail, exactly once


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "directory", "first_name", "retry_name", "content_type", "expected"),
    [
        ("upload_video", "videos", "first.mp4", "retry.mov", "video/mp4", {"type": "video", "duration_ms": 2750}),
        ("upload_audio", "audio", "first.webm", "retry.mp3", "audio/webm", {"type": "audio", "duration_ms": 2750}),
    ],
)
async def test_media_retry_after_completion_failure_reuses_one_object_and_exact_metadata(
    tmp_path, monkeypatch, method, directory, first_name, retry_name, content_type, expected
):
    """A deterministic media retry must retain the original duration and URL metadata."""
    from app.services import file_service as files

    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path)
    fake_ffmpeg = SimpleNamespace(
        probe=lambda _path: {"format": {"duration": "2.75"}},
        input=lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("no poster in unit test")),
    )
    monkeypatch.setitem(sys.modules, "ffmpeg", fake_ffmpeg)
    (tmp_path / directory).mkdir()
    storage_key = f"upload-idempotency:{directory}"
    service = files.FileService()
    first = await getattr(service, method)(upload_file(first_name, content_type), storage_key)
    retry = await getattr(service, method)(upload_file(retry_name, content_type), storage_key)

    stored = list((tmp_path / directory).iterdir())
    assert retry == first
    assert first["duration_ms"] == expected["duration_ms"]
    assert len(stored) == 1


@pytest.mark.asyncio
async def test_authenticated_endpoints_ignore_forged_tenant_header_and_scope_by_user(matrix):
    for endpoint in ("/upload/images", "/upload/avatar", "/upload/media"):
        assert (await post(matrix, endpoint, key=str(uuid4()))).status_code == 200
    keys = "\n".join(matrix.redis.values)
    assert str(matrix.tenant_id) in keys and "forged-tenant" not in keys


@pytest.mark.asyncio
async def test_public_photo_uses_trusted_middleware_tenant_not_forged_header(matrix):
    assert (await post(matrix, "/upload/photo")).status_code == 200
    keys = "\n".join(matrix.redis.values)
    assert str(matrix.public_tenant) in keys and "forged-tenant" not in keys


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ["/upload/images", "/upload/photo", "/upload/avatar", "/upload/media"])
async def test_key_must_be_uuid_shaped_before_storage(matrix, endpoint):
    response = await post(matrix, endpoint, key="not-a-uuid")
    assert response.status_code == 400
    assert response.json() == {"detail": "Idempotency-Key must be UUID-shaped"}
    assert matrix.storage.calls == 0


@pytest.mark.asyncio
async def test_public_client_id_must_be_uuid_shaped_before_storage(matrix):
    response = await post(matrix, "/upload/photo", client_id="forged-client")
    assert response.status_code == 400
    assert response.json() == {"detail": "Anonymous client ID must be UUID-shaped"}
    assert matrix.storage.calls == 0


@pytest.mark.asyncio
async def test_concurrent_asgi_requests_store_one_object_and_return_409(matrix):
    started, release = asyncio.Event(), asyncio.Event()
    original = matrix.storage.image
    async def slow(files, storage_key):
        started.set(); await release.wait(); return await original(files, storage_key)
    matrix.storage.image = slow
    first = asyncio.create_task(post(matrix, "/upload/images"))
    await started.wait()
    second = await post(matrix, "/upload/images")
    release.set()
    assert (await first).status_code == 200 and second.status_code == 409
    assert matrix.storage.calls == 1
