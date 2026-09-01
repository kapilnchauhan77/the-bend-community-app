from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.api.v1.bender import (
    create_comment as api_create_comment,
    delete_comment as api_delete_comment,
    get_comment as api_get_comment,
    get_post as api_get_post,
    list_comments as api_list_comments,
)
from app.core.exceptions import BusinessRuleViolation, ConflictError, ForbiddenError, NotFoundError
from app.models.bender import BenderComment
from app.models.enums import NotificationType, UserRole
from app.schemas.bender import BenderCommentCreate
from app.services.bender_service import BenderService


def user(*, tenant_id=None, role=UserRole.INDIVIDUAL, name="Alex"):
    return SimpleNamespace(id=uuid4(), tenant_id=tenant_id, role=role, name=name, avatar_url=None, shop_id=None, shop=None)


def post(*, tenant_id, author=None, comment_count=0):
    author = author or user(tenant_id=tenant_id)
    return SimpleNamespace(id=uuid4(), tenant_id=tenant_id, author_user_id=author.id, author=author, shop=None, comment_count=comment_count, like_count=0, caption=None, media_url=None, media_thumbnail_url=None, media_type=None, link_preview=None, created_at=datetime.utcnow())


def comment(*, post_id, author, parent=None, content="body", deleted_at=None, like_count=2):
    return SimpleNamespace(id=uuid4(), post_id=post_id, user_id=author.id, user=author, parent_comment_id=parent, content=content, created_at=datetime.utcnow(), like_count=like_count, deleted_at=deleted_at)


class Result:
    def __init__(self, value=None, rows=()): self.value, self.rows = value, list(rows)
    def scalar_one_or_none(self): return self.value if self.value is not None else (self.rows[0] if self.rows else None)
    def scalar_one(self): return self.value if self.value is not None else (self.rows[0] if self.rows else None)
    def all(self): return self.rows
    def scalars(self): return self
    def unique(self): return self
    def __iter__(self): return iter(self.rows)


class CommentStoreSession:
    """In-memory SQLAlchemy session that evaluates compiled Bender predicates."""

    def __init__(self, *, posts=(), comments=(), likes=(), users=()):
        self.posts = {row.id: row for row in posts}
        self.comments = {row.id: row for row in comments}
        self.likes = list(likes)
        self.notifications = []
        self.deleted_ids = []
        self.counter_updates = []
        self.users = {row.user.id: row.user for row in comments}
        self.users.update({row.author.id: row.author for row in posts})
        self.users.update({row.id: row for row in users})

    def add(self, obj):
        if isinstance(obj, BenderComment):
            self.comments[obj.id] = obj
        elif obj.__class__.__name__ == "Notification":
            self.notifications.append(obj)

    async def delete(self, obj):
        self.deleted_ids.append(obj.id)
        self.comments.pop(obj.id, None)

    async def get(self, model, ident):
        return self.comments.get(ident) if model is BenderComment else self.posts.get(ident)

    async def flush(self): pass

    async def refresh(self, obj, attribute_names=None):
        if isinstance(obj, BenderComment):
            obj.user = self.users[obj.user_id]
            if obj.created_at is None: obj.created_at = datetime.utcnow()
            if obj.like_count is None: obj.like_count = 0

    @staticmethod
    def _compile(statement):
        compiled = statement.compile(dialect=postgresql.dialect(), compile_kwargs={"render_postcompile": True})
        return str(compiled).lower(), compiled.params

    @staticmethod
    def _values(params, prefix):
        return [value for key, value in params.items() if key.startswith(prefix)]

    async def execute(self, statement):
        sql, params = self._compile(statement)
        if statement.is_select:
            if "from bender_posts" in sql:
                post_ids, tenant_ids = self._values(params, "id_"), self._values(params, "tenant_id_")
                return Result(rows=[row for row in self.posts.values() if (not post_ids or row.id in post_ids) and (not tenant_ids or row.tenant_id in tenant_ids)])
            if "from bender_comment_likes" in sql:
                user_ids, comment_ids = self._values(params, "user_id_"), self._values(params, "comment_id_")
                return Result(rows=[(like.comment_id,) for like in self.likes if (not user_ids or like.user_id in user_ids) and (not comment_ids or like.comment_id in comment_ids)])
            if "from bender_comments" in sql:
                rows = list(self.comments.values())
                comment_ids, post_ids, parent_ids = self._values(params, "id_"), self._values(params, "post_id_"), self._values(params, "parent_comment_id_")
                if comment_ids: rows = [row for row in rows if row.id in comment_ids]
                if post_ids: rows = [row for row in rows if row.post_id in post_ids]
                if parent_ids: rows = [row for row in rows if row.parent_comment_id in parent_ids]
                if "deleted_at is null" in sql: rows = [row for row in rows if row.deleted_at is None]
                if "count(" in sql:
                    if "group by" in sql:
                        grouped = {}
                        for row in rows: grouped[row.parent_comment_id] = grouped.get(row.parent_comment_id, 0) + 1
                        return Result(rows=list(grouped.items()))
                    return Result(value=len(rows))
                return Result(rows=rows)
        if statement.is_delete and "bender_comment_likes" in sql:
            comment_ids = self._values(params, "comment_id_")
            self.likes = [like for like in self.likes if like.comment_id not in comment_ids]
            return Result()
        if statement.is_update and "update bender_posts" in sql and "comment_count" in sql:
            post_ids = self._values(params, "id_")
            amount = self._values(params, "comment_count_")[0]
            delta = -amount if "comment_count -" in sql else amount
            self.counter_updates.append((post_ids, delta))
            for post_id in post_ids: self.posts[post_id].comment_count = max(0, self.posts[post_id].comment_count + delta)
        return Result()


