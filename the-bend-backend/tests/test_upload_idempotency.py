"""ASGI contract matrix for idempotent upload endpoints."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI, Request

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
