from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import (
    get_current_tenant,
    get_current_user,
    get_current_user_optional,
)
from app.core.exceptions import AppException, RateLimitError
from app.core.rate_limit import check_rate_limit, get_redis
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.bender import (
    BenderCommentCreate,
    BenderCommentResponse,
    BenderCommentsResponse,
    BenderFeedResponse,
    BenderPostCreate,
    BenderPostResponse,
    BenderLinkPreviewRequest,
    BenderLinkPreviewResponse,
)
from app.services.bender_service import BenderService
from app.services.bender_link_preview_service import BenderLinkPreviewService
from app.services.bender_link_preview_store import BenderLinkPreviewStore
from app.services.link_preview_generator import BenderLinkPreviewGenerator
from app.services.link_preview_errors import (
    LinkPreviewDeadlineExceeded,
    LinkPreviewResponseTooLarge,
    LinkPreviewTitleMissing,
    LinkPreviewUpstreamFailure,
)
from app.services.bender_link_urls import LinkPreviewURLRejected
from app.services.link_preview_metadata import LinkPreviewMetadataParser
from app.services.link_preview_image_store import LinkPreviewImageStore
from app.services.safe_external_fetcher import SafeExternalFetcher

router = APIRouter(prefix="/bender", tags=["Bender"])


def get_service(db: AsyncSession = Depends(get_db)) -> BenderService:
    return BenderService(db)


async def enforce_link_preview_rate_limit(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> None:
    try:
        await check_rate_limit(request, str(current_user.id), max_requests=10, window_seconds=60)
    except RedisError as exc:
        raise AppException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "LINK_PREVIEW_UNAVAILABLE",
            "Link preview is temporarily unavailable",
        ) from exc


async def get_link_preview_store(redis=Depends(get_redis)) -> BenderLinkPreviewStore:
    return BenderLinkPreviewStore(redis)


def get_link_preview_generator() -> BenderLinkPreviewGenerator:
    return BenderLinkPreviewGenerator(
        fetcher=SafeExternalFetcher(),
        parser=LinkPreviewMetadataParser(),
        image_store=LinkPreviewImageStore(),
    )


def get_link_preview_service(
    store: BenderLinkPreviewStore = Depends(get_link_preview_store),
    generator: BenderLinkPreviewGenerator = Depends(get_link_preview_generator),
) -> BenderLinkPreviewService:
    return BenderLinkPreviewService(store, generator)


@router.post(
    "/link-preview",
    response_model=BenderLinkPreviewResponse,
    dependencies=[Depends(enforce_link_preview_rate_limit)],
)
async def create_link_preview(
    data: BenderLinkPreviewRequest,
    service: BenderLinkPreviewService = Depends(get_link_preview_service),
    current_user: User = Depends(get_current_user),
):
    try:
        if not data.url.strip() or len(data.url.strip()) > 2048:
            raise LinkPreviewURLRejected("invalid_length")
        return await service.create_preview(
            data.url,
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
        )
    except LinkPreviewURLRejected as exc:
        raise AppException(status.HTTP_400_BAD_REQUEST, "LINK_PREVIEW_URL_REJECTED", "Invalid preview URL") from exc
    except LinkPreviewResponseTooLarge as exc:
        raise AppException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "LINK_PREVIEW_TOO_LARGE", "Preview response is too large") from exc
    except LinkPreviewTitleMissing as exc:
        raise AppException(status.HTTP_422_UNPROCESSABLE_ENTITY, "LINK_PREVIEW_TITLE_MISSING", "Preview metadata is unavailable") from exc
    except LinkPreviewUpstreamFailure as exc:
        raise AppException(status.HTTP_502_BAD_GATEWAY, "LINK_PREVIEW_UPSTREAM_FAILURE", "Preview source is unavailable") from exc
    except LinkPreviewDeadlineExceeded as exc:
        raise AppException(status.HTTP_504_GATEWAY_TIMEOUT, "LINK_PREVIEW_TIMEOUT", "Preview request timed out") from exc
    except RateLimitError:
        raise
    except RedisError as exc:
        raise AppException(status.HTTP_503_SERVICE_UNAVAILABLE, "LINK_PREVIEW_UNAVAILABLE", "Link preview is temporarily unavailable") from exc


