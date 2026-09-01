from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import ValidationError as PydanticValidationError
from redis.exceptions import RedisError
import asyncio
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import BusinessRuleViolation, ConflictError, ForbiddenError, NotFoundError
from app.core.pagination import decode_cursor, encode_cursor
from app.models.bender import BenderComment, BenderCommentLike, BenderLike, BenderPost
from app.models.enums import NotificationType, UserRole
from app.repositories.notification_repo import NotificationRepository
from app.models.user import User
from app.schemas.bender import (
    BenderAuthor,
    BenderCommentCreate,
    BenderCommentResponse,
    BenderLinkPreview,
    BenderLinkPreviewSnapshot,
    BenderPostCreate,
    BenderPostResponse,
)
from app.services.bender_link_preview_store import BenderLinkPreviewStore


class BenderService:
    PREVIEW_DRAFT_TIMEOUT_SECONDS = 1.5
    """Server-side Bender (community feed) business logic.

    Notes on non-obvious decisions:

    * **viewer_has_liked is computed in BULK, not per-row.** When we load the
      page we collect every post_id and run a single
      `SELECT post_id FROM bender_likes WHERE user_id = ? AND post_id IN (...)`.
      That gives us a set, and `viewer_has_liked` becomes a set-membership
      check. Per-row queries would be N+1. For anonymous viewers we skip
      the query entirely and the set stays empty.

    * **like_count / comment_count are kept consistent via atomic UPDATE
      statements** — `UPDATE bender_posts SET like_count = like_count + 1
      WHERE id = ?` rather than read-modify-write through the ORM. That
      avoids lost updates if two viewers like the same post at the same
      instant. Combined with the unique index on (post_id, user_id) and
      the IntegrityError -> idempotent-no-op handling, like/unlike is safe
      under concurrency.
    """

    def __init__(
        self,
        db: AsyncSession,
        link_preview_store: BenderLinkPreviewStore | None = None,
        *,
        preview_draft_timeout_seconds: float = PREVIEW_DRAFT_TIMEOUT_SECONDS,
    ):
        self.db = db
        self.link_preview_store = link_preview_store
        self.preview_draft_timeout_seconds = preview_draft_timeout_seconds

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    def _author_block(self, post_or_comment_user: User, post_shop=None) -> BenderAuthor:
        shop = post_shop
        return BenderAuthor(
            id=str(post_or_comment_user.id),
            name=post_or_comment_user.name,
            avatar_url=post_or_comment_user.avatar_url,
            shop_id=str(shop.id) if shop else None,
            shop_name=shop.name if shop else None,
        )

    async def _get_post_or_404(self, post_id: UUID) -> BenderPost:
        row = await self.db.get(BenderPost, post_id)
        if row is None:
            raise NotFoundError("Post")
        return row

    async def _get_visible_post_or_404(self, post_id: UUID, tenant_id: UUID | None) -> BenderPost:
        result = await self.db.execute(
            select(BenderPost).options(selectinload(BenderPost.author), selectinload(BenderPost.shop)).where(
                BenderPost.id == post_id, BenderPost.tenant_id == tenant_id
            )
        )
        post = result.scalar_one_or_none()
        if post is None:
            raise NotFoundError("Post")
        return post

    def _bind_tenant(self, current_user: User, tenant_id: UUID | None) -> None:
        if current_user.role != UserRole.SUPER_ADMIN and current_user.tenant_id != tenant_id:
            raise NotFoundError("Post")

    def _comment_response(self, comment, *, viewer_liked_ids: set[UUID], reply_counts: dict[UUID, int]):
        return BenderCommentResponse(
            id=comment.id,
            author=self._author_block(comment.user, None),
            content="Comment deleted" if comment.deleted_at else comment.content,
            created_at=comment.created_at,
            parent_comment_id=comment.parent_comment_id,
            reply_count=0 if comment.parent_comment_id else reply_counts.get(comment.id, 0),
            like_count=0 if comment.deleted_at else comment.like_count,
            viewer_has_liked=comment.id in viewer_liked_ids and comment.deleted_at is None,
            is_deleted=comment.deleted_at is not None,
        )

    async def get_post(self, post_id, tenant_id, current_user):
        post = await self._get_visible_post_or_404(post_id, tenant_id)
        liked = False
        if current_user and (current_user.role == UserRole.SUPER_ADMIN or current_user.tenant_id == tenant_id):
            liked = (await self.db.execute(select(BenderLike.id).where(BenderLike.post_id == post.id, BenderLike.user_id == current_user.id))).scalar_one_or_none() is not None
        return BenderPostResponse(id=post.id, author=self._author_block(post.author, post.shop), caption=post.caption, media_url=post.media_url, media_thumbnail_url=post.media_thumbnail_url, media_type=post.media_type, like_count=post.like_count, comment_count=post.comment_count, viewer_has_liked=liked, created_at=post.created_at, link_preview=self._preview_block(post.link_preview))

    def _is_community_admin(self, user: User) -> bool:
        return user.role in (UserRole.COMMUNITY_ADMIN, UserRole.SUPER_ADMIN)

    @staticmethod
    def _preview_block(value: object | None) -> BenderLinkPreview | None:
        if not isinstance(value, dict):
            return None
        version = value.get("version")
        if isinstance(version, bool) or not isinstance(version, int) or version != 1:
            return None
        try:
            snapshot = BenderLinkPreviewSnapshot.model_validate(value)
            return BenderLinkPreview.model_validate(
                snapshot.model_dump(exclude={"version"})
            )
        except PydanticValidationError:
            return None

    # ------------------------------------------------------------------
    # posts
    # ------------------------------------------------------------------

    async def create_post(
        self, data: BenderPostCreate, current_user: User
    ) -> BenderPost:
        caption = data.caption.strip() if data.caption else None
        link_preview = None
        if (
            self.link_preview_store is not None
            and data.preview_token
            and len(data.preview_token) <= 128
        ):
            try:
                snapshot = await asyncio.wait_for(self.link_preview_store.resolve_draft(
                    data.preview_token,
                    user_id=current_user.id,
                    tenant_id=current_user.tenant_id,
                    caption=caption,
                ), timeout=self.preview_draft_timeout_seconds)
            except (RedisError, asyncio.TimeoutError):
                snapshot = None
            if snapshot is not None:
                link_preview = snapshot.model_dump(mode="json")
        post = BenderPost(
            id=uuid4(),
            author_user_id=current_user.id,
            author_shop_id=current_user.shop_id,
            tenant_id=current_user.tenant_id,
            caption=caption,
            media_url=data.media_url,
            media_thumbnail_url=data.media_thumbnail_url,
            media_type=data.media_type,
            link_preview=link_preview,
            like_count=0,
            comment_count=0,
        )
        self.db.add(post)
        await self.db.flush()
        await self.db.refresh(post)
        return post

    async def delete_post(self, post_id: UUID, current_user: User) -> None:
        post = await self._get_post_or_404(post_id)
        is_owner = post.author_user_id == current_user.id
        same_tenant_admin = self._is_community_admin(current_user) and (
            current_user.tenant_id is None or post.tenant_id == current_user.tenant_id
        )
        if not (is_owner or same_tenant_admin):
            raise ForbiddenError("Not allowed to delete this post")
        await self.db.delete(post)
        await self.db.flush()

    async def feed(
        self,
        tenant_id: UUID | None,
        cursor: str | None,
        limit: int,
        current_user: User | None,
    ) -> tuple[list[BenderPostResponse], str | None, bool]:
        """Cursor-paginated reverse-chronological feed.

        Cursor key is (created_at, id) — tie-break by id DESC so two posts
        sharing a created_at don't get duplicated or skipped.
        """
        query = (
            select(BenderPost)
            .options(
                selectinload(BenderPost.author),
                selectinload(BenderPost.shop),
            )
        )

        if tenant_id is not None:
            query = query.where(BenderPost.tenant_id == tenant_id)

        if cursor:
            cursor_data = decode_cursor(cursor)
            if "created_at" in cursor_data:
                cursor_time = datetime.fromisoformat(cursor_data["created_at"])
                cursor_id_raw = cursor_data.get("id", "")
                try:
                    cursor_id = UUID(cursor_id_raw)
                except (ValueError, AttributeError):
                    cursor_id = None
                if cursor_id is not None:
                    query = query.where(
                        or_(
                            BenderPost.created_at < cursor_time,
                            and_(
                                BenderPost.created_at == cursor_time,
                                BenderPost.id < cursor_id,
                            ),
                        )
                    )
                else:
                    query = query.where(BenderPost.created_at < cursor_time)

        query = query.order_by(BenderPost.created_at.desc(), BenderPost.id.desc())
        query = query.limit(limit + 1)

        result = await self.db.execute(query)
        rows = list(result.scalars().unique().all())

        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]

        # Bulk-resolve viewer_has_liked in a single query. Empty set when
        # the viewer is anonymous or the page is empty.
        liked_ids: set[UUID] = set()
        if current_user is not None and rows:
            post_ids = [r.id for r in rows]
            liked_q = select(BenderLike.post_id).where(
                BenderLike.user_id == current_user.id,
                BenderLike.post_id.in_(post_ids),
            )
            liked_result = await self.db.execute(liked_q)
            liked_ids = {pid for (pid,) in liked_result.all()}

        items = [
            BenderPostResponse(
                id=str(r.id),
                author=self._author_block(r.author, r.shop),
                caption=r.caption,
                media_url=r.media_url,
                media_thumbnail_url=r.media_thumbnail_url,
                media_type=r.media_type,
                like_count=r.like_count,
                comment_count=r.comment_count,
                viewer_has_liked=r.id in liked_ids,
                created_at=r.created_at,
                link_preview=self._preview_block(r.link_preview),
            )
            for r in rows
        ]

        next_cursor = None
        if has_more and rows:
            last = rows[-1]
            next_cursor = encode_cursor({"created_at": last.created_at, "id": last.id})

        return items, next_cursor, has_more

    # ------------------------------------------------------------------
    # likes
    # ------------------------------------------------------------------

    async def like(self, post_id: UUID, current_user: User, tenant_id: UUID | None = None) -> BenderPost:
        """Idempotent like.

        Strategy: try to insert; if (post_id, user_id) collides on the
        unique index, that's the second-press case — we swallow the error
        and return without bumping the count. Counter bump is an atomic
        UPDATE so concurrent likers can't lose increments.
        """
        post = await self._get_visible_post_or_404(post_id, tenant_id)
        self._bind_tenant(current_user, tenant_id)

        like_row = BenderLike(
            id=uuid4(),
            post_id=post.id,
            user_id=current_user.id,
        )
        # Use a savepoint so the IntegrityError doesn't poison the outer
        # transaction. begin_nested() gives us SAVEPOINT semantics in async.
        savepoint = await self.db.begin_nested()
        try:
            self.db.add(like_row)
            await self.db.flush()
        except IntegrityError:
            await savepoint.rollback()
            # Already liked → idempotent no-op, return post unchanged.
            return post
        else:
            await savepoint.commit()

        # Atomic counter bump.
        await self.db.execute(
            update(BenderPost)
            .where(BenderPost.id == post.id)
            .values(like_count=BenderPost.like_count + 1)
        )
        await self.db.flush()
        await self.db.refresh(post)
        return post

    async def unlike(self, post_id: UUID, current_user: User, tenant_id: UUID | None = None) -> BenderPost:
        """Idempotent unlike."""
        post = await self._get_visible_post_or_404(post_id, tenant_id)
        self._bind_tenant(current_user, tenant_id)

        like_q = select(BenderLike).where(
            BenderLike.post_id == post.id,
            BenderLike.user_id == current_user.id,
        )
        like_row = (await self.db.execute(like_q)).scalar_one_or_none()
        if like_row is None:
            # Never liked → no-op.
            return post

        await self.db.delete(like_row)
        await self.db.flush()

        # Atomic counter decrement, but never below 0.
        await self.db.execute(
            update(BenderPost)
            .where(BenderPost.id == post.id, BenderPost.like_count > 0)
            .values(like_count=BenderPost.like_count - 1)
        )
        await self.db.flush()
        await self.db.refresh(post)
        return post

    # ------------------------------------------------------------------
    # comments
    # ------------------------------------------------------------------

    async def list_comments(
        self,
        post_id: UUID,
        cursor: str | None,
        limit: int,
        tenant_id: UUID | None,
        current_user: User | None,
    ) -> tuple[list[BenderCommentResponse], str | None, bool]:
        """Comments listed ASC by created_at, id (oldest first).

        Different from the feed: a chat-style ascending order. Cursor still
        keyed on (created_at, id) but the comparison flips.
        """
        # Ensure post exists; gives a clean 404 vs. silent empty list.
        await self._get_visible_post_or_404(post_id, tenant_id)

        query = (
            select(BenderComment)
            .options(selectinload(BenderComment.user))
            .where(BenderComment.post_id == post_id)
        )

        if cursor:
            cursor_data = decode_cursor(cursor)
            if "created_at" in cursor_data:
                cursor_time = datetime.fromisoformat(cursor_data["created_at"])
                cursor_id_raw = cursor_data.get("id", "")
                try:
                    cursor_id = UUID(cursor_id_raw)
                except (ValueError, AttributeError):
                    cursor_id = None
                if cursor_id is not None:
                    query = query.where(
                        or_(
                            BenderComment.created_at > cursor_time,
                            and_(
                                BenderComment.created_at == cursor_time,
                                BenderComment.id > cursor_id,
                            ),
                        )
                    )
                else:
                    query = query.where(BenderComment.created_at > cursor_time)

        query = query.order_by(BenderComment.created_at.asc(), BenderComment.id.asc())
        query = query.limit(limit + 1)

        result = await self.db.execute(query)
        rows = list(result.scalars().unique().all())

        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]

        ids = [c.id for c in rows]
        liked_ids: set[UUID] = set()
        if ids and current_user and (current_user.role == UserRole.SUPER_ADMIN or current_user.tenant_id == tenant_id):
            liked_ids = {x for (x,) in (await self.db.execute(select(BenderCommentLike.comment_id).where(BenderCommentLike.user_id == current_user.id, BenderCommentLike.comment_id.in_(ids)))).all()}
        reply_counts: dict[UUID, int] = {}
        if ids:
            reply_counts = {parent: count for parent, count in (await self.db.execute(select(BenderComment.parent_comment_id, func.count(BenderComment.id)).where(BenderComment.parent_comment_id.in_(ids), BenderComment.deleted_at.is_(None)).group_by(BenderComment.parent_comment_id))).all()}

        items = [
            self._comment_response(c, viewer_liked_ids=liked_ids, reply_counts=reply_counts)
            for c in rows
        ]

        next_cursor = None
        if has_more and rows:
            last = rows[-1]
            next_cursor = encode_cursor({"created_at": last.created_at, "id": last.id})

        return items, next_cursor, has_more

    async def get_comment(self, post_id, comment_id, tenant_id, current_user):
        await self._get_visible_post_or_404(post_id, tenant_id)
        result = await self.db.execute(select(BenderComment).options(selectinload(BenderComment.user)).where(BenderComment.id == comment_id, BenderComment.post_id == post_id))
        comment = result.scalar_one_or_none()
        if comment is None:
            raise NotFoundError("Comment")
        return (await self._comment_rows_response([comment], tenant_id, current_user))[0]

    async def _comment_rows_response(self, rows, tenant_id, current_user):
        ids = [c.id for c in rows]
        liked_ids = set()
        if ids and current_user and (current_user.role == UserRole.SUPER_ADMIN or current_user.tenant_id == tenant_id):
            liked_ids = {x for (x,) in (await self.db.execute(select(BenderCommentLike.comment_id).where(BenderCommentLike.user_id == current_user.id, BenderCommentLike.comment_id.in_(ids)))).all()}
        counts = {parent: count for parent, count in (await self.db.execute(select(BenderComment.parent_comment_id, func.count(BenderComment.id)).where(BenderComment.parent_comment_id.in_(ids), BenderComment.deleted_at.is_(None)).group_by(BenderComment.parent_comment_id))).all()} if ids else {}
        return [self._comment_response(c, viewer_liked_ids=liked_ids, reply_counts=counts) for c in rows]

    async def create_comment(
        self,
        post_id: UUID,
        data: BenderCommentCreate,
        current_user: User,
        tenant_id: UUID | None,
    ) -> BenderCommentResponse:
        post = await self._get_visible_post_or_404(post_id, tenant_id)
        self._bind_tenant(current_user, tenant_id)
        parent = None
        if data.parent_comment_id:
            result = await self.db.execute(select(BenderComment).options(selectinload(BenderComment.user)).where(BenderComment.id == data.parent_comment_id, BenderComment.post_id == post.id).with_for_update())
            parent = result.scalar_one_or_none()
            if parent is None:
                raise NotFoundError("Comment")
            if parent.parent_comment_id is not None:
                raise BusinessRuleViolation("Replies can only target top-level comments")
            if parent.deleted_at is not None:
                raise ConflictError("Cannot reply to a deleted comment")

        comment = BenderComment(
            id=uuid4(),
            post_id=post.id,
            user_id=current_user.id,
            content=data.content.strip(),
            parent_comment_id=parent.id if parent else None,
        )
        self.db.add(comment)
        await self.db.flush()

        await self.db.execute(
            update(BenderPost)
            .where(BenderPost.id == post.id)
            .values(comment_count=BenderPost.comment_count + 1)
        )
        await self.db.flush()
        await self.db.refresh(comment)
        # Preload user for the response builder.
        await self.db.refresh(comment, attribute_names=["user"])
        if parent and parent.user_id != current_user.id:
            display_name = getattr(getattr(current_user, "shop", None), "name", None) or current_user.name
            await NotificationRepository(self.db).create(parent.user_id, NotificationType.BENDER_REPLY, f"{display_name} replied to your comment", comment.content[:240], {"bender_post_id": str(post.id), "bender_parent_comment_id": str(parent.id), "bender_comment_id": str(comment.id)}, tenant_id=post.tenant_id)
        return (await self._comment_rows_response([comment], tenant_id, current_user))[0]

    async def delete_comment(
        self,
        post_id: UUID,
        comment_id: UUID,
        current_user: User,
        tenant_id: UUID | None,
    ) -> None:
        await self._get_visible_post_or_404(post_id, tenant_id)
        self._bind_tenant(current_user, tenant_id)
        result = await self.db.execute(select(BenderComment).where(BenderComment.id == comment_id, BenderComment.post_id == post_id).with_for_update())
        comment = result.scalar_one_or_none()
        if comment is None:
            raise NotFoundError("Comment")
        post = await self._get_visible_post_or_404(comment.post_id, tenant_id)

        is_comment_owner = comment.user_id == current_user.id
        is_post_owner = post.author_user_id == current_user.id
        is_admin = current_user.role == UserRole.SUPER_ADMIN or (
            current_user.role == UserRole.COMMUNITY_ADMIN
            and (current_user.tenant_id is None or post.tenant_id == current_user.tenant_id)
        )
        if not (is_comment_owner or is_post_owner or is_admin):
            raise ForbiddenError("Not allowed to delete this comment")

        if comment.deleted_at is not None:
            return
        reply_count = (await self.db.execute(select(func.count(BenderComment.id)).where(BenderComment.parent_comment_id == comment.id, BenderComment.deleted_at.is_(None)))).scalar_one()
        if comment.parent_comment_id is None and reply_count:
            comment.content = ""
            comment.deleted_at = datetime.utcnow()
            comment.like_count = 0
            await self.db.execute(BenderCommentLike.__table__.delete().where(BenderCommentLike.comment_id == comment.id))
            await self.db.flush()
        else:
            parent_id = comment.parent_comment_id
            await self.db.delete(comment)
            await self.db.flush()
            if parent_id:
                parent = await self.db.get(BenderComment, parent_id)
                if parent and parent.deleted_at is not None:
                    remaining = (await self.db.execute(select(func.count(BenderComment.id)).where(BenderComment.parent_comment_id == parent.id, BenderComment.deleted_at.is_(None)))).scalar_one()
                    if remaining == 0:
                        await self.db.delete(parent)
                        await self.db.flush()
        await self.db.execute(update(BenderPost).where(BenderPost.id == post.id, BenderPost.comment_count > 0).values(comment_count=BenderPost.comment_count - 1))
        await self.db.flush()
