# Bender Comment Replies and Hearts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-level replies and simple heart reactions to Bender comments, preserve replies under deleted-parent tombstones, notify parent authors about replies, and open the exact reply from a notification.

**Architecture:** Extend `BenderComment` with a nullable self-reference, tombstone state, and cached heart count. Store one heart per user in a separate table. Keep comment pagination flat and chronological at the API boundary, then group replies in a focused frontend drawer component. Apply the current tenant to every post and comment read or mutation. Use one service transaction for reply creation, count updates, and reply notifications. Add direct post and comment reads for notification deep links.

**Tech Stack:** FastAPI, Pydantic 2, SQLAlchemy async, Alembic, PostgreSQL, React 18, TypeScript, Vite, Tailwind CSS, Axios, Pytest, and Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-bender-comment-replies-and-hearts-design.md`

## Global Constraints

- Keep replies to exactly one level. A reply can never be a parent.
- Use one simple heart reaction. Hearts do not create notifications.
- Notify only when a user replies to another user's top-level comment.
- Keep replies when a parent is deleted and return the exact tombstone text `Comment deleted`.
- Preserve existing top-level comment requests, flat cursor pagination, post likes, link previews, and older clients.
- Apply the current tenant to every direct post read, comment read, create, heart, unheart, and delete operation. Invisible cross-tenant resources return `404`.
- Keep optimistic frontend changes reversible to the exact previous state.
- Do not deploy in this plan. Deployment requires a separate explicit request.
- Preserve unrelated worktree changes. Check `git status --short` before every commit.
- Run backend commands from `the-bend-backend` and frontend commands from `the-bend-frontend`.
- Use `.venv/bin/pytest` for backend tests so verification does not rewrite `uv.lock` interpreter metadata.
- Every implementation task begins with a failing test and ends with a focused commit.

## File Map

### Create

| File | Purpose |
| --- | --- |
| `the-bend-backend/alembic/versions/bender_comment_threads.py` | Add comment parent, deletion, heart-count fields, reply index, and comment-heart table. |
| `the-bend-backend/alembic/versions/bender_reply_notification.py` | Add `BENDER_REPLY` to the PostgreSQL notification enum. |
| `the-bend-backend/tests/test_bender_comment_migrations.py` | Prove migration structure, ordering, constraints, defaults, and enum SQL. |
| `the-bend-backend/tests/test_bender_comment_schema.py` | Prove request compatibility and additive response contracts. |
| `the-bend-backend/tests/test_bender_comment_threads.py` | Prove reply rules, direct reads, notifications, visibility, deletion, and counters. |
| `the-bend-backend/tests/test_bender_comment_hearts.py` | Prove idempotent heart behavior, deleted-comment conflicts, visibility, and bulk viewer state. |
| `the-bend-frontend/src/components/features/bender/BenderCommentsDrawer.tsx` | Own comment loading, grouping, replies, hearts, deletion, optimistic state, and focus behavior. |
| `the-bend-frontend/e2e/bender-comment-threads.spec.ts` | Prove desktop and mobile reply, heart, deletion, rollback, signed-out, and containment behavior. |
| `the-bend-frontend/e2e/bender-comment-deep-links.spec.ts` | Prove notification routing, direct post and comment loading, open, scroll, highlight, and missing-target fallback. |

### Modify

| File | Change |
| --- | --- |
| `the-bend-backend/app/models/bender.py` | Add comment self-reference, tombstone fields, heart relationship, and `BenderCommentLike`. |
| `the-bend-backend/app/models/__init__.py` | Export `BenderCommentLike`. |
| `the-bend-backend/app/models/enums.py` | Add `NotificationType.BENDER_REPLY`. |
| `the-bend-backend/app/schemas/bender.py` | Add reply input, additive comment fields, and heart response schema. |
| `the-bend-backend/app/services/bender_service.py` | Add tenant-safe direct reads, reply creation, response hydration, hearts, tombstone deletion, and notification writes. |
| `the-bend-backend/app/api/v1/bender.py` | Bind tenant and optional viewer dependencies and expose direct post, direct comment, reply, heart, and delete contracts. |
| `the-bend-backend/app/repositories/notification_repo.py` | Let same-session callers persist `tenant_id` with a notification. |
| `the-bend-backend/app/services/notification_service.py` | Preserve existing callers while forwarding optional `tenant_id`. |
| `the-bend-frontend/src/types/index.ts` | Add comment thread, tombstone, and heart fields. |
| `the-bend-frontend/src/services/benderApi.ts` | Add direct reads, optional parent creation, and heart endpoints. |
| `the-bend-frontend/src/pages/BenderPage.tsx` | Replace the inline drawer, load a missing deep-linked post, and pass comment focus state. |
| `the-bend-frontend/src/pages/NotificationsPage.tsx` | Route Bender reply notifications to the exact reply. |
| `the-bend-frontend/e2e/bender-link-previews.spec.ts` | Extend the comment fixture with additive fields so the existing regression remains representative. |

---

## Task 1: Add persistence and shared contracts

**Files:**

- Create: `the-bend-backend/alembic/versions/bender_comment_threads.py`
- Create: `the-bend-backend/alembic/versions/bender_reply_notification.py`
- Create: `the-bend-backend/tests/test_bender_comment_migrations.py`
- Create: `the-bend-backend/tests/test_bender_comment_schema.py`
- Modify: `the-bend-backend/app/models/bender.py`
- Modify: `the-bend-backend/app/models/__init__.py`
- Modify: `the-bend-backend/app/models/enums.py`
- Modify: `the-bend-backend/app/schemas/bender.py`

### Contract to implement

```python
class BenderCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)
    parent_comment_id: UUID | None = None


