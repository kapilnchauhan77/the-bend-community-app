# Westmoreland Native CI/CD, QA, and Store Release Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish reproducible verification, signed candidate builds, safe backend deployment, real-device evidence, store-complete metadata, and a controlled U.S.-only public rollout for **The Bend: Westmoreland**.

**Architecture:** Pull requests run web, backend, Android, and iOS verification in GitHub Actions with no production secrets. Release tags create immutable signed mobile candidates through protected environments and Fastlane. Backend deployment remains GCE/Docker Compose but becomes SHA-pinned, migration-aware, health-checked, and rollback-documented. Store promotion remains a human-approved step after TestFlight/Play internal testing and evidence gates.

**Tech Stack:** GitHub Actions, Node 22, Python 3.11, PostgreSQL 16, Redis 7, Docker Compose, Java 21, Gradle, Xcode, Ruby/Bundler, Fastlane, Maestro, GCP Workload Identity Federation, TestFlight, Google Play internal testing.

## Global Constraints

- Apply every constraint in `docs/superpowers/plans/2026-08-17-westmoreland-native-apps-roadmap.md`.
- Run only after the Plan 3 exit gate passes.
- Never put provider, signing, store, GCP, PostHog, or Sentry secrets in the repository, workflow logs, artifacts, screenshots, or evidence pack.
- Pull-request jobs use test credentials and unsigned builds only.
- Store upload and production backend deployment require protected GitHub environments with explicit human approval.
- Every deployment and candidate artifact is tied to one Git commit SHA; never deploy an uncommitted or unmerged worktree.
- Database rollback means restore/forward-fix from a verified backup when a migration is not downgrade-safe; never assume `alembic downgrade` is safe in production.
- Keep the existing website/backend release independently deployable from mobile store releases.

---

## File structure

### Create

- `.github/workflows/verify.yml` — pull-request and main verification matrix.
- `.github/workflows/native-candidate.yml` — tag-triggered signed candidate builds and protected store upload.
- `.github/workflows/backend-deploy.yml` — approved SHA-pinned GCE deployment.
- `.github/dependabot.yml` — reviewed weekly dependency updates for npm, pip, Gradle, Bundler, and Actions.
- `scripts/check-native-tenant-lock.mjs` — fails if production native config can resolve outside Westmoreland.
- `scripts/check-secret-files.sh` — rejects known credential/signing files from tracked content.
- `scripts/verify-association-files.mjs` — validates live Apple/Android association responses.
- `the-bend-frontend/e2e/maestro/*.yaml` — critical native flows.
- `the-bend-frontend/Gemfile`, `Gemfile.lock`, `fastlane/Appfile`, `fastlane/Fastfile`, and `fastlane/Matchfile`.
- `the-bend-frontend/ios/exportOptions.plist` — App Store export method without embedded credentials.
- `docs/native/release-candidate-checklist.md`, `real-device-matrix.md`, `evidence-manifest.json`, `store-metadata.md`, `privacy-data-map.md`, `review-notes.md`, and `rollback-runbook.md`.
- `docs/native/github-main-ruleset.json` — exported non-secret branch protection evidence.
- `scripts/deploy-gce.sh`, `scripts/verify-production.sh`, and `scripts/rollback-gce.sh`.
- `store-assets/source/` and locale metadata under `store-assets/en-US/`.

### Modify

- `.gitignore`, `deploy.sh`, `vm-setup.sh`, `docker-compose.prod.yml`, `the-bend-backend/railway-start.sh`, and `DEPLOY.md`.
- Native Xcode/Gradle versioning, protected signing references, entitlements, and release build configuration.
- `package.json` scripts for CI, native E2E, and release checks.

---

### Task 1: Add secret-free pull-request verification for every runtime

