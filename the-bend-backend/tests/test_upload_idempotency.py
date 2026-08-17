import hashlib
import pytest

from app.services.upload_idempotency_service import UploadIdempotencyService


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
async def test_claim_key_is_scoped_and_hashed():
    service = UploadIdempotencyService()
    key = '00000000-0000-4000-8000-000000000123'
    claim = await service.claim('tenant', 'member', '/upload/media', key)
    digest = hashlib.sha256(key.encode()).hexdigest()
    assert claim.claim_key == f'upload-idempotency:tenant:member:/upload/media:{digest}'