class BenderCommentResponse(BaseModel):
    id: str
    author: BenderAuthor
    content: str
    created_at: datetime
    parent_comment_id: str | None = None
    reply_count: int = 0
    like_count: int = 0
    viewer_has_liked: bool = False
    is_deleted: bool = False


class BenderCommentHeartResponse(BaseModel):
    id: str
    like_count: int
    viewer_has_liked: bool
```

```python
class BenderComment(Base):
    parent_comment_id: Mapped[uuid.UUID | None]
    like_count: Mapped[int]
    deleted_at: Mapped[datetime | None]
    parent: Mapped["BenderComment | None"]
    replies: Mapped[list["BenderComment"]]
    likes: Mapped[list["BenderCommentLike"]]


class BenderCommentLike(Base):
    __tablename__ = "bender_comment_likes"
    id: Mapped[uuid.UUID]
    comment_id: Mapped[uuid.UUID]
    user_id: Mapped[uuid.UUID]
    created_at: Mapped[datetime]
```

- [ ] **Step 1: Write migration tests that fail before the revisions exist**

Add import-by-path tests that call each migration with monkeypatched Alembic operations. Assert all of these exact contracts:

```python
def test_comment_threads_revision_extends_current_head():
    migration = _load("bender_comment_threads.py")
    assert migration.revision == "bender_comment_threads"
    assert migration.down_revision == "rejected_shop_status"


def test_reply_notification_revision_follows_comment_schema():
    migration = _load("bender_reply_notification.py")
    assert migration.revision == "bender_reply_notification"
    assert migration.down_revision == "bender_comment_threads"
```

The first migration test must also capture and assert:

- `parent_comment_id` is nullable and references `bender_comments.id` with `ON DELETE CASCADE`.
- `like_count` is non-null with server default `0`.
- `deleted_at` is nullable.
- `idx_bender_comments_parent_created` covers `parent_comment_id, created_at` in that order.
- `bender_comment_likes` contains UUID primary key, comment and user cascade foreign keys, and non-null `created_at`.
- `uq_bender_comment_likes_comment_user` is unique over `comment_id, user_id`.
- Downgrade removes the likes table and new comment fields without deleting existing comments first.

The enum revision test must capture SQL and assert:

```python
assert statements == [
    "COMMIT",
    "ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'BENDER_REPLY'",
    "BEGIN",
]
```

- [ ] **Step 2: Run the migration tests and verify the missing-file failure**

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_bender_comment_migrations.py
```

Expected: failure because both migration modules do not exist.

- [ ] **Step 3: Write schema tests that fail on the missing fields**

Add focused tests proving old and new clients are compatible:

```python
def test_top_level_comment_request_remains_valid():
    payload = BenderCommentCreate.model_validate({"content": "Hello"})
    assert payload.content == "Hello"
    assert payload.parent_comment_id is None


def test_reply_request_accepts_parent_uuid():
    parent_id = uuid4()
    payload = BenderCommentCreate.model_validate(
        {"content": "Reply", "parent_comment_id": str(parent_id)}
    )
    assert payload.parent_comment_id == parent_id


def test_comment_response_defaults_keep_older_builders_valid():
    response = BenderCommentResponse(
        id=uuid4(),
        author=_author(),
        content="Hello",
        created_at=datetime.utcnow(),
    )
    assert response.parent_comment_id is None
    assert response.reply_count == 0
    assert response.like_count == 0
    assert response.viewer_has_liked is False
    assert response.is_deleted is False
```

Also assert UUID stringification for `id` and `parent_comment_id`, and exact serialization of `BenderCommentHeartResponse`.

- [ ] **Step 4: Run the schema tests and verify field failures**

```bash
.venv/bin/pytest -q tests/test_bender_comment_schema.py
```

Expected: failure because reply, heart, and deletion fields are absent.

