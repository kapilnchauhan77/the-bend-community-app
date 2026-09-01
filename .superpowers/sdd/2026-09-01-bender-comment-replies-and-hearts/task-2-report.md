# Task 2 report

## Implementation

- Added tenant-scoped visible-post resolution for direct post reads, comment listing, direct comment reads, replies, and deletion. Cross-tenant and cross-post resources return `NOT_FOUND`.
- Added one comment response builder. It emits flat chronological rows, direct reply counts, zero reply counts on replies, viewer heart state, and the exact `Comment deleted` tombstone representation.
- Added reply validation for missing parents, nested replies, and deleted parents. Replies increment the post count and create one tenant-scoped `BENDER_REPLY` notification for another user's parent comment.
- Added additive `GET /bender/posts/{post_id}` and `GET /bender/posts/{post_id}/comments/{comment_id}` routes. Existing list, create, and delete routes now pass tenant and viewer context.
- Added hard-delete and tombstone deletion behavior, heart removal, parent cleanup after the final reply, authorization checks, and guarded non-negative count decrements.
- Extended notification repository/service creation with an optional tenant id without breaking existing callers.

## Files changed

- `the-bend-backend/app/services/bender_service.py`
- `the-bend-backend/app/api/v1/bender.py`
- `the-bend-backend/app/repositories/notification_repo.py`
- `the-bend-backend/app/services/notification_service.py`
- `the-bend-backend/tests/test_bender_comment_threads.py`

## TDD evidence

RED command:

```text
cd the-bend-backend
.venv/bin/pytest -q tests/test_bender_comment_threads.py -k "reply or read or list"
ERROR: file or directory not found: tests/test_bender_comment_threads.py
no tests ran
```

After writing the failing contract tests, the initial run failed 3 tests on absent behavior/signature fakes. After implementation, the focused command passed:

```text
.venv/bin/pytest -q tests/test_bender_comment_threads.py
4 passed, 6 warnings in 0.38s
```

Existing comment coverage also passed:

```text
.venv/bin/pytest -q tests/test_bender_comment_schema.py tests/test_bender_comment_migrations.py
8 passed in 0.25s
```

Full backend suite:

```text
.venv/bin/pytest -q
414 passed, 23 warnings in 4.26s
```

## Self-review

`git diff --check` passed. The route-to-service calls carry resolved tenant and viewer/user context. Reads use both post and comment ids. Parent selection uses a row lock, and deletion is idempotent for tombstones. Existing notification callers retain the original positional arguments.

## Concerns

- The focused test file uses recording-light fakes for the new rejection and serialization paths. Database-backed end-to-end deletion/concurrency coverage should be added when the repository's integration database fixture is available.
- Pytest reports deprecation warnings for existing `utcnow` and Starlette constants. They do not fail the suite.

## Fix Round 1

### Changes

- Post like and unlike now resolve the tenant-scoped post and bind the caller before mutation. Their API routes pass the resolved tenant.
- Comment deletion binds the caller to the resolved tenant before authorization, returning `NOT_FOUND` for a mismatched tenant.
- Final reply deletion removes the tombstone without a second post-count decrement. The reply transition performs the only decrement.
- Added focused contract assertions for tenant-aware mutation signatures and API dependency bindings.

### Verification

Focused GREEN:

```text
.venv/bin/pytest -q tests/test_bender_comment_threads.py
7 passed, 6 warnings in 0.72s
```

Task 1 and related Bender tests:

```text
.venv/bin/pytest -q tests/test_bender_post_link_preview.py tests/test_bender_comment_schema.py tests/test_bender_comment_migrations.py
23 passed in 0.45s
```

Full backend suite:

```text
.venv/bin/pytest -q
417 passed, 23 warnings in 5.03s
```

Self-review: `git diff --check` passes. The correction keeps the direct post endpoint and notification tenant field intact. The focused tests still use deterministic fakes for paths without an available integration database fixture.

## Fix Round 2

### Changes