**Files:**
- Create: `.github/workflows/verify.yml`
- Create: `.github/dependabot.yml`
- Create: `scripts/check-native-tenant-lock.mjs`
- Create: `scripts/check-secret-files.sh`
- Create: `the-bend-frontend/src/platform/runtimeConfig.release.test.ts`
- Create: `docs/native/github-main-ruleset.json`
- Modify: `the-bend-frontend/package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces required checks `frontend`, `backend`, `android-debug`, `ios-simulator`, and `security-config`.
- Produces `npm run verify:native-lock` and `npm run test:ci`.

- [ ] **Step 1: Write failing repository-policy tests**

Create the tenant-lock script with fixture mode and add Vitest coverage:

```ts
it('rejects a production native tenant override', () => {
  expect(() => assertNativeConfig({ mode: 'production', tenantSlug: 'other' })).toThrow('WESTMORELAND_LOCK');
});

it('accepts both native platforms only when tenant is Westmoreland', () => {
  for (const kind of ['ios', 'android'] as const) {
    expect(() => assertNativeConfig({ mode: 'production', kind, tenantSlug: 'westmoreland' })).not.toThrow();
  }
});
```

- [ ] **Step 2: Confirm the policy suite fails**

Run: `cd the-bend-frontend && npm run test:run -- src/platform/runtimeConfig.release.test.ts`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement CI jobs with pinned runtime majors and service containers**

`verify.yml` triggers on pull requests and pushes to `main`, cancels superseded runs, grants read-only repository contents by default, and contains:

```yaml
permissions:
  contents: read
concurrency:
  group: verify-${{ github.ref }}
  cancel-in-progress: true
```

- `frontend` on Ubuntu: `npm ci`, tests, lint, web build, native build.
- `backend` on Ubuntu with PostgreSQL 16 and Redis 7 services: editable install, `alembic upgrade head`, full pytest, Docker image build.
- `android-debug` on Ubuntu with Java 21: `npm ci`, `cap sync android`, `./gradlew assembleDebug`.
- `ios-simulator` on the current GitHub-hosted macOS image: `npm ci`, `cap sync ios`, unsigned simulator `xcodebuild`.
- `security-config`: tenant-lock test, association-file generator test inputs, `git grep` credential filename/content patterns, and verification that native routes do not import `pages/admin` or `pages/super-admin`.

Dependabot opens grouped weekly PRs with a maximum of five open updates per ecosystem. It never auto-merges.

- [ ] **Step 4: Run all workflow commands locally and validate YAML**

Run:

```bash
cd the-bend-frontend
npm ci
npm run test:run
npm run lint
npm run build
npm run build:native
cd ../the-bend-backend
.venv/bin/pip install -e .
.venv/bin/alembic upgrade head
.venv/bin/pytest -q
cd ..
bash scripts/check-secret-files.sh
node scripts/check-native-tenant-lock.mjs
```

Expected: all commands pass; secret checker prints filenames/categories only and never file contents.

- [ ] **Step 5: Commit verification automation**

```bash
git add .github/workflows/verify.yml .github/dependabot.yml .gitignore scripts/check-native-tenant-lock.mjs scripts/check-secret-files.sh the-bend-frontend/src/platform/runtimeConfig.release.test.ts the-bend-frontend/package.json
git commit -m "ci: verify web backend and native builds"
```

- [ ] **Step 6: Protect `main` after the first green workflow run**

In the GitHub repository ruleset, require pull requests, one approving review, resolution of review conversations, branches to be current before merge, and the exact five checks named above. Block force-pushes and deletion of `main`; allow bypass only for an audited emergency administrator role. Export the non-secret ruleset JSON into `docs/native/github-main-ruleset.json` and commit it separately.

```bash
git add docs/native/github-main-ruleset.json
git commit -m "docs(ci): record main branch protections"
```

---

### Task 2: Add deterministic native E2E flows and evidence manifests

**Files:**
- Create: `the-bend-frontend/e2e/maestro/guest-browse.yaml`
- Create: `the-bend-frontend/e2e/maestro/member-session.yaml`
- Create: `the-bend-frontend/e2e/maestro/deep-links.yaml`
- Create: `the-bend-frontend/e2e/maestro/safety-deletion.yaml`
- Create: `the-bend-frontend/e2e/maestro/offline-recovery.yaml`
- Create: `the-bend-frontend/e2e/maestro/checkout-return.yaml`
- Create: `the-bend-frontend/e2e/maestro/push-routing.yaml`
- Create: `the-bend-frontend/e2e/fixtures/seed-native-qa.py`
- Create: `docker-compose.test.yml`
- Create: `docs/native/real-device-matrix.md`
- Create: `docs/native/evidence-manifest.json`
- Modify: `the-bend-frontend/package.json`

**Interfaces:**
- Produces `npm run e2e:native:smoke` for guest/session/deep-link emulator flows.
- Produces `npm run e2e:native:release` for all automatable flows.
- Defines evidence records `{scenario, platform, device, os_version, app_build, backend_sha, result, artifact_sha256}`.

- [ ] **Step 1: Write a failing evidence-schema test**

```ts
it('rejects evidence without exact app and backend versions', () => {
  expect(() => validateEvidence({ scenario: 'push-terminated', result: 'pass' })).toThrow();
});

