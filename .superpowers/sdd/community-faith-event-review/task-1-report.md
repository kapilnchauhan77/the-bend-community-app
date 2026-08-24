# Task 1 report

Status: `DONE_WITH_CONCERNS`

Correction pass commit: `c91c8c03e26168eab1e5489d1cf96edcab229793`

Second correction pass commit: `f2b558c5c1be4023fb7d96d2f915c7e5ca3c9ba6`

Final correction commit: `d2740792aa206869e54c16463b4d298871890c3f`

## RED

Command: `.venv/bin/pytest -q tests/test_community_faith_event_review.py`

Expected RED output: `2 failed, 1 passed`, with missing `EventSubmitRequest.organization_type` and `EventStatus.REJECTED`.

## GREEN

Command: `.venv/bin/pytest -q tests/test_community_faith_event_review.py`

Output: `24 passed`.

Correction RED command: `.venv/bin/pytest -q tests/test_community_faith_event_review.py`

Correction RED output: `2 failed, 4 passed`. The failures caught the missing server-default handling in the enum migration and the pending fallback.

## Full backend suite

Command: `.venv/bin/pytest -q`

Output: `393 passed, 16 warnings`.

## Checks

- `python -m compileall -q app alembic/versions/20260824_community_faith_event_review.py`: passed.
- Final `alembic heads`: passed, `20260824_event_review (head)`.
- `git diff --check`: passed.
- Alembic offline upgrade/downgrade generation was attempted without Docker. The full-chain offline run is blocked by the pre-existing `westmoreland_sponsor_packages` migration calling a database result during SQL generation. The new migration now drops and reapplies `events.status`'s server default around enum replacement, and migration-focused assertions pass.

## Changed files and rationale

- `the-bend-backend/app/api/v1/events.py`: organization-type derivation and validation, coupon pricing rules, pending submission persistence, usage timing, and private admin serializer.
- `the-bend-backend/app/api/v1/admin.py`: tenant-scoped pending review list plus approve/reject and scoped update/delete routes.
- `the-bend-backend/app/services/event_service.py`: tenant-scoped event lookup, review listing, and status transitions.
- `the-bend-backend/app/models/event.py`: nullable organization and coupon foreign-key fields.
- `the-bend-backend/app/models/enums.py`: rejected event status.
- `the-bend-backend/alembic/versions/20260824_community_faith_event_review.py`: nullable columns, `ON DELETE SET NULL` foreign key, and safe uppercase PostgreSQL enum additions for `PENDING` and `REJECTED`.
- `the-bend-backend/tests/test_community_faith_event_review.py`: red-green behavior coverage for submission pricing/coupon rejection, admin filtering and transitions, tenant denial, privacy, migration revision/default checks, and service lookup.
- `the-bend-backend/app/api/v1/events.py`: converts a concurrent last-use redemption race to the stable community coupon 400 response so the request transaction rolls back the event.

## Commit

Implementation commit: `bf172bb40eea7ec366eebee98a847e7ef01d2634`
Correction commit: `c91c8c03e26168eab1e5489d1cf96edcab229793`
Second correction commit: `f2b558c5c1be4023fb7d96d2f915c7e5ca3c9ba6`
Final correction commit: `d2740792aa206869e54c16463b4d298871890c3f`

## Self-review and remaining concerns

The public serializer does not expose submitter identity, nonprofit document URLs, or coupon IDs. Community/faith submissions require a redeemable event coupon that reduces the $19.99 path to exactly zero. Coupon lookup and usage increment each occur once. Admin event mutations are tenant filtered.

The prepared worktree venv includes the parser dependencies and the full suite passes. The remaining concern is the existing migration's offline SQL-generation defect noted above, outside this task's owned migration.