- [ ] **Step 5: Implement both migrations**

In `bender_comment_threads.py`:

```python
revision = "bender_comment_threads"
down_revision = "rejected_shop_status"


def upgrade() -> None:
    op.add_column(
        "bender_comments",
        sa.Column(
            "parent_comment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bender_comments.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column(
        "bender_comments",
        sa.Column("like_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.add_column(
        "bender_comments",
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "idx_bender_comments_parent_created",
        "bender_comments",
        ["parent_comment_id", "created_at"],
    )
    op.create_table(
        "bender_comment_likes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "comment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bender_comments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "uq_bender_comment_likes_comment_user",
        "bender_comment_likes",
        ["comment_id", "user_id"],
        unique=True,
    )
```

In `bender_reply_notification.py`, use the repository's established PostgreSQL enum pattern:

```python
revision = "bender_reply_notification"
down_revision = "bender_comment_threads"


def upgrade() -> None:
    op.execute("COMMIT")
    op.execute(
        "ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'BENDER_REPLY'"
    )
    op.execute("BEGIN")


def downgrade() -> None:
    pass
```

- [ ] **Step 6: Implement ORM and schema contracts**

Add self-referential relationships with `remote_side`, export `BenderCommentLike`, add `NotificationType.BENDER_REPLY = "bender_reply"`, and add the Pydantic contracts above. Keep `content` non-null in storage. A tombstone erases it by storing an empty string and exposes `Comment deleted` only through response construction.

- [ ] **Step 7: Run focused contract tests and migration-head validation**

```bash
.venv/bin/pytest -q \
  tests/test_bender_comment_migrations.py \
  tests/test_bender_comment_schema.py
.venv/bin/alembic heads
```

Expected:

- Both test files pass.
- Alembic prints exactly one head: `bender_reply_notification (head)`.

- [ ] **Step 8: Run model import and formatting checks**

```bash
.venv/bin/python -c "from app.models import BenderCommentLike; from app.schemas.bender import BenderCommentHeartResponse"
git diff --check
```

- [ ] **Step 9: Commit Task 1**

```bash
git status --short
git add \
  the-bend-backend/alembic/versions/bender_comment_threads.py \
  the-bend-backend/alembic/versions/bender_reply_notification.py \
  the-bend-backend/tests/test_bender_comment_migrations.py \
  the-bend-backend/tests/test_bender_comment_schema.py \
  the-bend-backend/app/models/bender.py \
  the-bend-backend/app/models/__init__.py \
  the-bend-backend/app/models/enums.py \
  the-bend-backend/app/schemas/bender.py
git commit -m "feat(bender): add comment thread persistence"
```

---

## Task 2: Implement tenant-safe replies, reads, deletion, and notifications

**Files:**

- Create: `the-bend-backend/tests/test_bender_comment_threads.py`
- Modify: `the-bend-backend/app/services/bender_service.py`
- Modify: `the-bend-backend/app/api/v1/bender.py`
- Modify: `the-bend-backend/app/repositories/notification_repo.py`
- Modify: `the-bend-backend/app/services/notification_service.py`

### Service interfaces to implement

```python
async def get_post(
    self,
    post_id: UUID,
    tenant_id: UUID | None,
    current_user: User | None,
) -> BenderPostResponse: ...

async def list_comments(
    self,
    post_id: UUID,
    cursor: str | None,
    limit: int,
    tenant_id: UUID | None,
    current_user: User | None,
) -> tuple[list[BenderCommentResponse], str | None, bool]: ...

async def get_comment(
    self,
    post_id: UUID,
    comment_id: UUID,
    tenant_id: UUID | None,
    current_user: User | None,
) -> BenderCommentResponse: ...

async def create_comment(
    self,
    post_id: UUID,
    data: BenderCommentCreate,
    current_user: User,
    tenant_id: UUID | None,
) -> BenderCommentResponse: ...

async def delete_comment(
    self,
    post_id: UUID,
    comment_id: UUID,
    current_user: User,
    tenant_id: UUID | None,
) -> None: ...
```

Use one response builder for list, direct read, and create:

```python
def _comment_response(
    self,
    comment: BenderComment,
    *,
    viewer_liked_ids: set[UUID],
    reply_counts: dict[UUID, int],
) -> BenderCommentResponse:
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
```

- [ ] **Step 1: Write failing reply and direct-read tests**

Create service and API tests with recording fakes or async mocks. Cover these exact cases:

1. Existing `{ "content": "Top level" }` creation still creates a top-level comment.
2. A valid reply stores the parent's id and increments `BenderPost.comment_count` once.
3. A parent from another post returns `404 NOT_FOUND`.
4. A post or parent from another tenant returns `404 NOT_FOUND`.
5. A reply to a reply returns `422 BUSINESS_RULE_VIOLATION` with `Replies can only target top-level comments`.
6. A reply to a tombstone returns `409 CONFLICT` with `Cannot reply to a deleted comment`.
7. `GET /posts/{post_id}` returns one visible post and rejects a cross-tenant post.
8. `GET /posts/{post_id}/comments/{comment_id}` returns the additive response and rejects cross-post and cross-tenant ids.
9. Listing returns flat chronological rows, non-deleted direct `reply_count`, and zero `reply_count` on replies.
10. Anonymous listing returns `viewer_has_liked: false`.

The API dependency test must prove tenant and viewer binding, not only service behavior:

```python
assert fake_service.list_calls == [
    {
        "post_id": post_id,
        "cursor": None,
        "limit": 20,
        "tenant_id": tenant.id,
        "current_user": viewer,
    }
]
```

- [ ] **Step 2: Run the thread tests and verify signature and behavior failures**

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_bender_comment_threads.py -k "reply or read or list"
```

Expected: failures because tenant-aware signatures, reply validation, and direct reads do not exist.

- [ ] **Step 3: Add tenant-safe post, comment, and response helpers**

Implement a single visible-post boundary:

```python
async def _get_visible_post_or_404(
    self, post_id: UUID, tenant_id: UUID | None
) -> BenderPost:
    result = await self.db.execute(
        select(BenderPost).where(
            BenderPost.id == post_id,
            BenderPost.tenant_id == tenant_id,
        )
    )
    post = result.scalar_one_or_none()
    if post is None:
        raise NotFoundError("Post")
    return post
```

For authenticated mutations, reject a non-super-admin user whose `current_user.tenant_id` does not equal the resolved tenant id. Return `404`, not `403`, to avoid disclosing a cross-tenant resource. Query a comment with both `comment_id` and `post_id` after resolving the visible post.

Create bulk loaders for:

- Viewer heart ids for all comment ids on the page, skipped for anonymous or tenant-mismatched viewers.
- Non-deleted direct reply counts grouped by `parent_comment_id`.

- [ ] **Step 4: Implement direct post and comment endpoints**

Add these additive routes:

```python
@router.get("/posts/{post_id}", response_model=BenderPostResponse)
async def get_post(
    post_id: UUID,
    service: BenderService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
    viewer: User | None = Depends(get_current_user_optional),
): ...


@router.get(
    "/posts/{post_id}/comments/{comment_id}",
    response_model=BenderCommentResponse,
)
async def get_comment(
    post_id: UUID,
    comment_id: UUID,
    service: BenderService = Depends(get_service),
    tenant: Tenant | None = Depends(get_current_tenant),
    viewer: User | None = Depends(get_current_user_optional),
): ...
```

Update list, create, and delete routes to pass `tenant.id if tenant else None`. Pass the optional viewer to reads and the authenticated user to mutations. Make `create_comment` return `BenderCommentResponse` directly so top-level and reply responses share one builder.

- [ ] **Step 5: Implement reply creation and notification persistence**

Validate the parent inside the same transaction before adding the reply. In order:

1. Resolve the visible post.
2. Bind the current user to the current tenant.
3. Select the parent by both id and post id.
4. Return `404` if absent.
5. Return the documented `422` if `parent_comment_id` is not null.
6. Return the documented `409` if `deleted_at` is not null.
7. Insert the reply.
8. Atomically increment post `comment_count`.
9. If the parent author differs from the current user, create one `Notification` through `NotificationRepository(self.db)` before the service returns.

Extend the repository without breaking existing callers:

```python
async def create(
    self,
    user_id: UUID,
    type: NotificationType,
    title: str,
    body: str,
    data: dict | None = None,
    tenant_id: UUID | None = None,
) -> Notification: ...
```

The notification must use:

```python
type=NotificationType.BENDER_REPLY
title=f"{display_name} replied to your comment"
body=reply.content[:240]
data={
    "bender_post_id": str(post.id),
    "bender_parent_comment_id": str(parent.id),
    "bender_comment_id": str(reply.id),
}
tenant_id=post.tenant_id
```

Use the same shop-name-first display rule as `_author_block`. Do not commit in the repository or service. The request transaction owns commit and rollback.

- [ ] **Step 6: Run reply and notification tests**

```bash
.venv/bin/pytest -q tests/test_bender_comment_threads.py -k "reply or notification or read or list"
```

Expected: all selected tests pass.

- [ ] **Step 7: Write failing deletion tests**

Add tests for:

1. Author, post owner, same-tenant community admin, and super admin authorization.
2. An unrelated user gets `403`.
3. A path whose post id does not match the comment gets `404`.
4. A parent without replies is hard-deleted and decrements the post count once.
5. A parent with replies is not deleted. It stores empty content, sets `deleted_at`, deletes all hearts, sets `like_count` to zero, and decrements the post count once.
6. A tombstone response contains exact `Comment deleted` and never the original content.
7. Repeating an authorized tombstone delete is a no-op and does not change the count.
8. A reply is hard-deleted and decrements the count once.
9. Deleting the final reply below a tombstone also deletes the now-empty tombstone.
10. Concurrent or repeated deletion cannot reduce the post count below zero.

- [ ] **Step 8: Run deletion tests and verify failures**

```bash
.venv/bin/pytest -q tests/test_bender_comment_threads.py -k delete
```

Expected: failures because the current service always hard-deletes and ignores the path's post id.

- [ ] **Step 9: Implement hard-delete and tombstone behavior**

Use a row lock or conditional update so only one request transitions a live comment to deleted state. For a parent, query the number of non-deleted direct replies in the transaction.

- If zero, hard-delete.
- If greater than zero, atomically update only a live parent to `content=""`, `deleted_at=now`, and `like_count=0`, then delete its `BenderCommentLike` rows.
- If already a tombstone and still authorized, return without decrementing.
- If a reply, hard-delete it. If its parent is a tombstone and now has no replies, hard-delete the parent too.
- Decrement `BenderPost.comment_count` only when one non-deleted comment transitions out of the count, using `WHERE comment_count > 0`.

- [ ] **Step 10: Run the full thread test file**

```bash
.venv/bin/pytest -q tests/test_bender_comment_threads.py
git diff --check
```

- [ ] **Step 11: Commit Task 2**

```bash
git status --short
git add \
  the-bend-backend/tests/test_bender_comment_threads.py \
  the-bend-backend/app/services/bender_service.py \
  the-bend-backend/app/api/v1/bender.py \
  the-bend-backend/app/repositories/notification_repo.py \
  the-bend-backend/app/services/notification_service.py
