from datetime import datetime
import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError

from app.api.v1.bender import like_comment as api_like_comment
from app.api.v1.bender import unlike_comment as api_unlike_comment
from app.api.v1.bender import router
from app.main import app
from app.core.permissions import get_current_tenant, get_current_user
from app.api.v1.bender import get_service
from app.core.exceptions import ConflictError, NotFoundError
from app.models.bender import BenderComment, BenderCommentLike
from app.models.enums import UserRole
from app.schemas.bender import BenderCommentHeartResponse
from app.services.bender_service import BenderService


def user(*, tenant_id, role=UserRole.INDIVIDUAL):
    return SimpleNamespace(id=uuid4(), tenant_id=tenant_id, role=role, name="Alex", avatar_url=None, shop_id=None)


def post(*, tenant_id):
    author = user(tenant_id=tenant_id)
    return SimpleNamespace(id=uuid4(), tenant_id=tenant_id, author_user_id=author.id, author=author, shop=None)


def comment(*, post_id, author, parent_comment_id=None, deleted_at=None, like_count=0):
    return SimpleNamespace(id=uuid4(), post_id=post_id, user_id=author.id, user=author,
                           parent_comment_id=parent_comment_id, deleted_at=deleted_at,
                           like_count=like_count, content="body", created_at=datetime.utcnow())


class Result:
    def __init__(self, rows=(), value=None): self.rows, self.value = list(rows), value
    def all(self): return self.rows
    def scalar_one_or_none(self): return self.value if self.value is not None else (self.rows[0] if self.rows else None)
    def scalar_one(self): return self.scalar_one_or_none()
    def scalars(self): return self
    def unique(self): return self
    def __iter__(self): return iter(self.rows)


class HeartSession:
    def __init__(self, *, posts=(), comments=(), likes=(), insert_returning=None):
        self.posts = {x.id: x for x in posts}; self.comments = {x.id: x for x in comments}
        self.likes = list(likes); self.insert_returning = insert_returning; self.queries = []; self.insert_sql = []; self.delete_returning_seen = False

    async def flush(self):
        return None
    async def refresh(self, obj, attribute_names=None): pass
    async def delete(self, obj): self.likes.remove(obj)
    async def get(self, model, ident):
        return self.posts.get(ident) if model.__name__ == "BenderPost" else self.comments.get(ident)

    @staticmethod
    def _compile(statement):
        compiled = statement.compile(dialect=postgresql.dialect(), compile_kwargs={"render_postcompile": True})
        return str(compiled).lower(), compiled.params

    @staticmethod
    def _values(params, prefix): return [v for k, v in params.items() if k.startswith(prefix)]

    async def execute(self, statement):
        sql, params = self._compile(statement); self.queries.append(sql)
        if statement.is_insert and "bender_comment_likes" in sql:
            self.insert_sql.append(sql)
            returned_id = None
            if self.insert_returning:
                returned_id = self.insert_returning.pop(0)
            elif not any(x.comment_id == params["comment_id"] and x.user_id == params["user_id"] for x in self.likes):
                returned_id = params["id"]
            if returned_id is not None:
                self.likes.append(BenderCommentLike(id=returned_id, comment_id=params["comment_id"], user_id=params["user_id"]))
                return Result(rows=[(returned_id,)])
            return Result()
        if statement.is_select and "from bender_posts" in sql:
            tids = self._values(params, "tenant_id_"); ids = self._values(params, "id_")
            return Result(rows=[x for x in self.posts.values() if (not tids or x.tenant_id in tids) and (not ids or x.id in ids)])
        if statement.is_select and "from bender_comments" in sql:
            ids = self._values(params, "id_"); pids = self._values(params, "post_id_")
            rows = [x for x in self.comments.values() if (not ids or x.id in ids) and (not pids or x.post_id in pids)]
            if "deleted_at is null" in sql: rows = [x for x in rows if x.deleted_at is None]
            if "count(" in sql:
                grouped = {}
                for x in rows: grouped[x.parent_comment_id] = grouped.get(x.parent_comment_id, 0) + 1
                return Result(rows=list(grouped.items()))
            return Result(rows=rows)
        if statement.is_select and "from bender_comment_likes" in sql:
            ids = self._values(params, "comment_id_"); users = self._values(params, "user_id_")
            rows = [x for x in self.likes if (not ids or x.comment_id in ids) and (not users or x.user_id in users)]
            return Result(rows=[(x.comment_id,) for x in rows]) if "comment_id" in sql and "select bender_comment_likes.id" not in sql else Result(rows=rows)
        if statement.is_update and "update bender_comments" in sql:
            ids = self._values(params, "id_")
            for x in self.comments.values():
                if x.id in ids:
                    if "like_count +" in sql: x.like_count += 1
                    elif "like_count -" in sql and x.like_count > 0: x.like_count -= 1
        if statement.is_delete and "bender_comment_likes" in sql:
            ids = self._values(params, "comment_id_"); users = self._values(params, "user_id_")
            matches = [x for x in self.likes if (not ids or x.comment_id in ids) and (not users or x.user_id in users)]
            self.likes = [x for x in self.likes if x not in matches]
            return Result(rows=[(matches[0].id,)] if "returning" in sql and matches else ())
        return Result()