@pytest.mark.asyncio
async def test_valid_reply_stores_requested_parent_increments_once_and_notifies_exactly_once():
    """Would fail if reply creation loses its parent, counter update, or notification payload."""
    tenant = uuid4(); parent_author = user(tenant_id=tenant, name="Parent"); actor = user(tenant_id=tenant, name="Reply author")
    target_post = post(tenant_id=tenant, comment_count=4); requested_parent = comment(post_id=target_post.id, author=parent_author)
    db = CommentStoreSession(posts=[target_post], comments=[requested_parent], users=[actor])
    response = await BenderService(db).create_comment(target_post.id, BenderCommentCreate(content="hello", parent_comment_id=requested_parent.id), actor, tenant)
    replies = [row for row in db.comments.values() if row.parent_comment_id == requested_parent.id]
    assert target_post.comment_count == 5
    assert len(replies) == 1
    assert response.id == str(replies[0].id)
    assert len(db.notifications) == 1
    notification = db.notifications[0]
    assert notification.user_id == parent_author.id
    assert notification.type is NotificationType.BENDER_REPLY
    assert notification.title == "Reply author replied to your comment"
    assert notification.body == "hello"
    assert notification.data == {"bender_post_id": str(target_post.id), "bender_parent_comment_id": str(requested_parent.id), "bender_comment_id": str(replies[0].id)}
    assert notification.tenant_id == tenant


@pytest.mark.asyncio
async def test_self_reply_selects_requested_parent_and_never_notifies():
    """Would fail if the parent SELECT ignores its id or self-replies notify their author."""
    tenant = uuid4(); actor = user(tenant_id=tenant); target_post = post(tenant_id=tenant, comment_count=1)
    decoy_parent = comment(post_id=target_post.id, author=user(tenant_id=tenant)); requested_parent = comment(post_id=target_post.id, author=actor)
    db = CommentStoreSession(posts=[target_post], comments=[decoy_parent, requested_parent])
    await BenderService(db).create_comment(target_post.id, BenderCommentCreate(content="self", parent_comment_id=requested_parent.id), actor, tenant)
    replies = [row for row in db.comments.values() if row.id not in {decoy_parent.id, requested_parent.id}]
    assert len(replies) == 1
    assert replies[0].parent_comment_id == requested_parent.id
    assert db.notifications == []


@pytest.mark.asyncio
async def test_reply_to_reply_is_rejected():
    """Would fail if replies can target another reply."""
    tenant = uuid4(); actor = user(tenant_id=tenant); target_post = post(tenant_id=tenant)
    nested_parent = comment(post_id=target_post.id, author=user(tenant_id=tenant), parent=uuid4())
    db = CommentStoreSession(posts=[target_post], comments=[nested_parent])
    with pytest.raises(BusinessRuleViolation, match="Replies can only target top-level comments"):
        await BenderService(db).create_comment(target_post.id, BenderCommentCreate(content="reply", parent_comment_id=nested_parent.id), actor, tenant)


@pytest.mark.asyncio
async def test_reply_to_deleted_comment_is_rejected():
    """Would fail if replies can target a tombstone."""
    tenant = uuid4(); actor = user(tenant_id=tenant); target_post = post(tenant_id=tenant)
    tombstone = comment(post_id=target_post.id, author=user(tenant_id=tenant), deleted_at=datetime.utcnow())
    db = CommentStoreSession(posts=[target_post], comments=[tombstone])
    with pytest.raises(ConflictError, match="Cannot reply to a deleted comment"):
        await BenderService(db).create_comment(target_post.id, BenderCommentCreate(content="reply", parent_comment_id=tombstone.id), actor, tenant)


