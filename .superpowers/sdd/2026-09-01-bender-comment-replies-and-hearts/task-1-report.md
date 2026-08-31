# Task 1 report

## Implementation details

- Added `bender_comment_threads` revision after `rejected_shop_status`, adding nullable self-referential parent IDs, cached heart counts, tombstone timestamps, reply grouping index, and the idempotent comment-heart table.
- Added `bender_reply_notification` revision after the comment schema revision, using the established PostgreSQL enum transaction pattern for `BENDER_REPLY`.
- Extended the Bender ORM with self-referential parent/replies relationships and `BenderCommentLike`, and exported the model.
- Added the `NotificationType.BENDER_REPLY` enum member and additive Pydantic request, response, heart, default, and UUID-stringification contracts.

## Files changed

- `the-bend-backend/alembic/versions/bender_comment_threads.py`
- `the-bend-backend/alembic/versions/bender_reply_notification.py`
- `the-bend-backend/app/models/bender.py`
- `the-bend-backend/app/models/__init__.py`
- `the-bend-backend/app/models/enums.py`
- `the-bend-backend/app/schemas/bender.py`
- `the-bend-backend/tests/test_bender_comment_migrations.py`
- `the-bend-backend/tests/test_bender_comment_schema.py`

## TDD evidence

RED migration command:

```text
$ .venv/bin/pytest -q tests/test_bender_comment_migrations.py
FF                                                                       [100%]
2 failed in 0.17s
FileNotFoundError: both migration modules did not exist
```

RED schema command:

```text
$ .venv/bin/pytest -q tests/test_bender_comment_schema.py
ERROR during collection
ImportError: cannot import name 'BenderCommentHeartResponse'
```

GREEN focused command:

```text
$ .venv/bin/pytest -q tests/test_bender_comment_migrations.py tests/test_bender_comment_schema.py
.......                                                                  [100%]
7 passed in 0.16s
```

## Verification

Full backend suite:

```text
$ .venv/bin/pytest -q
........................................................................ [ 17%]
........................................................................ [ 35%]
........................................................................ [ 52%]
........................................................................ [ 70%]
........................................................................ [ 88%]
.................................................                        [100%]
409 passed, 17 warnings in 4.33s
```

Alembic heads:

```text
$ .venv/bin/alembic heads
bender_reply_notification (head)
```

## Self-review

- `git diff --check` passes.
- Downgrade drops only the new likes table/index and comment fields. It does not delete existing comments first.
- No `uv.lock` changes were made.
- Existing backend tests remain green.

## Concerns

- The full suite reports 17 pre-existing/dependency deprecation warnings. No new warning remains from the focused schema tests.
- The service and API behavior for replies, hearts, notifications, and tombstones is intentionally deferred to later tasks.

## Fix Round 1

### What changed

Removed `delete-orphan` and delete propagation from `BenderComment.replies`. SQLAlchemy parent deletion can no longer remove replies through this relationship, preserving reply rows for the service's tombstone behavior. Added a focused ORM relationship contract test.

### TDD evidence

RED command:

```text
$ .venv/bin/pytest -q tests/test_bender_comment_schema.py -k parent_comment_relationship
F                                                                        [100%]
AssertionError: 'delete-orphan' not in CascadeOptions('delete,delete-orphan,...')
1 failed, 5 deselected in 0.39s
```

GREEN covering command:

```text
$ .venv/bin/pytest -q tests/test_bender_comment_schema.py tests/test_bender_comment_migrations.py
........                                                                 [100%]
8 passed in 0.26s
```

Full backend suite:

```text
$ .venv/bin/pytest -q
........................................................................ [ 17%]
........................................................................ [ 35%]
........................................................................ [ 52%]
........................................................................ [ 70%]
........................................................................ [ 87%]
..................................................                       [100%]
410 passed, 17 warnings in 4.20s
```

### Files changed

- `the-bend-backend/app/models/bender.py`
- `the-bend-backend/tests/test_bender_comment_schema.py`
- This report

### Self-review

- `git diff --check` passes.
- The correction is limited to the unsafe relationship cascade and its regression test.
- No `uv.lock` or out-of-scope files changed.

### Concerns

- The full suite still reports 17 existing/dependency deprecation warnings.
- Later service code must explicitly tombstone parents with replies and hard-delete only eligible comments.