git commit -m "feat(bender): add comment replies and tombstones"
```

---

## Task 3: Implement idempotent comment hearts

**Files:**

- Create: `the-bend-backend/tests/test_bender_comment_hearts.py`
- Modify: `the-bend-backend/app/services/bender_service.py`
- Modify: `the-bend-backend/app/api/v1/bender.py`

### Service interfaces to implement

```python
async def like_comment(
    self,
    post_id: UUID,
    comment_id: UUID,
    current_user: User,
    tenant_id: UUID | None,
) -> BenderCommentHeartResponse: ...

async def unlike_comment(
    self,
    post_id: UUID,
    comment_id: UUID,
    current_user: User,
    tenant_id: UUID | None,
) -> BenderCommentHeartResponse: ...
```

- [ ] **Step 1: Write failing service and API heart tests**

Cover these exact cases:

1. First heart creates one `BenderCommentLike`, increments `like_count` once, and returns `viewer_has_liked: true`.
2. Duplicate heart returns success without another row or count increment.
3. First unheart deletes one row, decrements the count once, and returns `viewer_has_liked: false`.
4. Duplicate unheart returns success without another decrement.
5. A heart and unheart work for both top-level comments and replies.
6. A tombstone heart returns `409 CONFLICT` and changes no data.
7. An invisible, cross-post, or cross-tenant comment returns `404 NOT_FOUND`.
8. Counter updates are atomic and never reduce `like_count` below zero.
9. Listing resolves all viewer heart ids with one bulk query rather than one query per comment.
10. Heart routes require authentication.

The API tests must assert these exact routes and response shape:

```text
POST   /api/v1/bender/posts/{post_id}/comments/{comment_id}/like
DELETE /api/v1/bender/posts/{post_id}/comments/{comment_id}/like
```

```json
{
  "id": "85e66e17-4705-4cdc-89ac-894ba1b67398",
  "like_count": 3,
  "viewer_has_liked": true
}
```

- [ ] **Step 2: Run the tests and verify missing-method failures**

```bash
cd the-bend-backend
.venv/bin/pytest -q tests/test_bender_comment_hearts.py
```

Expected: failures because service methods and routes do not exist.

- [ ] **Step 3: Implement idempotent heart and unheart service methods**

For heart:

1. Resolve the visible post and matching non-deleted comment.
2. Bind the authenticated user to the tenant.
3. Start `begin_nested()` before inserting `BenderCommentLike`.
4. On success, release the savepoint and atomically increment `BenderComment.like_count`.
5. On `IntegrityError`, roll back only the savepoint and treat it as a successful no-op.
6. Refresh or query the authoritative count and return it.

For unheart:

1. Resolve the same boundaries.
2. Select the exact unique row.
3. If missing, return the existing count with `viewer_has_liked: false`.
4. If present, delete it and atomically decrement with `WHERE like_count > 0`.

Do not create notifications in either path.

- [ ] **Step 4: Add authenticated routes**

```python
@router.post(
    "/posts/{post_id}/comments/{comment_id}/like",
    response_model=BenderCommentHeartResponse,
)
async def like_comment(...): ...


