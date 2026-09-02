# Nonprofit document access implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development. Backend and frontend tasks may run in parallel because they own separate files and share only the HTTP contract below.

**Goal:** Store nonprofit verification documents with their real type outside the public uploads mount, let tenant admins view them through an authenticated endpoint, and repair the Washington Parish Museum PDF that is currently mislabeled as a JPEG.

**Architecture:** A dedicated document service strictly validates PDF, JPEG, and PNG bytes and stores them under a tenant-specific directory below `private_uploads/nonprofit_documents`. Public event submission receives an opaque, tenant-bound managed reference. Uploads are rate-limited, serialized per tenant, pruned after 24 hours only when unclaimed, and capped at 100 MiB per tenant. Admin document access resolves the tenant-scoped event first and streams only controlled local files with private, no-sniff headers. The frontend fetches the document as an authenticated blob rather than navigating to a public static URL.

**Tech stack:** FastAPI, SQLAlchemy async, Pillow, React, Axios, Playwright, Docker Compose, PostgreSQL.

**Spec:** The user-approved production fix in this task: correct file type handling, protect nonprofit documents behind admin authentication, repair the existing Washington Parish Museum record, test, and deploy.

## Global constraints

- Preserve `/upload/photo` for talent and volunteer images.
- Keep the existing `events.nonprofit_doc_url` column. No schema migration.
- Do not proxy external URLs or follow user-controlled filesystem paths.
- Public event JSON must never expose the document reference.
- Community admins may access only events in their tenant. Existing super-admin behavior remains unchanged.
- Store private documents in a persistent production volume that is not mounted by `StaticFiles`.
- Use tests first and record the failing and passing commands.
- Preserve unrelated user changes and do not edit the dirty main checkout.

---

### Task 1: Private document storage and admin API

**Files:**
- Create: `the-bend-backend/app/services/nonprofit_document_service.py`
- Create: `the-bend-backend/app/scripts/migrate_nonprofit_documents.py`
- Create: `the-bend-backend/tests/test_nonprofit_document_api.py`
- Modify: `the-bend-backend/app/api/v1/upload.py`
- Modify: `the-bend-backend/app/api/v1/events.py`
- Modify: `the-bend-backend/app/api/v1/admin.py`
- Modify: `docker-compose.prod.yml`

**Interfaces:**
- `POST /api/v1/upload/nonprofit-document` consumes multipart field `file` and returns `{ "document_ref": "nonprofit-documents/<tenant-uuid>/<document-uuid>.<ext>" }`.
- Accept actual PDF, JPEG, and PNG bytes up to 10 MiB. Parse PDFs strictly and verify image structure and dimensions. Reject unsupported, malformed, oversized, or over-quota content with `422`, `413`, or `507` as appropriate.
- Require a resolved tenant, rate-limit uploads to five per client IP per hour through the trusted production proxy, preserve exact database-claimed references, remove only unclaimed uploads older than 24 hours, and cap stored documents at 100 MiB per tenant.
- `GET /api/v1/admin/events/{event_id}/nonprofit-document` requires `Permission.require_community_admin()`, scopes through `EventService.get_event`, and returns document bytes with the detected `Content-Type`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and `Cache-Control: private, no-store`.
- New managed references resolve only below the matching tenant directory in `private_uploads/nonprofit_documents`. During the migration window, the admin endpoint may read the exact flat managed repair reference or a safe legacy `/uploads/images/<filename>` reference after tenant-scoped event lookup, but it must detect the real type and must not fetch remote URLs.
- Verified nonprofit submission accepts only an existing tenant-bound managed reference for the resolved tenant. It rejects flat, legacy, cross-tenant, missing, traversal, external, malformed, and nonexistent references.
- Production mounts `./data/private_uploads:/app/private_uploads` for the backend.
- The migration command defaults to dry-run and requires both `--event-id 503dbe2b-936c-4f90-b1e5-ac5801252605` and `--expected-reference /uploads/images/2d60657c-bdcc-4c8a-846d-fdec1b2f844e.jpg` before `--apply`. It locks the exact guarded row, verifies the source and mislabeled `_thumb` duplicate by size, SHA-256, and PDF content, copies both through private mode-0600 temporary files, verifies the private copies, removes the public copies, then compare-and-swap updates only the guarded event record. Private copies preserve recovery if the database commit fails, and a rerun completes any partial state or reports no change.

- [x] Write backend tests for byte detection, size/type rejection, managed path containment, legacy MIME correction, tenant-scoped admin access, security headers, submission reference validation, and guarded migration behavior.
- [x] Run the focused tests and confirm they fail for the missing service and routes.
- [x] Implement the minimal service, routes, submission validation, persistent volume, and guarded migration command.
- [x] Run the focused tests and existing community-faith event tests until they pass.
- [x] Run `git diff --check`; retain the backend and frontend changes for one integrated release commit.

### Task 2: Authenticated admin preview flow

**Files:**
- Modify: `the-bend-frontend/src/services/uploadApi.ts`
- Modify: `the-bend-frontend/src/services/eventApi.ts`
- Modify: `the-bend-frontend/src/pages/EventsPage.tsx`
- Modify: `the-bend-frontend/src/pages/admin/EventsAdminPage.tsx`
- Modify: `the-bend-frontend/e2e/community-faith-event-review.spec.ts`

**Interfaces:**
- `uploadApi.uploadNonprofitDocument(file)` calls `POST /upload/nonprofit-document` and returns `{ document_ref: string }`.
- The public event form stores `document_ref` in its existing `nonprofit_doc_url` payload field.
- `eventApi.downloadNonprofitDocument(id)` calls `GET /admin/events/${id}/nonprofit-document` with `responseType: 'blob'`; the existing Axios interceptor supplies the JWT and tenant slug.
- The pending-review card uses a button, not a direct document URL. A click fetches the blob and opens a temporary object URL. Failures stay visible on the card and object URLs are revoked.

- [x] Update Playwright tests for the dedicated upload contract and authenticated admin download request.
- [x] Run the focused Playwright file and confirm the new assertions fail against current code.
- [x] Implement the minimal API helpers and UI handlers.
- [x] Run the focused Playwright file, focused ESLint, and frontend production build until they pass.
- [x] Run `git diff --check`; retain the backend and frontend changes for one integrated release commit.

### Task 3: Integrated review, production repair, and deployment

**Files:**
- Review all Task 1 and Task 2 changes.
- Do not add deployment-only source changes unless review finds a defect.

**Interfaces:**
- Release branch must be based on current `origin/main` and pushed before deployment.
- Deploy from `/opt/bend` as the `bend` user after fast-forwarding to the pushed commit.
- Run the document migration in dry-run mode, verify the exact event ID and expected legacy reference, then run `--apply` once.

- [x] Review the combined diff for upload callers, tenancy, path traversal, static exposure, persistence, and rollback behavior.
- [x] Run focused backend tests, full backend tests, focused Playwright, full frontend Playwright, frontend build, and `git diff --check`.
- [ ] Push the branch, merge it into `main` through a clean integration path, and push `origin/main`.
- [ ] Deploy the backend and frontend from the merged `main` commit.
- [ ] Run the guarded dry-run and apply migration for the exact Washington Parish Museum event.
- [ ] Verify the old public URL returns `404`, unauthenticated admin access returns `401`, authenticated tenant-admin access returns `200 application/pdf`, the PDF is nonempty, and production health remains healthy.