it('rejects a mock-only provider result as real-device evidence', () => {
  expect(() => validateEvidence({ ...completeEvidence, source: 'mock' })).toThrow('REAL_DEVICE_REQUIRED');
});
```

- [ ] **Step 2: Confirm the schema test fails**

Run: `cd the-bend-frontend && npm run test:run -- e2e/evidenceManifest.test.ts`

Expected: FAIL because the schema and manifest do not exist.

- [ ] **Step 3: Implement stable QA fixtures and Maestro flows**

The seed script creates Westmoreland-only QA users/content with deterministic IDs in non-production environments and refuses to run when `ENVIRONMENT=production`. Maestro tests use accessibility IDs, not visible copy or coordinates. Provider-dependent push, Stripe, camera/video, background/terminated behavior, and account-erasure completion remain explicit real-device/manual rows; emulator tests do not mark them complete.

The device matrix includes iPhone SE-class at iOS 15, a current iPhone, Android API 24/26 low-memory emulator/device with current WebView, current Pixel-class, and current Samsung Galaxy-class coverage. Each candidate records video/screenshots with SHA-256 in the manifest rather than committing private test-account content.

- [ ] **Step 4: Run deterministic smoke tests against the local test stack**

Run:

```bash
docker compose -f docker-compose.test.yml up -d db redis backend celery-worker celery-beat
cd the-bend-frontend
npm run cap:sync
npm run e2e:native:smoke
npm run test:run -- e2e/evidenceManifest.test.ts
```

Expected: guest, member session, and deep-link flows pass on an Android emulator; evidence schema tests pass. If iOS simulator automation is unavailable locally, CI must run the same deterministic smoke set before the task is complete.

- [ ] **Step 5: Commit native QA assets**

```bash
git add docker-compose.test.yml the-bend-frontend/e2e the-bend-frontend/package.json docs/native/real-device-matrix.md docs/native/evidence-manifest.json
git commit -m "test(native): add release flows and evidence schema"
```

---

### Task 3: Produce signed immutable candidates with Fastlane

**Files:**
- Create: `the-bend-frontend/Gemfile`
- Create: `the-bend-frontend/Gemfile.lock`
- Create: `the-bend-frontend/fastlane/Appfile`
- Create: `the-bend-frontend/fastlane/Fastfile`
- Create: `the-bend-frontend/fastlane/Matchfile`
- Create: `the-bend-frontend/ios/exportOptions.plist`
- Create: `.github/workflows/native-candidate.yml`
- Modify: iOS project version/signing settings.
- Modify: Android Gradle version/signing settings.

**Interfaces:**
- Produces Fastlane lanes `ios candidate`, `ios upload_internal`, `android candidate`, and `android upload_internal`.
- Release tags match the semantic-version regular expression `^native-v[0-9]+\.[0-9]+\.[0-9]+$` (for example `native-v1.0.0`); build number is the successful GitHub run number.

- [ ] **Step 1: Add failing version consistency checks**

```ruby
lane :verify_version do
  tag = ENV.fetch("GITHUB_REF_NAME")
  version = tag.delete_prefix("native-v")
  UI.user_error!("version mismatch") unless version == package_json_version
  UI.user_error!("dirty checkout") unless sh("git status --porcelain").strip.empty?
