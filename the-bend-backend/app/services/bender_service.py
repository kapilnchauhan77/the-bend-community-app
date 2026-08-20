from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import ValidationError as PydanticValidationError
from redis.exceptions import RedisError
from sqlalchemy import and_, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.pagination import decode_cursor, encode_cursor
from app.models.bender import BenderComment, BenderLike, BenderPost
from app.models.enums import UserRole
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
    ):
        self.db = db
        self.link_preview_store = link_preview_store

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

    def _is_community_admin(self, user: User) -> bool:
        return user.role in (UserRole.COMMUNITY_ADMIN, UserRole.SUPER_ADMIN)

    @staticmethod
    def _preview_block(value: dict[str, object] | None) -> BenderLinkPreview | None:
        if value is None:
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
                snapshot = await self.link_preview_store.resolve_draft(
                    data.preview_token,
                    user_id=current_user.id,
                    tenant_id=current_user.tenant_id,
                    caption=caption,
                )
            except RedisError:
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

    async def like(self, post_id: UUID, current_user: User) -> BenderPost:
        """Idempotent like.

        Strategy: try to insert; if (post_id, user_id) collides on the
        unique index, that's the second-press case — we swallow the error
        and return without bumping the count. Counter bump is an atomic
        UPDATE so concurrent likers can't lose increments.
        """
        post = await self._get_post_or_404(post_id)

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

    async def unlike(self, post_id: UUID, current_user: User) -> BenderPost:
        """Idempotent unlike."""
        post = await self._get_post_or_404(post_id)

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
    ) -> tuple[list[BenderCommentResponse], str | None, bool]:
        """Comments listed ASC by created_at, id (oldest first).

        Different from the feed: a chat-style ascending order. Cursor still
        keyed on (created_at, id) but the comparison flips.
        """
        # Ensure post exists; gives a clean 404 vs. silent empty list.
        await self._get_post_or_404(post_id)

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

        items = [
            BenderCommentResponse(
                id=str(c.id),
                author=self._author_block(c.user, None),
                content=c.content,
                created_at=c.created_at,
            )
            for c in rows
        ]

        next_cursor = None
        if has_more and rows:
            last = rows[-1]
            next_cursor = encode_cursor({"created_at": last.created_at, "id": last.id})

        return items, next_cursor, has_more

    async def create_comment(
        self,
        post_id: UUID,
        data: BenderCommentCreate,
        current_user: User,
    ) -> BenderComment:
        post = await self._get_post_or_404(post_id)

        comment = BenderComment(
            id=uuid4(),
            post_id=post.id,
            user_id=current_user.id,
            content=data.content.strip(),
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
        return comment

    async def delete_comment(
        self,
        comment_id: UUID,
        current_user: User,
    ) -> None:
        comment = await self.db.get(BenderComment, comment_id)
        if comment is None:
            raise NotFoundError("Comment")
        post = await self._get_post_or_404(comment.post_id)

        is_comment_owner = comment.user_id == current_user.id
        is_post_owner = post.author_user_id == current_user.id
        is_admin = self._is_community_admin(current_user) and (
            current_user.tenant_id is None or post.tenant_id == current_user.tenant_id
        )
        if not (is_comment_owner or is_post_owner or is_admin):
            raise ForbiddenError("Not allowed to delete this comment")

        await self.db.delete(comment)
        await self.db.flush()

        await self.db.execute(
            update(BenderPost)
            .where(BenderPost.id == post.id, BenderPost.comment_count > 0)
            .values(comment_count=BenderPost.comment_count - 1)
        )
        await self.db.flush()
