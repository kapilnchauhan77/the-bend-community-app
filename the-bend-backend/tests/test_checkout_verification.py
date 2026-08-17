import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.api.deps import get_db
from app.core.permissions import get_current_tenant


@pytest.mark.asyncio
async def test_checkout_status_rejects_forged_session_without_provider_call():
    app = create_app()
    app.dependency_overrides[get_db] = lambda: None
    app.dependency_overrides[get_current_tenant] = lambda: type(
        "Tenant", (), {"slug": "westmoreland", "id": "00000000-0000-0000-0000-000000000001"}
    )()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/checkout/status/event/cs_forged")
    assert response.status_code == 404

