from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.exceptions import BusinessRuleViolation, ConflictError, NotFoundError
from app.models.enums import NotificationType, UserRole
from app.models.bender import BenderComment, BenderCommentLike, BenderPost
from app.schemas.bender import BenderCommentCreate
from app.services.bender_service import BenderService
from app.api.v1.bender import create_comment as api_create_comment, get_comment as api_get_comment, list_comments as api_list_comments, delete_comment
from app.api.v1.bender import get_post as api_get_post


def user(*, tenant_id=None, role=UserRole.INDIVIDUAL):
    return SimpleNamespace(id=uuid4(), tenant_id=tenant_id, role=role, name="Alex", avatar_url=None, shop_id=None)


def comment(*, post_id, author, parent=None, deleted_at=None):
    return SimpleNamespace(id=uuid4(), post_id=post_id, user_id=author.id, user=author,
                           parent_comment_id=parent, content="body", created_at=datetime.utcnow(),
                           like_count=2, deleted_at=deleted_at)


def test_comment_response_hides_tombstone_content():
    service = BenderService(AsyncMock())
    row = comment(post_id=uuid4(), author=user(), deleted_at=datetime.utcnow())
    response = service._comment_response(row, viewer_liked_ids={row.id}, reply_counts={})
    assert response.content == "Comment deleted"
    assert response.like_count == 0
    assert response.viewer_has_liked is False
    assert response.is_deleted is True


@pytest.mark.asyncio
async def test_reply_to_reply_is_rejected():
    tenant = uuid4()
    db = AsyncMock()
    service = BenderService(db)
    post = SimpleNamespace(id=uuid4(), tenant_id=tenant)
    parent = comment(post_id=post.id, author=user(tenant_id=tenant), parent=uuid4())
    service._get_visible_post_or_404 = AsyncMock(return_value=post)
    result = SimpleNamespace(scalar_one_or_none=lambda: parent)
    db.execute.return_value = result
    with pytest.raises(BusinessRuleViolation, match="Replies can only target top-level comments"):
        await service.create_comment(post.id, BenderCommentCreate(content="reply", parent_comment_id=parent.id), user(tenant_id=tenant), tenant)


@pytest.mark.asyncio
async def test_reply_to_deleted_comment_is_rejected():
    tenant = uuid4()
    db = AsyncMock()
    service = BenderService(db)
    post = SimpleNamespace(id=uuid4(), tenant_id=tenant)
    parent = comment(post_id=post.id, author=user(tenant_id=tenant), deleted_at=datetime.utcnow())
    service._get_visible_post_or_404 = AsyncMock(return_value=post)
    result = SimpleNamespace(scalar_one_or_none=lambda: parent)
    db.execute.return_value = result
    with pytest.raises(ConflictError, match="Cannot reply to a deleted comment"):
        await service.create_comment(post.id, BenderCommentCreate(content="reply", parent_comment_id=parent.id), user(tenant_id=tenant), tenant)


@pytest.mark.asyncio
async def test_cross_tenant_post_is_not_visible():
    db = AsyncMock()
    service = BenderService(db)
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=lambda: None)
    with pytest.raises(NotFoundError):
        await service.get_post(uuid4(), uuid4(), None)


class Result:
    def __init__(self, value=None, rows=()):
        self.value, self.rows = value, list(rows)
    def scalar_one_or_none(self): return self.value if self.value is not None else (self.rows[0] if self.rows else None)
    def scalar_one(self): return self.value if self.value is not None else (self.rows[0] if self.rows else None)
    def all(self): return self.rows
    def scalars(self): return self
    def unique(self): return self
    def __iter__(self): return iter(self.rows)


class ReplyDB:
    def __init__(self, parent):
        self.parent, self.added, self.executed, self.calls = parent, [], [], 0
    async def execute(self, statement):
        self.executed.append(statement)
        self.calls += 1
        if self.calls == 1:
            return Result(self.parent)
        return Result()
    def add(self, obj): self.added.append(obj)
    async def flush(self): pass
    async def refresh(self, obj, attribute_names=None):
        if hasattr(obj, "user"): obj.user = self.parent.user