- Replaced source and signature inspection checks with behavioral route and service tests.
- Added stateful reply fake coverage for persisted parent ids, count update SQL, exact tenant-scoped notifications, and no self-notification.
- Added direct cross-post read rejection, live direct reply counts, anonymous viewer state, and exact API argument binding assertions.
- Confirmed final-reply tombstone cleanup performs only the reply count transition. Tenant binding now protects post likes, unlikes, and comment deletion.

### TDD and verification

The new behavioral tests first exposed an incomplete fake result contract during RED. The corrected fake and implementation then produced:

```text
.venv/bin/pytest -q tests/test_bender_comment_threads.py
9 passed, 10 warnings in 0.80s
```

Task 1 and related Bender tests:

```text
.venv/bin/pytest -q tests/test_bender_comment_threads.py tests/test_bender_post_link_preview.py tests/test_bender_comment_schema.py tests/test_bender_comment_migrations.py
32 passed, 10 warnings in 0.80s
```

Full backend suite:

```text
.venv/bin/pytest -q
419 passed, 27 warnings in 3.91s
```

Self-review: behavioral tests no longer inspect production source text. `git diff --check` passes. No `uv.lock` or deployment changes were made. Remaining concern is that full DB-backed authorization and concurrent deletion scenarios still need the unavailable integration fixture.

## Fix Round 3

Added a reusable stateful `CommentStoreSession` test double. It stores posts, comments, likes, notifications, deleted ids, and counter updates, and classifies SQLAlchemy statements by operation and target instead of returning fixed call-order results. Behavioral tests now exercise the real service for exact reply persistence and notification fields, self-reply suppression, cross-post direct reads, live direct reply counts, tenant mismatch deletion, tombstone state, and repeated deletion.

RED: the first stateful-double run failed two valid-reply tests because the fake did not yet return the bound parent row. After fixing the fake's statement-derived SELECT handling, GREEN was:

```text
.venv/bin/pytest -q tests/test_bender_comment_threads.py
11 passed, 13 warnings in 0.84s
```

Full verification:

```text
.venv/bin/pytest -q
421 passed, 30 warnings in 4.35s
```

Self-review: no source-text assertions remain for the replaced contract checks. `git diff --check` passes. No production changes were needed in this round, and no `uv.lock` or deployment files changed. Remaining concern is deprecation warnings from existing and test fixture `utcnow` usage.

## Fix Round 4

### Test design

Replaced the remaining weak thread tests with a stateful `CommentStoreSession`. It compiles each SQLAlchemy statement with the PostgreSQL dialect, identifies the table and operation from compiled SQL, and evaluates bound `id`, `post_id`, `tenant_id`, `parent_comment_id`, `deleted_at`, and comment-heart `user_id` predicates against stored posts, comments, and hearts. It models comment insertion and deletion, relationship refreshes, aggregate reply counts, heart deletion, notifications, and guarded post-counter updates without relying on query order.

The real service now covers valid and self replies, exact notification fields, cross-post direct reads, flat reply counts, all delete roles, unauthorized deletion, tombstones, final-reply cleanup, hard-delete repeats, tombstone no-ops, and route context binding. The valid reply test uses the real response builder.

The delete-role test exposed a production bug. A super admin with a non-null tenant id could not delete a visible comment in another tenant. `delete_comment` now allows a super admin directly while keeping the same-tenant requirement for community admins.

### Mutation RED

Each controlled production mutation was reverted before GREEN and was not committed.

```text
# Drop BenderComment.post_id from the direct-read query.
.venv/bin/pytest -q tests/test_bender_comment_threads.py -k direct_read_binds_requested_post_and_comment_ids
1 failed, 12 deselected
Failed: DID NOT RAISE NotFoundError

# Change reply counter update from +1 to -1.
.venv/bin/pytest -q tests/test_bender_comment_threads.py -k valid_reply_stores_requested_parent
1 failed, 12 deselected
assert 3 == 5

# Replace the exact tombstone response text.
.venv/bin/pytest -q tests/test_bender_comment_threads.py -k parent_with_replies_becomes_tombstone
1 failed, 12 deselected
assert 'deleted' == 'Comment deleted'
```

The test-first RED for the super-admin branch also failed before the production correction:

