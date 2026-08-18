import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.mark.asyncio
@pytest.mark.parametrize("origin", ["https://localhost", "capacitor://localhost"])
async def test_native_webview_origins_can_preflight_the_api(origin: str):
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.options(
            "/api/v1/tenant/current",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-tenant-slug",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