# ----------------------------------------------------------------------
# posts
# ----------------------------------------------------------------------


@router.get("/posts", response_model=BenderFeedResponse)
async def list_posts(
    cursor: str | None = Query(None),
    limit: int = Query(15, ge=1, le=30),
    service: BenderService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
    viewer: User | None = Depends(get_current_user_optional),
):
    """Public-ish feed. Works without auth; `viewer_has_liked` is always
    false for anonymous viewers."""
    items, next_cursor, has_more = await service.feed(
        tenant_id=tenant.id if tenant else None,
        cursor=cursor,
        limit=limit,
        current_user=viewer,
    )
    return BenderFeedResponse(
        items=items, next_cursor=next_cursor, has_more=has_more
    )


@router.post(
    "/posts",
    response_model=BenderPostResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_post(
    data: BenderPostCreate,
    service: BenderService = Depends(get_service),
    current_user: User = Depends(get_current_user),
):
    post = await service.create_post(data, current_user)
    # Build response with the same author block the feed uses.
    return BenderPostResponse(
        id=str(post.id),
        author=service._author_block(
            current_user,
            # current_user.shop is lazy-loaded; safe to access since deps
            # already fetched the user. If shop_id is set but the relation
            # isn't loaded, fall back to a name-less stub.
            getattr(current_user, "shop", None) if current_user.shop_id else None,
        ),
        caption=post.caption,
        media_url=post.media_url,
        media_thumbnail_url=post.media_thumbnail_url,
        media_type=post.media_type,
        like_count=post.like_count,
        comment_count=post.comment_count,
        viewer_has_liked=False,
        created_at=post.created_at,
        link_preview=service._preview_block(post.link_preview),
    )


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: UUID,
    service: BenderService = Depends(get_service),
    current_user: User = Depends(get_current_user),
):
    await service.delete_post(post_id, current_user)
    return None


# ----------------------------------------------------------------------
# likes
# ----------------------------------------------------------------------


@router.post("/posts/{post_id}/like")
async def like_post(
    post_id: UUID,
    service: BenderService = Depends(get_service),
    current_user: User = Depends(get_current_user),
):
    post = await service.like(post_id, current_user)
    return {
        "id": str(post.id),
        "like_count": post.like_count,
        "viewer_has_liked": True,
    }


@router.delete("/posts/{post_id}/like")
async def unlike_post(
    post_id: UUID,
    service: BenderService = Depends(get_service),
    current_user: User = Depends(get_current_user),
):
    post = await service.unlike(post_id, current_user)
    return {
        "id": str(post.id),
        "like_count": post.like_count,
        "viewer_has_liked": False,
    }


# ----------------------------------------------------------------------
# comments
# ----------------------------------------------------------------------


@router.get(
    "/posts/{post_id}/comments",
    response_model=BenderCommentsResponse,
)
async def list_comments(
    post_id: UUID,
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    service: BenderService = Depends(get_service),
):
    items, next_cursor, has_more = await service.list_comments(
        post_id=post_id, cursor=cursor, limit=limit
    )
    return BenderCommentsResponse(
        items=items, next_cursor=next_cursor, has_more=has_more
    )


@router.post(
    "/posts/{post_id}/comments",
    response_model=BenderCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    post_id: UUID,
    data: BenderCommentCreate,
    service: BenderService = Depends(get_service),
    current_user: User = Depends(get_current_user),
):
    comment = await service.create_comment(post_id, data, current_user)
    return BenderCommentResponse(
        id=str(comment.id),
        author=service._author_block(current_user, None),
        content=comment.content,
        created_at=comment.created_at,
    )


@router.delete(
    "/posts/{post_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_comment(
    post_id: UUID,
    comment_id: UUID,
    service: BenderService = Depends(get_service),
    current_user: User = Depends(get_current_user),
):
    # `post_id` is a path parameter for REST shape; the service looks up the
    # comment directly and resolves its post for the auth check, so we don't
    # need to thread it through.
    await service.delete_comment(comment_id, current_user)
    return None