```text
.venv/bin/pytest -q tests/test_bender_comment_threads.py -k 'valid_reply or self_reply or authorized_actors'
1 failed, 5 passed, 7 deselected
ForbiddenError: Not allowed to delete this comment
```

### GREEN and verification

```text
.venv/bin/pytest -q tests/test_bender_comment_threads.py
16 passed, 49 warnings

.venv/bin/pytest -q tests/test_bender_post_link_preview.py tests/test_bender_comment_schema.py tests/test_bender_comment_migrations.py
23 passed

.venv/bin/pytest -q
426 passed, 66 warnings
```

`git diff --check` passed. No `uv.lock` or deployment files changed.

### Files changed

- `the-bend-backend/tests/test_bender_comment_threads.py`
- `the-bend-backend/app/services/bender_service.py`

### Concerns

The focused tests use a behavioral in-memory session instead of a live PostgreSQL database. It deliberately compiles PostgreSQL SQL and evaluates the predicates these service paths issue, but it does not simulate database isolation under concurrent requests. The full suite still reports existing `utcnow` and Starlette deprecation warnings.

## Fix Round 5

### Test corrections

- The cross-post direct-read test now stores target comment X under post B and decoy comment Y under requested post A. It requests X through A, so omitting either the post-id predicate or the comment-id predicate returns a row and fails the test.
- `CommentStoreSession` no longer floors post counters at zero. It inspects the compiled `bender_posts.comment_count >` predicate and applies the update only when the stored value satisfies the bound guard.
- A real `BenderService.delete_comment` test now starts with a live comment and `comment_count == 0`. The comment is deleted while the post count stays at zero.
- Existing repeated hard-delete and tombstone no-op tests remain unchanged.

### Mutation RED evidence

Each production mutation was uncommitted and restored before the next run.

```text
# Remove BenderComment.post_id == post_id from the direct-read query.
.venv/bin/pytest -q tests/test_bender_comment_threads.py -k direct_read_binds_requested_post_and_comment_ids
FAILED tests/test_bender_comment_threads.py::test_direct_read_binds_requested_post_and_comment_ids
Failed: DID NOT RAISE NotFoundError
1 failed, 16 deselected, 4 warnings in 1.32s

# Restore post-id and remove BenderComment.id == comment_id.
.venv/bin/pytest -q tests/test_bender_comment_threads.py -k direct_read_binds_requested_post_and_comment_ids
FAILED tests/test_bender_comment_threads.py::test_direct_read_binds_requested_post_and_comment_ids
Failed: DID NOT RAISE NotFoundError
1 failed, 16 deselected, 4 warnings in 1.34s

# Remove BenderPost.comment_count > 0 from the deletion update.
.venv/bin/pytest -q tests/test_bender_comment_threads.py -k delete_live_comment_does_not_decrement_zero_post_count
FAILED tests/test_bender_comment_threads.py::test_delete_live_comment_does_not_decrement_zero_post_count
AssertionError: assert -1 == 0
1 failed, 16 deselected, 2 warnings in 0.71s
```

### GREEN and verification

```text
.venv/bin/pytest -q tests/test_bender_comment_threads.py
17 passed, 52 warnings in 0.64s

.venv/bin/pytest -q tests/test_bender_post_link_preview.py tests/test_bender_comment_schema.py tests/test_bender_comment_migrations.py
23 passed in 0.40s

.venv/bin/pytest -q
427 passed, 69 warnings in 4.25s
```

### Files changed

- `the-bend-backend/tests/test_bender_comment_threads.py`
- `.superpowers/sdd/2026-09-01-bender-comment-replies-and-hearts/task-2-report.md`

### Self-review

`git diff --check` passed. The production service has no committed or uncommitted change from this round. The fake evaluates the compiled count guard instead of duplicating the production floor behavior. Both direct-read predicates have separate mutation proof. No existing test was weakened, and no `uv.lock` or deployment file changed.

### Concerns

The focused tests still use the compiled-SQL in-memory session described in Fix Round 4, so they do not model PostgreSQL transaction isolation. The full suite still reports existing `utcnow`, FastAPI, and Starlette deprecation warnings.
