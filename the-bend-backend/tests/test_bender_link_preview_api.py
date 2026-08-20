import types
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.api.deps import get_db
from app.api.v1.bender import get_link_preview_service, router
from app.core.exceptions import AppException, RateLimitError
from app.core.permissions import get_current_user
from app.services.bender_link_preview_service import BenderLinkPreviewService
from app.services.link_preview_errors import (
    LinkPreviewDeadlineExceeded,
    LinkPreviewResponseTooLarge,
    LinkPreviewTitleMissing,
    LinkPreviewUpstreamFailure,
)
from app.services.bender_link_urls import LinkPreviewURLRejected


class FakeService:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, []

    async def create_preview(self, source_url, *, user_id, tenant_id):
        self.calls.append((source_url, user_id, tenant_id))
        if self.error:
            raise self.error
        return self.result


def _user():
    return types.SimpleNamespace(id=uuid4(), tenant_id=uuid4())


def _app(user=None, service=None, limiter=None):
    app = FastAPI()

    @app.exception_handler(AppException)
    async def handler(_request, exc):
        response = JSONResponse(status_code=exc.status_code, content=exc.detail)
        if hasattr(exc, "retry_after"):
            response.headers["Retry-After"] = str(exc.retry_after)
        return response

    async def no_db():
        yield None

    app.dependency_overrides[get_db] = no_db
    if user is not None:
        async def current_user():
            return user
        app.dependency_overrides[get_current_user] = current_user
    if service is not None:
        app.dependency_overrides[get_link_preview_service] = lambda: service
    from app.api.v1.bender import enforce_link_preview_rate_limit
    if limiter is None:
        async def limiter():
            return None
    app.dependency_overrides[enforce_link_preview_rate_limit] = limiter
    app.include_router(router, prefix="/api/v1")
    return app


def _result():
    from app.schemas.bender import BenderLinkPreview, BenderLinkPreviewResponse
    preview = BenderLinkPreview(source_url="https://example.org/event", url="https://example.org/event", title="Event")
    return BenderLinkPreviewResponse(preview_token="opaque", preview=preview)


def test_preview_requires_authentication_before_service():
    service = FakeService(result=_result())
    with TestClient(_app(service=service)) as client:
        response = client.post("/api/v1/bender/link-preview", json={"url": "https://secret.example/path"})
    assert response.status_code == 401
    assert service.calls == []


@pytest.mark.parametrize(
    ("error", "status_code", "code"),
    [
        (LinkPreviewURLRejected("invalid"), 400, "LINK_PREVIEW_URL_REJECTED"),
        (LinkPreviewResponseTooLarge("large"), 413, "LINK_PREVIEW_TOO_LARGE"),
        (LinkPreviewTitleMissing("title"), 422, "LINK_PREVIEW_TITLE_MISSING"),
        (LinkPreviewUpstreamFailure("upstream"), 502, "LINK_PREVIEW_UPSTREAM_FAILURE"),
        (LinkPreviewDeadlineExceeded("deadline"), 504, "LINK_PREVIEW_TIMEOUT"),
        (RateLimitError(), 429, "RATE_LIMITED"),
    ],
)
def test_preview_maps_fixed_errors_without_leaking_exception(error, status_code, code):
    user = _user()
    service = FakeService(error=error)
    with TestClient(_app(user=user, service=service), raise_server_exceptions=False) as client:
        response = client.post("/api/v1/bender/link-preview", json={"url": "https://secret.example/path?token=hide"})
    assert response.status_code == status_code
    assert response.json()["error"]["code"] == code
    assert "secret.example" not in response.text
    assert "upstream" not in response.text


def test_preview_returns_public_shape_and_passes_authenticated_binding():
    user = _user()
    service = FakeService(result=_result())
    with TestClient(_app(user=user, service=service)) as client:
        response = client.post("/api/v1/bender/link-preview", json={"url": "https://example.org/event"})
    assert response.status_code == 200
    assert set(response.json()) == {"preview_token", "preview"}
    assert "version" not in response.json()["preview"]
    assert service.calls == [("https://example.org/event", user.id, user.tenant_id)]


@pytest.mark.parametrize("url", ["", "x" * 2049])
def test_empty_or_oversized_url_is_400_not_validation_422(url):
    user = _user()
    service = FakeService(result=_result())
    with TestClient(_app(user=user, service=service)) as client:
        response = client.post("/api/v1/bender/link-preview", json={"url": url})
    assert response.status_code == 400