class ConcurrentHeartSession(HeartSession):
    def __init__(self, *, barrier, **kwargs):
        super().__init__(**kwargs); self.barrier = barrier

    async def execute(self, statement):
        sql, params = self._compile(statement)
        if statement.is_select and "from bender_comment_likes" in sql:
            await self.barrier.wait()
        if statement.is_delete and "bender_comment_likes" in sql:
            await self.barrier.wait()
            ids = self._values(params, "comment_id_"); users = self._values(params, "user_id_")
            matches = [x for x in self.likes if (not ids or x.comment_id in ids) and (not users or x.user_id in users)]
            if "returning" in sql:
                self.delete_returning_seen = True
                if matches:
                    self.likes.remove(matches[0]); return Result(rows=[(matches[0].id,)])
                return Result()
        return await super().execute(statement)


@pytest.mark.asyncio
async def test_heart_and_unheart_are_idempotent_for_top_level_and_reply():
    tenant = uuid4(); actor = user(tenant_id=tenant); target = post(tenant_id=tenant)
    root = comment(post_id=target.id, author=actor); reply = comment(post_id=target.id, author=actor, parent_comment_id=root.id)
    db = HeartSession(posts=[target], comments=[root, reply]); service = BenderService(db)
    for row in (root, reply):
        first = await service.like_comment(target.id, row.id, actor, tenant)
        duplicate = await service.like_comment(target.id, row.id, actor, tenant)
        assert first.like_count == duplicate.like_count == 1 and duplicate.viewer_has_liked is True
        assert len([x for x in db.likes if x.comment_id == row.id]) == 1
        assert (await service.unlike_comment(target.id, row.id, actor, tenant)).viewer_has_liked is False
        again = await service.unlike_comment(target.id, row.id, actor, tenant)
        assert again.like_count == 0 and len(db.likes) == 0


@pytest.mark.asyncio
async def test_deleted_cross_post_and_cross_tenant_comments_are_rejected_without_changes():
    tenant = uuid4(); other_tenant = uuid4(); actor = user(tenant_id=tenant)
    target = post(tenant_id=tenant); other = post(tenant_id=tenant); foreign = post(tenant_id=other_tenant)
    deleted = comment(post_id=target.id, author=actor, deleted_at=datetime.utcnow(), like_count=2)
    wrong_post = comment(post_id=other.id, author=actor); wrong_tenant = comment(post_id=foreign.id, author=actor)
    db = HeartSession(posts=[target, other, foreign], comments=[deleted, wrong_post, wrong_tenant]); service = BenderService(db)
    for p, c, t in ((target, deleted, tenant), (target, wrong_post, tenant), (foreign, wrong_tenant, tenant)):
        with pytest.raises((ConflictError, NotFoundError)): await service.like_comment(p.id, c.id, actor, t)
    assert not db.likes and deleted.like_count == 2


