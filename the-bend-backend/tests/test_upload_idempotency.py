import hashlib
import pytest

from app.services.upload_idempotency_service import UploadIdempotencyService, UploadIdempotencyUnavailable


@pytest.mark.asyncio
async def test_same_upload_idempotency_key_returns_first_result():
    service = UploadIdempotencyService()
    key = '00000000-0000-4000-8000-000000000123'
    first = await service.claim('tenant', 'member', '/upload/images', key)
    await service.complete(first.claim_key, {'images': [{'id': 'first'}]})
    replay = await service.claim('tenant', 'member', '/upload/images', key)
    assert replay.response == {'images': [{'id': 'first'}]}
    assert replay.claim_key == first.claim_key


@pytest.mark.asyncio
async def test_claim_key_is_scoped_and_hashed(monkeypatch):
    class Redis:
        async def get(self, _key): return None
        async def set(self, *_args, **_kwargs): return True
    async def redis(): return Redis()
    monkeypatch.setattr('app.services.upload_idempotency_service.get_redis', redis)
    service = UploadIdempotencyService()
    key = '00000000-0000-4000-8000-000000000123'
    claim = await service.claim('tenant', 'member', '/upload/media', key)
    digest = hashlib.sha256(key.encode()).hexdigest()
    assert claim.claim_key == f'upload-idempotency:tenant:member:/upload/media:{digest}'


@pytest.mark.asyncio
async def test_redis_failure_fails_closed(monkeypatch):
    async def unavailable(): raise ConnectionError('redis down')
    monkeypatch.setattr('app.services.upload_idempotency_service.get_redis', unavailable)
    with pytest.raises(UploadIdempotencyUnavailable):
        await UploadIdempotencyService().claim('tenant', 'member', '/upload/media', '00000000-0000-4000-8000-000000000123')


@pytest.mark.asyncio
async def test_concurrent_claims_allow_only_one_owner(monkeypatch):
    class Redis:
        value = None
        async def get(self, _key): return self.value
        async def set(self, _key, value, **_kwargs):
            if self.value is not None: return False
            self.value = value; return True
    redis = Redis()
    async def client(): return redis
    monkeypatch.setattr('app.services.upload_idempotency_service.get_redis', client)
    service = UploadIdempotencyService()
    first, second = await __import__('asyncio').gather(
        service.claim('tenant', 'member', '/upload/media', '00000000-0000-4000-8000-000000000123'),
        service.claim('tenant', 'member', '/upload/media', '00000000-0000-4000-8000-000000000123'),
    )
    assert sum(not claim.in_progress for claim in (first, second)) == 1
