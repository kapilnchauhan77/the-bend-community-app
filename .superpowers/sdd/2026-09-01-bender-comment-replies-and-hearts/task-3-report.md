# Task 3 report: idempotent comment hearts

## Implementation

- Added `BenderService.like_comment` and `unlike_comment`.
- Added visible post/comment and tenant boundaries, deleted-comment conflict handling, savepoint-protected unique insertion, atomic increment, and guarded decrement.
- Added authenticated POST and DELETE routes at `/api/v1/bender/posts/{post_id}/comments/{comment_id}/like`.
- Added stateful service/API tests covering top-level comments and replies, duplicate operations, tombstones, cross-post and cross-tenant 404s, zero-floor counters, bulk viewer lookup, response shape, and auth dependencies.

## Verification

RED:

```text
.venv/bin/pytest -q tests/test_bender_comment_hearts.py
1 error during collection: ImportError: cannot import name 'like_comment' from app.api.v1.bender
```

GREEN focused:

```text
.venv/bin/pytest -q tests/test_bender_comment_hearts.py
5 passed, 8 warnings
```

Combined focused:

```text
.venv/bin/pytest -q tests/test_bender_comment_hearts.py tests/test_bender_comment_threads.py tests/test_bender_comment_schema.py
28 passed, 60 warnings
```

Full backend:

```text
.venv/bin/pytest -q
432 passed, 77 warnings
```

`git diff --check` passed.

## Self-review and concerns

The service returns the refreshed authoritative count after both successful inserts and duplicate insert conflicts. Neither heart path creates notifications. Existing deprecation warnings remain in the repository and are unrelated to this task.

## Fix Round 1

Addressed review findings H1, M1, and M2. Unheart now uses one conditional `DELETE ... RETURNING` scoped to `(comment_id, user_id)`, and decrements only when that delete returns an id. Added barrier-backed concurrent service coverage with shared heart state and real FastAPI `TestClient` coverage for unauthenticated 401 responses, authenticated `/api/v1` routing, dependency bindings, and exact JSON serialization.

RED:

```text
.venv/bin/pytest -q tests/test_bender_comment_hearts.py
5 passed, 2 failed
Failures: concurrent unheart left the shared state inconsistent; HTTP auth test reached the live tenant DB/event-loop and failed before route assertions.
```

GREEN:

```text
.venv/bin/pytest -q tests/test_bender_comment_hearts.py
7 passed, 10 warnings
```

Combined and full verification:

```text
git diff --check
.venv/bin/pytest -q
434 passed, 78 warnings
```

Files changed in this round: `the-bend-backend/app/services/bender_service.py` and `the-bend-backend/tests/test_bender_comment_hearts.py`. The existing report was appended with this round's evidence and self-review. Remaining warnings are pre-existing or test fixture deprecations.