@pytest.mark.asyncio
async def test_heart_routes_require_auth_and_bind_tenant_and_user():
    tenant = SimpleNamespace(id=uuid4()); actor = user(tenant_id=tenant.id); post_id = uuid4(); comment_id = uuid4()
    class Service:
        def __init__(self): self.calls = []
        async def like_comment(self, *args): self.calls.append(("like", args)); return BenderCommentHeartResponse(id=comment_id, like_count=3, viewer_has_liked=True)
        async def unlike_comment(self, *args): self.calls.append(("unlike", args)); return BenderCommentHeartResponse(id=comment_id, like_count=2, viewer_has_liked=False)
    service = Service()
    assert (await api_like_comment(post_id, comment_id, service, actor, tenant)).viewer_has_liked
    assert not (await api_unlike_comment(post_id, comment_id, service, actor, tenant)).viewer_has_liked
    assert service.calls == [("like", (post_id, comment_id, actor, tenant.id)), ("unlike", (post_id, comment_id, actor, tenant.id))]


@pytest.mark.asyncio
async def test_unheart_never_reduces_zero_and_listing_bulk_resolves_viewer_hearts():
    tenant = uuid4(); actor = user(tenant_id=tenant); target = post(tenant_id=tenant)
    first = comment(post_id=target.id, author=actor, like_count=0)
    second = comment(post_id=target.id, author=actor, like_count=1)
    db = HeartSession(posts=[target], comments=[first, second]); service = BenderService(db)
    result = await service.unlike_comment(target.id, first.id, actor, tenant)
    assert result.like_count == 0
    db.likes.append(BenderCommentLike(id=uuid4(), comment_id=second.id, user_id=actor.id))
    db.queries.clear()
    items, _, _ = await service.list_comments(target.id, None, 20, tenant, actor)
    assert {x.id for x in items if x.viewer_has_liked} == {str(second.id)}
    assert sum("from bender_comment_likes" in query for query in db.queries) == 1


def test_heart_routes_are_authenticated_and_have_exact_paths():
    paths = {route.path: route for route in router.routes}
    for path in ("/bender/posts/{post_id}/comments/{comment_id}/like",):
        assert path in paths
        assert paths[path].methods == {"POST", "DELETE"} or paths[path].methods in ({"POST"}, {"DELETE"})
        assert any(getattr(dep.call, "__name__", "") == "get_current_user" for dep in paths[path].dependant.dependencies)


@pytest.mark.asyncio
async def test_concurrent_unhearts_decrement_only_after_conditional_delete_returning():
    tenant = uuid4(); actor = user(tenant_id=tenant); target = post(tenant_id=tenant)
    row = comment(post_id=target.id, author=actor, like_count=1)
    stored = BenderCommentLike(id=uuid4(), comment_id=row.id, user_id=actor.id)
    barrier = asyncio.Barrier(2)
    sessions = [ConcurrentHeartSession(posts=[target], comments=[row], likes=[stored], barrier=barrier) for _ in range(2)]
    sessions[1].likes = sessions[0].likes
    results = await asyncio.gather(*(BenderService(db).unlike_comment(target.id, row.id, actor, tenant) for db in sessions))
    assert all(result.viewer_has_liked is False for result in results)
    assert len(sessions[0].likes) + len(sessions[1].likes) == 0
    assert row.like_count == 0
    assert all(db.delete_returning_seen for db in sessions)


@pytest.mark.asyncio
async def test_duplicate_heart_uses_empty_returning_result_and_authoritative_count():
    """The database-native conflict path returns no id for an existing heart."""
    tenant = uuid4(); actor = user(tenant_id=tenant); target = post(tenant_id=tenant)
    row = comment(post_id=target.id, author=actor, like_count=7)
    stored = BenderCommentLike(id=uuid4(), comment_id=row.id, user_id=actor.id)
    db = HeartSession(posts=[target], comments=[row], likes=[stored], insert_returning=[None])
    response = await BenderService(db).like_comment(target.id, row.id, actor, tenant)
    assert response.like_count == 7
    assert response.viewer_has_liked is True
    assert row.like_count == 7
    assert len(db.likes) == 1