class CommentStoreSession:
    """Small stateful SQLAlchemy double used to test real service transitions."""
    def __init__(self, posts=(), comments=(), likes=()):
        self.posts = {p.id: p for p in posts}; self.comments = {c.id: c for c in comments}
        self.likes = list(likes); self.notifications = []; self.deleted_ids = []; self.counter_updates = []
    def add(self, obj):
        if isinstance(obj, BenderComment) or hasattr(obj, "parent_comment_id"): self.comments[obj.id] = obj
        elif obj.__class__.__name__ == "Notification": self.notifications.append(obj)
    async def flush(self): pass
    async def refresh(self, obj, attribute_names=None): pass
    async def get(self, model, ident): return self.comments.get(ident) if model is BenderComment else self.posts.get(ident)
    async def delete(self, obj): self.deleted_ids.append(obj.id); self.comments.pop(obj.id, None)
    async def execute(self, statement):
        text = str(statement); params = {str(v) for v in getattr(statement, "_where_criteria", ()) for v in (getattr(v, "right", None),) if v is not None}
        if statement.is_select:
            if self.comments and "count(" not in text.lower():
                first = next(iter(self.comments.values()))
                return Result(first, [first])
            if "bender_comment_likes" in text:
                ids = [c for c in self.likes if c.user_id in params]
                return Result(rows=[(x.comment_id,) for x in ids])
            if "bender_comments" in text:
                rows = list(self.comments.values())
                rows = [c for c in rows if c.id in {x.id for x in rows}]
                if "parent_comment_id" in text and "count" in text.lower():
                    grouped = {}
                    for c in rows:
                        if c.parent_comment_id and c.deleted_at is None: grouped[c.parent_comment_id] = grouped.get(c.parent_comment_id, 0) + 1
                    return Result(rows=list(grouped.items()))
                return Result(rows=rows, value=rows[0] if rows else None)
            if "bender_posts" in text:
                return Result(next(iter(self.posts.values()), None))
        if "bender_comment_likes" in text and statement.is_delete:
            target = next(iter(self.comments), None); self.likes = [x for x in self.likes if x.comment_id != target]; return Result()
        if "bender_posts" in text and statement.is_update and "comment_count" in text:
            self.counter_updates.append(statement)
            for p in self.posts.values(): p.comment_count = max(0, p.comment_count - 1)
        return Result()


class DeleteSession(CommentStoreSession):
    async def execute(self, statement):
        text = str(statement)
        if statement.is_select and "count(" in text.lower():
            live = sum(1 for c in self.comments.values() if c.parent_comment_id is not None and c.deleted_at is None)
            return Result(live)
        return await super().execute(statement)


@pytest.mark.asyncio
async def test_delete_authorization_and_tombstone_state_are_behavioral():
    tenant = uuid4(); post = SimpleNamespace(id=uuid4(), tenant_id=tenant, author_user_id=uuid4(), comment_count=2)
    author = user(tenant_id=tenant); reply_author = user(tenant_id=tenant)
    parent = comment(post_id=post.id, author=author); reply = comment(post_id=post.id, author=reply_author, parent=parent.id)
    db = DeleteSession(posts=[post], comments=[parent, reply]); service = BenderService(db)
    service._get_visible_post_or_404 = AsyncMock(return_value=post)
    await service.delete_comment(post.id, parent.id, author, tenant)
    assert parent.content == "" and parent.deleted_at is not None and parent.like_count == 0
    assert reply.id in db.comments and len(db.counter_updates) == 1
    await service.delete_comment(post.id, parent.id, author, tenant)
    assert len(db.counter_updates) == 1


@pytest.mark.asyncio
async def test_delete_cross_tenant_returns_not_found_before_authorization():
    db = CommentStoreSession(); service = BenderService(db)
    service._get_visible_post_or_404 = AsyncMock(side_effect=NotFoundError("Post"))
    with pytest.raises(NotFoundError):
        await service.delete_comment(uuid4(), uuid4(), user(tenant_id=uuid4()), uuid4())