@router.delete(
    "/posts/{post_id}/comments/{comment_id}/like",
    response_model=BenderCommentHeartResponse,
)
async def unlike_comment(...): ...
```

Both routes depend on `get_current_user` and `get_current_tenant` and pass both bindings to the service.

- [ ] **Step 5: Run focused and combined backend tests**

```bash
.venv/bin/pytest -q \
  tests/test_bender_comment_hearts.py \
  tests/test_bender_comment_threads.py \
  tests/test_bender_comment_schema.py
git diff --check
```

- [ ] **Step 6: Commit Task 3**

```bash
git status --short
git add \
  the-bend-backend/tests/test_bender_comment_hearts.py \
  the-bend-backend/app/services/bender_service.py \
  the-bend-backend/app/api/v1/bender.py
git commit -m "feat(bender): add comment hearts"
```

---

## Task 4: Build the responsive comment-thread UI

**Files:**

- Create: `the-bend-frontend/src/components/features/bender/BenderCommentsDrawer.tsx`
- Create: `the-bend-frontend/e2e/bender-comment-threads.spec.ts`
- Modify: `the-bend-frontend/src/types/index.ts`
- Modify: `the-bend-frontend/src/services/benderApi.ts`
- Modify: `the-bend-frontend/src/pages/BenderPage.tsx`
- Modify: `the-bend-frontend/e2e/bender-link-previews.spec.ts`

### Frontend contracts to implement

```typescript
export interface BenderComment {
  id: string;
  author: BenderAuthor;
  content: string;
  created_at: string;
  parent_comment_id: string | null;
  reply_count: number;
  like_count: number;
  viewer_has_liked: boolean;
  is_deleted: boolean;
}

export interface BenderCommentHeartResponse {
  id: string;
  like_count: number;
  viewer_has_liked: boolean;
}
```

```typescript
createComment: (postId: string, content: string, parentCommentId?: string) =>
  api.post<BenderComment>(`/bender/posts/${postId}/comments`, {
    content,
    parent_comment_id: parentCommentId ?? null,
  }),

getComment: (postId: string, commentId: string) =>
  api.get<BenderComment>(`/bender/posts/${postId}/comments/${commentId}`),

likeComment: (postId: string, commentId: string) =>
  api.post<BenderCommentHeartResponse>(
    `/bender/posts/${postId}/comments/${commentId}/like`,
  ),

unlikeComment: (postId: string, commentId: string) =>
  api.delete<BenderCommentHeartResponse>(
    `/bender/posts/${postId}/comments/${commentId}/like`,
  ),
```

- [ ] **Step 1: Write failing Playwright thread tests with deterministic API fixtures**

In `bender-comment-threads.spec.ts`, stub tenant, feed, comment list, create, heart, unheart, and delete routes. Use one parent, two replies, one tombstone parent, and one unrelated top-level comment. Add tests for:

1. Replies render directly beneath their parent in oldest-first order.
2. Reply appears only on live top-level comments, never on a reply or tombstone.
3. Selecting Reply shows `Replying to <display name>`, Send Reply, and Cancel beneath that parent.
4. Cancel closes the composer and does not send a request.
5. Enter sends a reply while Shift+Enter does not submit.
6. Optimistic reply appears immediately, increments the post count once, and is replaced by the server row.
7. Failed reply removes the temporary row, restores the exact draft, and restores the post count.
8. Heart and unheart optimistically update a parent and a reply, then use the server response.
9. Failed heart restores both `viewer_has_liked` and `like_count`.
10. Deleting a live parent with replies immediately shows `Comment deleted` and keeps its replies.
11. Failed delete restores the exact prior collection and post count.
12. Signed-out users see counts and comments but no Reply, heart, delete, or composer controls.
13. A 320 px viewport contains every visible comment row, name, body, action, and composer inside the drawer.

Use stable selectors:

```text
data-testid="bender-comments-drawer"
data-testid="bender-comment-{commentId}"
data-testid="bender-comment-replies-{parentId}"
data-testid="bender-reply-composer-{parentId}"
```

- [ ] **Step 2: Run the new Playwright file and verify failures**

```bash
cd the-bend-frontend
PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/bender-comment-threads.spec.ts
```

Expected: failures because reply, heart, tombstone, and responsive thread UI do not exist.

- [ ] **Step 3: Add types and API methods**

Implement the TypeScript contracts above. Add `getPost(postId)` for the deep-link task but do not wire it into the page yet:

```typescript
getPost: (postId: string) =>
  api.get<BenderPost>(`/bender/posts/${postId}`),