@pytest.mark.asyncio
async def test_cross_tenant_post_is_not_visible():
    """Would fail if visible-post reads omit tenant binding."""
    stored_tenant = uuid4(); db = CommentStoreSession(posts=[post(tenant_id=stored_tenant)])
    with pytest.raises(NotFoundError):
        await BenderService(db).get_post(next(iter(db.posts)), uuid4(), None)


@pytest.mark.asyncio
async def test_direct_read_binds_requested_post_and_comment_ids():
    """Would fail if direct reads fetch a comment by id without binding its post id."""
    tenant = uuid4(); post_a = post(tenant_id=tenant); post_b = post(tenant_id=tenant)
    other_post_comment = comment(post_id=post_b.id, author=user(tenant_id=tenant))
    db = CommentStoreSession(posts=[post_a, post_b], comments=[other_post_comment])
    with pytest.raises(NotFoundError): await BenderService(db).get_comment(post_a.id, other_post_comment.id, tenant, None)


@pytest.mark.asyncio
async def test_listing_counts_only_live_direct_replies_and_anonymous_viewer_is_unliked():
    """Would fail if deleted, unrelated, or nested replies affect the parent count."""
    tenant = uuid4(); target_post = post(tenant_id=tenant); author = user(tenant_id=tenant)
    root = comment(post_id=target_post.id, author=author); live_direct = comment(post_id=target_post.id, author=author, parent=root.id)
    deleted_direct = comment(post_id=target_post.id, author=author, parent=root.id, deleted_at=datetime.utcnow())
    other_root = comment(post_id=target_post.id, author=author); unrelated_reply = comment(post_id=target_post.id, author=author, parent=other_root.id)
    nested_fixture = comment(post_id=target_post.id, author=author, parent=live_direct.id)
    db = CommentStoreSession(posts=[target_post], comments=[root, live_direct, deleted_direct, other_root, unrelated_reply, nested_fixture])
    items, _, _ = await BenderService(db).list_comments(target_post.id, None, 20, tenant, None)
    responses = {item.id: item for item in items}
    assert responses[str(root.id)].reply_count == 1
    assert responses[str(other_root.id)].reply_count == 1
    assert responses[str(live_direct.id)].reply_count == 0
    assert responses[str(nested_fixture.id)].reply_count == 0
    assert all(item.viewer_has_liked is False for item in items)


@pytest.mark.asyncio
@pytest.mark.parametrize("actor_kind", ["comment_author", "post_author", "tenant_admin", "super_admin"])
async def test_delete_authorized_actors_hard_delete_live_comment(actor_kind):
    """Would fail if any documented owner or administrator loses delete authorization."""
    tenant = uuid4(); comment_author = user(tenant_id=tenant); post_author = user(tenant_id=tenant)
    target_post = post(tenant_id=tenant, author=post_author, comment_count=1); row = comment(post_id=target_post.id, author=comment_author)
    actors = {"comment_author": comment_author, "post_author": post_author, "tenant_admin": user(tenant_id=tenant, role=UserRole.COMMUNITY_ADMIN), "super_admin": user(tenant_id=uuid4(), role=UserRole.SUPER_ADMIN)}
    db = CommentStoreSession(posts=[target_post], comments=[row])
    await BenderService(db).delete_comment(target_post.id, row.id, actors[actor_kind], tenant)
    assert row.id not in db.comments
    assert target_post.comment_count == 0


@pytest.mark.asyncio
async def test_delete_unrelated_user_is_forbidden():
    """Would fail if deletion accepts an unrelated same-tenant user."""
    tenant = uuid4(); target_post = post(tenant_id=tenant, comment_count=1); row = comment(post_id=target_post.id, author=user(tenant_id=tenant))
    db = CommentStoreSession(posts=[target_post], comments=[row])
    with pytest.raises(ForbiddenError): await BenderService(db).delete_comment(target_post.id, row.id, user(tenant_id=tenant), tenant)
    assert row.id in db.comments
    assert target_post.comment_count == 1


