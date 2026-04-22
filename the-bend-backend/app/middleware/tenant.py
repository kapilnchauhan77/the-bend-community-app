"""Tenant resolution middleware — attaches current tenant to request.state."""
from app.config import get_settings as _get_settings


def get_frontend_url(tenant) -> str:
    """Build tenant-specific frontend URL from tenant subdomain."""
    settings = _get_settings()
    if tenant and tenant.subdomain:
        return f"https://{tenant.subdomain}"
    return settings.FRONTEND_URL
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from sqlalchemy import select

from app.database import async_session
from app.models.tenant import Tenant


class TenantMiddleware(BaseHTTPMiddleware):
    """Resolve tenant from X-Tenant-Slug header or subdomain, skip for super-admin and health routes."""

    def __init__(self, app, base_domain: str = "thebend.app"):
        super().__init__(app)
        self.base_domain = base_domain

    async def dispatch(self, request: Request, call_next):
        # Skip tenant resolution for health, docs, openapi, static, and super-admin routes
        path = request.url.path
        skip_paths = ("/api/v1/health", "/api/v1/super-admin", "/docs", "/openapi.json", "/uploads/")
        if any(path.startswith(p) for p in skip_paths):
            request.state.tenant = None
            return await call_next(request)

        # 1. Try X-Tenant-Slug header
        slug = request.headers.get("x-tenant-slug")

        # 2. Try subdomain extraction
        if not slug:
            host = request.headers.get("host", "")
            hostname = host.split(":")[0]  # strip port
            if hostname.endswith(f".{self.base_domain}"):
                slug = hostname.replace(f".{self.base_domain}", "")

        # 3. Fallback for local development — default to "montross"
        if not slug:
            slug = "westmoreland"

        # Look up tenant
        async with async_session() as session:
            result = await session.execute(
                select(Tenant).where(Tenant.slug == slug, Tenant.is_active == True)
            )
            tenant = result.scalar_one_or_none()

        if not tenant:
            # For the tenant/current endpoint, return 404 so frontend knows
            if path.startswith("/api/v1/tenant"):
                return JSONResponse(status_code=404, content={"detail": "Tenant not found"})
            # For other routes, fallback without tenant (won't break auth routes etc.)
            request.state.tenant = None
            return await call_next(request)

        request.state.tenant = tenant
        return await call_next(request)