```

Update the existing link-preview E2E comment fixture with additive defaults:

```typescript
const comment = {
  id: 'c1',
  author,
  content: 'A comment',
  created_at: '2026-08-20T10:01:00Z',
  parent_comment_id: null,
  reply_count: 0,
  like_count: 0,
  viewer_has_liked: false,
  is_deleted: false,
};
```

- [ ] **Step 4: Extract `BenderCommentsDrawer` without changing behavior**

Move the existing inline drawer from `BenderPage.tsx` to the new component. Move or share only the focused helpers it needs. Keep post cards, post actions, composer, and link previews in `BenderPage.tsx`.

Use this public prop shape:

```typescript
interface BenderCommentsDrawerProps {
  postId: string;
  currentUserId: string | null;
  isCommunityAdmin: boolean;
  onCountChange: (delta: number) => void;
  focusCommentId?: string | null;
}
```

Run the existing link-preview regression immediately after extraction:

```bash
PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/bender-link-previews.spec.ts
```

Expected: pass before adding new behavior.

- [ ] **Step 5: Implement flat-to-thread grouping and presentation**

Derive presentation from the flat API list:

```typescript
const parents = comments.filter((comment) => comment.parent_comment_id === null);
const repliesByParent = comments.reduce<Record<string, BenderComment[]>>(
  (groups, comment) => {
    if (comment.parent_comment_id) {
      (groups[comment.parent_comment_id] ??= []).push(comment);
    }
    return groups;
  },
  {},
);
```

Preserve chronological array order. Render replies under the matching parent with a modest left indent and thread guide. Apply `min-w-0`, `break-words`, and flex wrapping to the author, body, controls, and composer. A tombstone must render exact `Comment deleted` in muted styling and expose neither Reply nor heart.

- [ ] **Step 6: Implement one reply composer and optimistic reply state**

Track one `replyingToId` and reply draft. Creating a reply must:

1. Snapshot the previous comment collection.
2. Insert a complete temporary `BenderComment` with the selected `parent_comment_id`.
3. Increment the parent `reply_count` and post count once.
4. Clear the visible draft and send the API request.
5. Replace the temporary row with the server row on success.
6. Restore the full snapshot, draft, and post count on failure.

Do not render Reply on reply rows or tombstones.

- [ ] **Step 7: Implement optimistic hearts and deletion**

For a heart toggle, snapshot both fields, flip them locally, call the matching endpoint, then replace them with the authoritative response. Restore both snapshot fields on failure.

For delete, snapshot the entire comment array and post count. If a live parent has `reply_count > 0`, convert it locally to:

```typescript
{
  ...comment,
  content: 'Comment deleted',
  like_count: 0,
  viewer_has_liked: false,
  is_deleted: true,
}
```

Otherwise remove it. Preserve its replies. On failure, restore the complete snapshot and count.

- [ ] **Step 8: Run desktop, mobile, build, and regression verification**

```bash
PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/bender-comment-threads.spec.ts
PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/bender-link-previews.spec.ts
npm run build
git diff --check
```

The thread suite itself sets both desktop and 320 px viewports. Do not rely on one viewport for containment proof.

- [ ] **Step 9: Commit Task 4**

```bash
git status --short
git add \
  the-bend-frontend/src/components/features/bender/BenderCommentsDrawer.tsx \
  the-bend-frontend/e2e/bender-comment-threads.spec.ts \
  the-bend-frontend/src/types/index.ts \
  the-bend-frontend/src/services/benderApi.ts \
  the-bend-frontend/src/pages/BenderPage.tsx \
  the-bend-frontend/e2e/bender-link-previews.spec.ts