@pytest.mark.asyncio
async def test_valid_reply_persists_parent_count_and_exact_notification(monkeypatch):
    tenant = uuid4(); post = SimpleNamespace(id=uuid4(), tenant_id=tenant, comment_count=4)
    parent_user = user(tenant_id=tenant); actor = user(tenant_id=tenant)
    parent = comment(post_id=post.id, author=parent_user)
    db = CommentStoreSession(comments=[parent]); service = BenderService(db)
    service._get_visible_post_or_404 = AsyncMock(return_value=post)
    service._comment_rows_response = AsyncMock(return_value=[SimpleNamespace(id="reply")])
    response = await service.create_comment(post.id, BenderCommentCreate(content="hello", parent_comment_id=parent.id), actor, tenant)
    reply = next(c for c in db.comments.values() if c.id != parent.id)
    assert response.id == "reply"
    assert reply.parent_comment_id == parent.id
    assert len(db.counter_updates) == 1
    assert len(db.notifications) == 1
    notification = db.notifications[0]
    assert (notification.user_id, notification.type, notification.title, notification.body) == (parent_user.id, NotificationType.BENDER_REPLY, "Alex replied to your comment", "hello")
    assert notification.data == {"bender_post_id": str(post.id), "bender_parent_comment_id": str(parent.id), "bender_comment_id": str(reply.id)}
    assert notification.tenant_id == tenant


@pytest.mark.asyncio
async def test_self_reply_does_not_notify(monkeypatch):
    tenant = uuid4(); post = SimpleNamespace(id=uuid4(), tenant_id=tenant, comment_count=1)
    actor = user(tenant_id=tenant); parent = comment(post_id=post.id, author=actor)
    db = CommentStoreSession(comments=[parent]); service = BenderService(db)
    service._get_visible_post_or_404 = AsyncMock(return_value=post)
    service._comment_rows_response = AsyncMock(return_value=[SimpleNamespace(id="reply")])
    await service.create_comment(post.id, BenderCommentCreate(content="self", parent_comment_id=parent.id), actor, tenant)
    assert db.notifications == []


@pytest.mark.asyncio
async def test_direct_read_rejects_comment_from_another_post():
    tenant = uuid4(); db = ReplyDB(None); service = BenderService(db)
    service._get_visible_post_or_404 = AsyncMock(return_value=SimpleNamespace(id=uuid4(), tenant_id=tenant))
    db.execute = AsyncMock(return_value=Result(None))
    with pytest.raises(NotFoundError):
        await service.get_comment(uuid4(), uuid4(), tenant, None)


@pytest.mark.asyncio
async def test_list_counts_only_live_direct_replies_and_anonymous_is_unliked():
    tenant = uuid4(); post_id = uuid4(); author = user(tenant_id=tenant)
    parent = comment(post_id=post_id, author=author); reply = comment(post_id=post_id, author=author, parent=parent.id)
    db = AsyncMock(); service = BenderService(db)
    service._get_visible_post_or_404 = AsyncMock(return_value=SimpleNamespace(id=post_id, tenant_id=tenant))
    db.execute.side_effect = [Result(rows=[parent, reply]), Result(rows=[(parent.id, 1)])]
    items, _, _ = await service.list_comments(post_id, None, 20, tenant, None)
    assert items[0].reply_count == 1
    assert items[1].reply_count == 0
    assert all(item.viewer_has_liked is False for item in items)


@pytest.mark.asyncio
async def test_api_routes_pass_exact_tenant_and_viewer_user_values():
    tenant = SimpleNamespace(id=uuid4()); viewer = user(tenant_id=tenant.id); post_id = uuid4(); comment_id = uuid4()
    class Recording:
        def __init__(self): self.calls = []
        async def list_comments(self, **kwargs): self.calls.append(("list", kwargs)); return [], None, False
        async def create_comment(self, *args): self.calls.append(("create", args)); return {"id": str(comment_id)}
        async def get_post(self, *args): self.calls.append(("post", args)); return {"id": str(post_id)}
        async def get_comment(self, *args): self.calls.append(("comment", args)); return {"id": str(comment_id)}
        async def delete_comment(self, *args): self.calls.append(("delete", args))
    service = Recording()
    await api_list_comments(post_id, None, 20, service, tenant, viewer)
    await api_create_comment(post_id, BenderCommentCreate(content="x"), service, viewer, tenant)
    await api_get_post(post_id, service, tenant, viewer)
    await api_get_comment(post_id, comment_id, service, tenant, viewer)
    await delete_comment(post_id, comment_id, service, viewer, tenant)
    assert service.calls[0] == ("list", {"post_id": post_id, "cursor": None, "limit": 20, "tenant_id": tenant.id, "current_user": viewer})
    assert service.calls[1][1][2:] == (viewer, tenant.id)
    assert service.calls[2][1] == (post_id, tenant.id, viewer)
    assert service.calls[3][1] == (post_id, comment_id, tenant.id, viewer)
    assert service.calls[4][1] == (post_id, comment_id, viewer, tenant.id)
