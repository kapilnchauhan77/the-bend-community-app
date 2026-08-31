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