git commit -m "feat(bender): add comment replies and hearts UI"
```

---

## Task 5: Wire reply notification deep links and run integrated verification

**Files:**

- Create: `the-bend-frontend/e2e/bender-comment-deep-links.spec.ts`
- Modify: `the-bend-frontend/src/pages/BenderPage.tsx`
- Modify: `the-bend-frontend/src/components/features/bender/BenderCommentsDrawer.tsx`
- Modify: `the-bend-frontend/src/pages/NotificationsPage.tsx`

### Deep-link contract

```text
/bender?post={bender_post_id}&comment={bender_comment_id}
```

- [ ] **Step 1: Write failing notification and Bender deep-link tests**

Add tests for:

1. A notification containing `bender_post_id` and `bender_comment_id` navigates to the exact query string above.
2. Bender uses `GET /bender/posts/{post_id}` when the focused post is absent from the first feed page.
3. The focused post is merged once, comments open automatically, and the page does not loop requests.
4. The drawer uses `GET /posts/{post_id}/comments/{comment_id}` when the reply is not in the first comment page.
5. When the target is a reply, the drawer directly loads its parent if the parent is also absent.
6. The target receives `data-testid="bender-comment-focus"`, scrolls into view, and is highlighted for approximately two seconds.
7. A `404` for a deleted or invisible target still opens the post's regular comments without an error page.
8. A `404` for the post leaves the normal feed usable.

- [ ] **Step 2: Run the deep-link suite and verify failures**

```bash
cd the-bend-frontend
PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/bender-comment-deep-links.spec.ts
```

Expected: failures because notification routing, direct loading, automatic drawer opening, and comment focus are absent.

- [ ] **Step 3: Route Bender reply notifications before generic fallbacks**

In `getTargetRoute`, add this before `listing_id`, message, and default handling:

```typescript
if (data.bender_post_id) {
  const params = new URLSearchParams({ post: String(data.bender_post_id) });
  if (data.bender_comment_id) {
    params.set('comment', String(data.bender_comment_id));
  }
  return `/bender?${params.toString()}`;
}
```

Do not route on `bender_parent_comment_id`. It is context for loading the thread, not the selected target.

- [ ] **Step 4: Load and open a missing focused post**

Read both query parameters once:

```typescript
const focusPostId = searchParams.get('post');
const focusCommentId = searchParams.get('comment');
```

When the initial feed request completes and `focusPostId` is absent, call `benderApi.getPost(focusPostId)`. Merge the response only if it is not already present. Track attempted post ids in a ref so rerenders cannot loop. Pass these props to the matching card:

```typescript
forceCommentsOpen={post.id === focusPostId && Boolean(focusCommentId)}
focusCommentId={post.id === focusPostId ? focusCommentId : null}
```

Update `BenderPostCard` so `forceCommentsOpen` opens its drawer through an effect without preventing manual open or close for normal posts.

- [ ] **Step 5: Direct-load and focus a missing comment**

In `BenderCommentsDrawer`, after the first comment page settles:

1. If `focusCommentId` is already present, do not fetch it again.
2. Otherwise call `benderApi.getComment(postId, focusCommentId)`.
3. Merge the target by id.
4. If it has `parent_comment_id` and that parent is absent, call `getComment` for the parent and merge it.
5. After both rows render, call `scrollIntoView({ behavior: 'smooth', block: 'center' })` on `bender-comment-{focusCommentId}`.
6. Apply an accessible temporary highlight for two seconds.
7. Swallow only the expected missing-target response. Keep the ordinary comment list visible.

Use refs for attempted comment ids and timer cleanup on unmount.

- [ ] **Step 6: Run focused deep-link and thread verification**

```bash
PLAYWRIGHT_CHANNEL=chrome npx playwright test \
  e2e/bender-comment-deep-links.spec.ts \
  e2e/bender-comment-threads.spec.ts
```

- [ ] **Step 7: Run full feature regression verification**

Backend:

```bash
cd ../the-bend-backend
.venv/bin/pytest -q \
  tests/test_bender_comment_migrations.py \
  tests/test_bender_comment_schema.py \
  tests/test_bender_comment_threads.py \
  tests/test_bender_comment_hearts.py
.venv/bin/pytest -q
.venv/bin/alembic heads
```

Frontend:

```bash
cd ../the-bend-frontend
PLAYWRIGHT_CHANNEL=chrome npx playwright test \
  e2e/bender-comment-threads.spec.ts \
  e2e/bender-comment-deep-links.spec.ts \
  e2e/bender-link-previews.spec.ts
npm run build
```

Repository:

```bash
cd ..
git diff --check
git status --short
git log --oneline --decorate -6
```

Acceptance evidence must show:

- One Alembic head at `bender_reply_notification`.
- Full backend suite passes.
- All three focused Bender Playwright files pass.
- Frontend production build passes.
- No accidental `uv.lock` change.
- Only files listed in this plan changed.

- [ ] **Step 8: Commit Task 5**

```bash
git status --short
git add \
  the-bend-frontend/e2e/bender-comment-deep-links.spec.ts \
  the-bend-frontend/src/pages/BenderPage.tsx \
  the-bend-frontend/src/components/features/bender/BenderCommentsDrawer.tsx \
  the-bend-frontend/src/pages/NotificationsPage.tsx
git commit -m "feat(bender): open reply notification deep links"
```

## Final Review Gate

Before requesting merge or deployment:

- Review the complete diff from the design-spec commit through Task 5.
- Verify each API route supplies the current tenant and correct viewer or authenticated user.
- Verify no reply-to-reply action is exposed or accepted.
- Verify parent deletion cannot leak original content.
- Verify notification and heart writes share the request transaction and no service commits internally.
- Verify every optimistic failure restores the exact prior values.
- Verify long names and comment text stay within a 320 px drawer.
- Verify the branch contains no deployment change.
- Use the requesting-code-review and verification-before-completion workflows before claiming implementation complete.