end
```

Run: `cd the-bend-frontend && bundle exec fastlane ios verify_version`

Expected: FAIL before the lane/configuration exists.

- [ ] **Step 2: Configure reproducible unsigned and signed release inputs**

Use bundle ID/package `community.bend.westmoreland`. App Store Connect API key material, Match encryption password/repository access, Android upload keystore/base64 and passwords, Google Play service-account JSON, PostHog project key, Sentry upload token, and provider config files are injected from protected `native-candidate` environment secrets. Decode them only into the job's temporary directory, register cleanup with `trap`, and never upload them as artifacts.

Fastlane builds an `.ipa` and `.aab`, uploads Sentry source maps/symbols, generates SHA-256 checksums and a manifest containing commit/version/build, then uploads artifacts with 14-day retention. Artifacts are immutable and never re-signed for promotion.

- [ ] **Step 3: Implement protected candidate and internal-upload jobs**

`native-candidate.yml` runs on matching tags and manual dispatch. It first verifies the tag commit is reachable from `origin/main` and waits for `verify.yml` success on the same SHA. Candidate builds run separately on macOS and Ubuntu. `upload_internal` jobs use the protected `store-upload` environment and require approval; they upload the exact candidate checksums to TestFlight internal testing and Google Play internal track without production rollout.

- [ ] **Step 4: Dry-run release configuration without secrets**

Run:

```bash
cd the-bend-frontend
bundle install
bundle exec fastlane ios verify_version
bundle exec fastlane android verify_version
cd android && ./gradlew bundleRelease -PciUnsigned=true
cd ../ios && xcodebuild -workspace App/App.xcworkspace -scheme App -configuration Release -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```

Expected: version checks and unsigned release compilation pass. Signed lanes stop with a clear missing-secret error before build rather than falling back to local signing.

- [ ] **Step 5: Commit release automation**

```bash
git add .github/workflows/native-candidate.yml the-bend-frontend/Gemfile the-bend-frontend/Gemfile.lock the-bend-frontend/fastlane the-bend-frontend/ios/exportOptions.plist the-bend-frontend/ios the-bend-frontend/android
git commit -m "ci(native): build protected store candidates"
```

---

### Task 4: Make the existing GCE/Docker Compose deployment SHA-pinned and verifiable

**Files:**
- Create: `scripts/deploy-gce.sh`
- Create: `scripts/verify-production.sh`
- Create: `scripts/rollback-gce.sh`
- Create: `.github/workflows/backend-deploy.yml`
- Create: `docs/native/rollback-runbook.md`
- Modify: `deploy.sh`
- Modify: `vm-setup.sh`
- Modify: `docker-compose.prod.yml`
- Modify: `the-bend-backend/railway-start.sh`
- Modify: `DEPLOY.md`

**Interfaces:**
- Produces `./deploy.sh COMMIT_SHA` on the VM; the argument must be a full 40-character commit reachable from `origin/main`.
- Produces `scripts/deploy-gce.sh COMMIT_SHA` using protected GCP environment variables.
- Produces `scripts/verify-production.sh COMMIT_SHA` with public API, container, migration, Celery worker/beat, capability, and association checks.

- [ ] **Step 1: Write failing shell contract tests**

Add ShellSpec/Bats-style tests that assert rejection of missing, short, dirty, or non-main SHAs and ensure a failed health check exits non-zero before recording success.

Run: `bash tests/shell/test_deploy_scripts.sh`

Expected: FAIL because the hardened scripts do not exist.

- [ ] **Step 2: Implement immutable deployment inputs and migration preflight**

`deploy.sh` must:

1. Validate `.env`, full SHA, clean server checkout, and that `origin/main` contains the SHA.
2. Record current deployed SHA and `docker compose config --images` to `data/releases/COMMIT_SHA.before`.
3. Create a timestamped `pg_dump` under `data/backups/` with mode `0600` and verify it is non-empty.
4. Fetch and detach-checkout the requested SHA.
5. Build images tagged with `BEND_RELEASE_SHA=COMMIT_SHA` and run `alembic upgrade head` in a one-off backend container.
6. Recreate backend, worker, beat, frontend, and Caddy; do not delete volumes.
7. Run `verify-production.sh`; record success only if every check passes. The protected in-container preflight reports booleans only and rejects production when the Stripe secret is absent or test-mode, the webhook secret is absent, or APNs/FCM delivery configuration is incomplete.

Add application health checks to backend/frontend containers and labels exposing the release SHA. `railway-start.sh` must not race migrations across multiple replicas; deployment performs migrations once before service start.

- [ ] **Step 3: Add Workload Identity Federation deployment workflow**

`backend-deploy.yml` is manual, accepts a full SHA, verifies it is merged to `main`, authenticates to GCP with Workload Identity Federation (no service-account JSON), and reads `GCP_PROJECT_ID`, `GCP_ZONE`, and `GCE_INSTANCE` only from the protected `production-backend` environment. It calls:

```bash
gcloud compute ssh "$GCE_INSTANCE" --project "$GCP_PROJECT_ID" --zone "$GCP_ZONE" --command "cd /opt/bend && ./deploy.sh '$RELEASE_SHA'"
```

The workflow then runs public verification from the runner. It never prints `.env`, signed URLs, push/provider status payloads containing tokens, or database connection strings. Update `vm-setup.sh` so generated credentials are written only to `/opt/bend/.env` with mode `0600` and never echoed to terminal output.

- [ ] **Step 4: Test scripts locally, then perform a non-production rehearsal**

Run:

```bash
bash tests/shell/test_deploy_scripts.sh
shellcheck deploy.sh scripts/deploy-gce.sh scripts/verify-production.sh scripts/rollback-gce.sh
docker compose -f docker-compose.prod.yml config
```

Expected: tests and static checks pass. Rehearse against a disposable GCE/test Compose stack: apply migrations, verify health/capabilities/worker registration, then roll back to the recorded prior SHA without losing volumes. Production execution is a separate approved action.

- [ ] **Step 5: Commit deployment hardening**

```bash
git add .github/workflows/backend-deploy.yml deploy.sh vm-setup.sh docker-compose.prod.yml the-bend-backend/railway-start.sh scripts/deploy-gce.sh scripts/verify-production.sh scripts/rollback-gce.sh tests/shell/test_deploy_scripts.sh docs/native/rollback-runbook.md DEPLOY.md
git commit -m "ci(deploy): pin and verify GCE releases"
```

---

### Task 5: Prepare store metadata, privacy truth, support, and association verification

**Files:**
- Create: `docs/native/store-metadata.md`
- Create: `docs/native/privacy-data-map.md`
- Create: `docs/native/review-notes.md`
- Create: `docs/native/release-candidate-checklist.md`
- Create: `scripts/verify-association-files.mjs`
- Create: `store-assets/source/app-icon.svg`
- Create: `store-assets/en-US/apple/metadata.json`
- Create: `store-assets/en-US/google/metadata.json`
- Create: generated screenshots only after real-device capture.
- Modify: `the-bend-frontend/public/.well-known/apple-app-site-association`
- Modify: `the-bend-frontend/public/.well-known/assetlinks.json`

- [ ] **Step 1: Write failing metadata and URL validation tests**

Validate required public URLs, U.S. territory, bundle/package ID, support contact, privacy link, deletion link, reviewer account instructions, UGC/report/block explanation, permission-purpose strings, age/content rating answers, and implemented data categories.

Run: `node scripts/validate-store-metadata.mjs`

Expected: FAIL until every required field is present and internally consistent.

- [ ] **Step 2: Build the implementation-derived privacy data map**

For each collected category, record purpose, source, backend/provider, retention, deletion behavior, whether linked to identity, whether used for tracking, and the exact code/config evidence. Cover account identifiers, public content, messages, media, foreground location, installation/push identifiers, product analytics, crash diagnostics, and Stripe transaction references. Session replay and ad tracking must be marked absent.

- [ ] **Step 3: Publish and verify required public endpoints and association files**

Confirm these return `200` without authentication:

- `https://westmoreland.bend.community/support`
- `https://westmoreland.bend.community/privacy`
- `https://westmoreland.bend.community/delete-account`
- `https://westmoreland.bend.community/.well-known/apple-app-site-association`
- `https://westmoreland.bend.community/.well-known/assetlinks.json`