@pytest.mark.asyncio
async def test_parent_with_replies_becomes_tombstone_and_removes_all_hearts():
    """Would fail if parent deletion hard-deletes, leaves hearts, leaks content, or double-counts."""
    tenant = uuid4(); target_post = post(tenant_id=tenant, comment_count=2); author = user(tenant_id=tenant)
    parent = comment(post_id=target_post.id, author=author, content="private", like_count=2); reply = comment(post_id=target_post.id, author=user(tenant_id=tenant), parent=parent.id)
    hearts = [SimpleNamespace(comment_id=parent.id, user_id=user(tenant_id=tenant).id), SimpleNamespace(comment_id=parent.id, user_id=user(tenant_id=tenant).id)]
    db = CommentStoreSession(posts=[target_post], comments=[parent, reply], likes=hearts); service = BenderService(db)
    await service.delete_comment(target_post.id, parent.id, author, tenant)
    tombstone = service._comment_response(parent, viewer_liked_ids={parent.id}, reply_counts={parent.id: 1})
    assert parent.content == ""
    assert parent.deleted_at is not None
    assert parent.like_count == 0
    assert all(heart.comment_id != parent.id for heart in db.likes)
    assert reply.id in db.comments
    assert target_post.comment_count == 1
    assert tombstone.content == "Comment deleted"
    assert tombstone.like_count == 0
    assert tombstone.viewer_has_liked is False


@pytest.mark.asyncio
async def test_deleting_final_reply_removes_tombstone_without_second_count_decrement():
    """Would fail if final-reply cleanup retains the empty parent or decrements twice."""
    tenant = uuid4(); target_post = post(tenant_id=tenant, comment_count=1); author = user(tenant_id=tenant)
    parent = comment(post_id=target_post.id, author=author, deleted_at=datetime.utcnow(), content="", like_count=0); reply = comment(post_id=target_post.id, author=author, parent=parent.id)
    db = CommentStoreSession(posts=[target_post], comments=[parent, reply])
    await BenderService(db).delete_comment(target_post.id, reply.id, author, tenant)
    assert parent.id not in db.comments
    assert reply.id not in db.comments
    assert target_post.comment_count == 0
    assert len(db.counter_updates) == 1


@pytest.mark.asyncio
async def test_repeated_hard_delete_changes_count_once_and_tombstone_repeat_is_a_noop():
    """Would fail if repeated deletion decrements below zero or tombstones transition twice."""
    tenant = uuid4(); author = user(tenant_id=tenant); hard_post = post(tenant_id=tenant, comment_count=1); hard_comment = comment(post_id=hard_post.id, author=author)
    hard_db = CommentStoreSession(posts=[hard_post], comments=[hard_comment]); hard_service = BenderService(hard_db)
    await hard_service.delete_comment(hard_post.id, hard_comment.id, author, tenant)
    with pytest.raises(NotFoundError): await hard_service.delete_comment(hard_post.id, hard_comment.id, author, tenant)
    assert hard_post.comment_count == 0
    assert len(hard_db.counter_updates) == 1
    tombstone_post = post(tenant_id=tenant, comment_count=1); tombstone = comment(post_id=tombstone_post.id, author=author, deleted_at=datetime.utcnow(), content="", like_count=0); live_reply = comment(post_id=tombstone_post.id, author=user(tenant_id=tenant), parent=tombstone.id)
    tombstone_db = CommentStoreSession(posts=[tombstone_post], comments=[tombstone, live_reply]); tombstone_service = BenderService(tombstone_db)
    await tombstone_service.delete_comment(tombstone_post.id, tombstone.id, author, tenant)
    assert tombstone_post.comment_count == 1
    assert len(tombstone_db.counter_updates) == 0


@pytest.mark.asyncio
async def test_api_routes_bind_tenant_and_viewer_or_user():
    tenant = SimpleNamespace(id=uuid4()); viewer = user(tenant_id=tenant.id); post_id = uuid4(); comment_id = uuid4()
    class RecordingService:
        def __init__(self): self.calls = []
        async def list_comments(self, **kwargs): self.calls.append(("list", kwargs)); return [], None, False
        async def create_comment(self, *args): self.calls.append(("create", args)); return {"id": str(comment_id)}
        async def get_post(self, *args): self.calls.append(("post", args)); return {"id": str(post_id)}
        async def get_comment(self, *args): self.calls.append(("comment", args)); return {"id": str(comment_id)}
        async def delete_comment(self, *args): self.calls.append(("delete", args))
    service = RecordingService()
    await api_list_comments(post_id, None, 20, service, tenant, viewer)
    await api_create_comment(post_id, BenderCommentCreate(content="x"), service, viewer, tenant)
    await api_get_post(post_id, service, tenant, viewer)
    await api_get_comment(post_id, comment_id, service, tenant, viewer)
    await api_delete_comment(post_id, comment_id, service, viewer, tenant)
    assert service.calls == [("list", {"post_id": post_id, "cursor": None, "limit": 20, "tenant_id": tenant.id, "current_user": viewer}), ("create", (post_id, BenderCommentCreate(content="x"), viewer, tenant.id)), ("post", (post_id, tenant.id, viewer)), ("comment", (post_id, comment_id, tenant.id, viewer)), ("delete", (post_id, comment_id, viewer, tenant.id))]