@pytest.mark.asyncio
async def test_heart_insert_returning_id_increments_once():
    tenant = uuid4(); actor = user(tenant_id=tenant); target = post(tenant_id=tenant)
    row = comment(post_id=target.id, author=actor)
    inserted_id = uuid4()
    db = HeartSession(posts=[target], comments=[row], insert_returning=[inserted_id])
    response = await BenderService(db).like_comment(target.id, row.id, actor, tenant)
    assert response.like_count == 1
    assert [like.id for like in db.likes] == [inserted_id]


@pytest.mark.asyncio
async def test_heart_insert_uses_named_postgresql_conflict_and_returning_clause():
    tenant = uuid4(); actor = user(tenant_id=tenant); target = post(tenant_id=tenant)
    row = comment(post_id=target.id, author=actor)
    db = HeartSession(posts=[target], comments=[row], insert_returning=[uuid4()])

    await BenderService(db).like_comment(target.id, row.id, actor, tenant)
    sql = db.insert_sql[0]
    assert "on conflict (comment_id, user_id) do nothing" in sql
    assert "returning bender_comment_likes.id" in sql


@pytest.mark.asyncio
async def test_heart_and_unheart_lock_live_comment_rows_and_propagate_other_integrity_errors():
    """Only PostgreSQL's ON CONFLICT handles duplicate hearts; other errors escape."""
    tenant = uuid4(); actor = user(tenant_id=tenant); target = post(tenant_id=tenant)
    row = comment(post_id=target.id, author=actor)

    class ForeignKeyFailureSession(HeartSession):
        async def execute(self, statement):
            sql, _ = self._compile(statement)
            if statement.is_insert and "bender_comment_likes" in sql:
                raise IntegrityError("insert", {}, Exception("foreign key violation"))
            return await super().execute(statement)

    failing = ForeignKeyFailureSession(posts=[target], comments=[row])
    with pytest.raises(IntegrityError, match="insert"):
        await BenderService(failing).like_comment(target.id, row.id, actor, tenant)

    db = HeartSession(posts=[target], comments=[row])
    await BenderService(db).like_comment(target.id, row.id, actor, tenant)
    await BenderService(db).unlike_comment(target.id, row.id, actor, tenant)
    locks = [query for query in db.queries if "from bender_comments" in query and "for update" in query]
    assert len(locks) >= 2


def test_heart_http_routes_require_auth_and_serialize_exact_shape():
    post_id, comment_id = uuid4(), uuid4()
    test_app = FastAPI(); test_app.include_router(router, prefix="/api/v1")
    unauth_post = TestClient(test_app).post(f"/api/v1/bender/posts/{post_id}/comments/{comment_id}/like")
    unauth_delete = TestClient(test_app).delete(f"/api/v1/bender/posts/{post_id}/comments/{comment_id}/like")
    assert unauth_post.status_code == unauth_delete.status_code == 401
    tenant = SimpleNamespace(id=uuid4()); actor = user(tenant_id=tenant.id)
    class Service:
        async def like_comment(self, post, comment, current_user, tenant_id):
            assert (post, comment, current_user, tenant_id) == (post_id, comment_id, actor, tenant.id)
            return {"id": comment_id, "like_count": 3, "viewer_has_liked": True}
        async def unlike_comment(self, post, comment, current_user, tenant_id):
            assert (post, comment, current_user, tenant_id) == (post_id, comment_id, actor, tenant.id)
            return {"id": comment_id, "like_count": 2, "viewer_has_liked": False}
    test_app.dependency_overrides.update({get_service: lambda: Service(), get_current_user: lambda: actor, get_current_tenant: lambda: tenant})
    try:
        client = TestClient(test_app)
        for response, expected in ((client.post(f"/api/v1/bender/posts/{post_id}/comments/{comment_id}/like"), True), (client.delete(f"/api/v1/bender/posts/{post_id}/comments/{comment_id}/like"), False)):
            assert response.status_code == 200
            assert response.json() == {"id": str(comment_id), "like_count": 3 if expected else 2, "viewer_has_liked": expected}
    finally:
        test_app.dependency_overrides.clear()