Run `render-association-files.mjs` with the public production Apple Team ID and production Android app-signing SHA-256 fingerprint, review the two generated JSON files, and commit those public association values with the website. `verify-association-files.mjs` checks content type, bundle/package identity, production Apple Team ID, and production Android signing fingerprint. Do not accept a redirect or development fingerprint.

- [ ] **Step 4: Create source assets and real-device store captures**

Use the approved full-text The Bend logo, not the single `B`, for source branding where store layout permits. Generate compliant icons from one vector source without transparency where prohibited. Capture current iPhone and Android phone screenshots from the signed candidate showing real Westmoreland public/sample content with no private messages, email, phone, precise location, or test credentials.

Run:

```bash
node scripts/validate-store-metadata.mjs
node scripts/verify-association-files.mjs --live
```

Expected: all metadata and live association checks pass.

- [ ] **Step 5: Commit store preparation artifacts**

```bash
git add docs/native/store-metadata.md docs/native/privacy-data-map.md docs/native/review-notes.md docs/native/release-candidate-checklist.md scripts/validate-store-metadata.mjs scripts/verify-association-files.mjs store-assets the-bend-frontend/public/.well-known/apple-app-site-association the-bend-frontend/public/.well-known/assetlinks.json
git commit -m "docs(native): prepare store submission package"
```

