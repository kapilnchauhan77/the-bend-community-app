"""Server-rendered Open Graph link previews for social crawlers.

Social platforms (Facebook, WhatsApp, iMessage, LinkedIn, Slack, etc.) fetch
the URL with their own User-Agent and read OG meta tags from the HTML. Our
frontend is a Vite SPA, so React-injected meta tags are invisible to those
crawlers. This router serves a minimal static HTML page stamped with the
listing's title, description, and first image, so shared links render as a
rich card. Caddy detects crawler UAs and reroutes /listing/{id} here.
"""
from __future__ import annotations

import html
import re
import uuid

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.database import async_session
from app.models.listing import Listing

router = APIRouter(prefix="/share", tags=["Share"])

_WS_RE = re.compile(r"\s+")
_DEFAULT_IMAGE_PATH = "/images/the-bend-community-preview-v4.png"
_DEFAULT_SITE_NAME = "The Bend Community"
_DEFAULT_DESCRIPTION = "Share staff, materials & equipment with your neighbors."


def _truncate(text: str, limit: int = 180) -> str:
    text = _WS_RE.sub(" ", text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _absolute_upload(path: str | None) -> str | None:
    """Promote a /uploads/... path to https://api.<base>/uploads/..."""
    if not path:
        return None
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if path.startswith("/uploads/"):
        settings = get_settings()
        return f"https://api.{settings.BASE_DOMAIN}{path}"
    return path


def _render(
    *,
    title: str,
    description: str,
    image: str,
    canonical: str,
    site_name: str,
) -> str:
    t = html.escape(title, quote=True)
    d = html.escape(description, quote=True)
    s = html.escape(site_name, quote=True)
    img = html.escape(image, quote=True)
    url = html.escape(canonical, quote=True)
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>{t} · {s}</title>
    <meta name="description" content="{d}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="{s}">
    <meta property="og:title" content="{t}">
    <meta property="og:description" content="{d}">
    <meta property="og:image" content="{img}">
    <meta property="og:image:secure_url" content="{img}">
    <meta property="og:image:alt" content="{s}">
    <meta property="og:url" content="{url}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{t}">
    <meta name="twitter:description" content="{d}">
    <meta name="twitter:image" content="{img}">
    <meta name="twitter:image:alt" content="{s}">
    <link rel="canonical" href="{url}">
    <meta http-equiv="refresh" content="0; url={url}">
    <script>location.replace({url!r});</script>
  </head>
  <body>
    <p><a href="{url}">{t}</a></p>
  </body>
</html>
"""


def _tenant_host(request: Request) -> str | None:
    tenant = getattr(request.state, "tenant", None)
    if tenant and tenant.subdomain:
        return tenant.subdomain
    return None


def _site_name(request: Request) -> str:
    tenant = getattr(request.state, "tenant", None)
    if tenant and tenant.display_name:
        return tenant.display_name
    return _DEFAULT_SITE_NAME


def _default_canonical(listing_id: str, host: str | None) -> str:
    settings = get_settings()
    base = host or settings.BASE_DOMAIN
    return f"https://{base}/listing/{listing_id}"


@router.get("/listing/{listing_id}", response_class=HTMLResponse)
async def share_listing(listing_id: str, request: Request) -> HTMLResponse:
    settings = get_settings()
    host = _tenant_host(request)
    canonical = _default_canonical(listing_id, host)
    site_name = _site_name(request)
    default_image = f"https://{settings.BASE_DOMAIN}{_DEFAULT_IMAGE_PATH}"

    try:
        lid = uuid.UUID(listing_id)
    except (ValueError, TypeError):
        return HTMLResponse(
            _render(
                title=site_name,
                description=_DEFAULT_DESCRIPTION,
                image=default_image,
                canonical=canonical,
                site_name=site_name,
            )
        )

    async with async_session() as session:
        result = await session.execute(
            select(Listing)
            .options(selectinload(Listing.images))
            .where(Listing.id == lid)
        )
        listing = result.scalar_one_or_none()

    if not listing:
        return HTMLResponse(
            _render(
                title=site_name,
                description=_DEFAULT_DESCRIPTION,
                image=default_image,
                canonical=canonical,
                site_name=site_name,
            )
        )

    images = sorted(listing.images or [], key=lambda i: i.sort_order or 0)
    image_url = _absolute_upload(images[0].url) if images else None
    if not image_url:
        image_url = default_image

    return HTMLResponse(
        _render(
            title=listing.title or site_name,
            description=_truncate(listing.description or _DEFAULT_DESCRIPTION),
            image=image_url,
            canonical=canonical,
            site_name=site_name,
        )
    )
