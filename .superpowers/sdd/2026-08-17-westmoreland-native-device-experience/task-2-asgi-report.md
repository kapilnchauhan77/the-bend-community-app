# Task 2 ASGI upload idempotency matrix

Date: 2026-08-18

## Scope completed

Added in-process FastAPI/ASGI coverage for all four idempotent upload routes:

- `/upload/images`
- `/upload/photo`
- `/upload/avatar`
- `/upload/media`

The matrix covers a successful first completion followed by an exact JSON replay;
an existing/in-progress claim returning `409` before storage; genuinely concurrent
requests storing one object; processing failure release and successful retry;
Redis unavailability returning the stable `503` detail without storage; completion
write failure followed by a logical retry using the same deterministic storage
identity; authenticated tenant scoping; public-photo tenant lookup from trusted
middleware state; a forged `X-Tenant-Slug` being excluded from the replay key;
UUID validation of both idempotency and anonymous-client headers; and a proof that
the upload payload is not represented in the Redis values.

## Minimal production correction

`UploadIdempotencyService._key` now validates every anonymous client identifier as
UUID-shaped, including when a trusted middleware tenant has been resolved. Before
the correction, that validation only applied for the fallback `public` tenant.

## Verification

Executed from `the-bend-backend`:

```text
.venv/bin/pytest tests/test_upload_idempotency.py -q
19 passed, 1 warning

.venv/bin/pytest tests/test_upload_idempotency.py tests/test_account_deletion.py -q
45 passed, 1 warning
```

Also passed:

```text
python -m compileall -q the-bend-backend/app
git diff --check
shasum -a 256 the-bend-backend/uv.lock
c59e3d361f8f175c3d661018029aeb9df00761b74d70f79d6d1e3971fcc59082
```

The only warning is the pre-existing Python 3.13 `crypt` deprecation emitted by
Passlib. No production storage, Redis, or external service was contacted.

## Boundaries

The tests use a route-level ASGI app with a middleware stand-in that sets trusted
`request.state.tenant`; this isolates the contract that upload routes must use
trusted state rather than a forged header. They do not exercise deployment DNS or
the database-backed tenant resolver itself.