---

### Task 6: Run internal testing, Westmoreland pilot, review, and staged release

**Files:**
- Modify: `docs/native/evidence-manifest.json`
- Modify: `docs/native/release-candidate-checklist.md`
- Create: `docs/native/pilot-report.md`
- Create: `docs/native/release-decision.md`

- [ ] **Step 1: Install the exact signed candidate from both stores' internal channels**

Do not use Xcode/ADB side-loaded builds for this gate. Record TestFlight build number, Play version code, app semantic version, candidate checksums, exact backend SHA, provider environment, and installation timestamps.

- [ ] **Step 2: Execute the full real-device matrix and provider flows**

Capture evidence for authentication restore, online/offline sign-out, all permission outcomes, camera/photo/short video, upload interruption/retry, foreground location, share sheet, WebSocket reconnect, all four push categories in foreground/background/terminated states, every deep-link type, Stripe cancel/pending/success verification, report/block, deletion initiation/completion, safe areas/keyboards, 200% text, screen reader, reduced motion, and upgrade from the previous internal build.

- [ ] **Step 3: Run an invite-only Westmoreland pilot**

Use multiple device families and real network conditions. Monitor privacy-safe operational measures only. The pilot gate requires: no severity-0/1 defects, 100% scripted critical-flow pass, at least 99.5% crash-free sessions, at least 98% valid authentication completion, and at least 95% APNs/FCM provider acceptance excluding intentionally invalid tokens. Keep the candidate in internal/closed testing if any gate fails.

- [ ] **Step 4: Submit with complete reviewer access and policy notes**

Provide a working reviewer account, UGC report/block instructions, account deletion steps/public URL, permission explanations, external-checkout behavior and remote-disable capability, support/privacy URLs, and any required demo video. Re-check current Apple and Google policies immediately before submission; update implemented behavior/disclosures if policy changed rather than relying on this dated plan.

- [ ] **Step 5: Release U.S.-only in controlled stages**

After approval, confirm only United States storefronts are enabled. Use Apple phased release and Google staged rollout where available. Hold each controllable stage for at least 48 hours of stable gate evidence. Record promotion/hold/rollback decisions in `release-decision.md`; remote-disable native commerce for payment-policy or verification issues, and stop rollout for any safety, deletion, authentication, or crash threshold breach.

- [ ] **Step 6: Commit the final non-sensitive release record**

```bash
git add docs/native/evidence-manifest.json docs/native/release-candidate-checklist.md docs/native/pilot-report.md docs/native/release-decision.md
git commit -m "docs(native): record Westmoreland release evidence"
```

## Plan 4 exit gate

The plan passes only when required GitHub checks protect `main`, a SHA-pinned backend deployment and rollback rehearsal have passed, signed artifacts with matching checksums are installed from TestFlight and Play internal testing, the evidence manifest covers the full real-device matrix, public association/support/privacy/deletion URLs are live, store disclosures match actual telemetry and permissions, the pilot thresholds pass, store review is approved, and the U.S.-only staged rollout has a recorded release decision. Build success or store upload alone is not completion.
