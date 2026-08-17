# Task 2 report — native media, location, sharing, and idempotent uploads

## Files changed

- Frontend: native media/location/share/browser adapters, platform wiring, device-service tests, permission primer, upload progress component, CameraCapture, LocationPinEditor, ShareButton, upload API, and Capacitor geolocation dependency.
- Backend: Redis-backed upload idempotency service, upload endpoint replay headers/claims/completed responses for images/photo/avatar/media, settings TTL, and focused idempotency tests.
- Native behavior requests permissions only after the member invokes the relevant feature; cancelled picker/share operations return safely; upload bodies are not logged or cached.

## RED evidence

- Frontend before implementation: `npm run test:run -- src/platform/native/nativeDeviceServices.test.ts` failed during collection because `NativeMediaService` was missing.
- Backend before implementation: `.venv/bin/pytest tests/test_upload_idempotency.py -q` failed during collection with `ModuleNotFoundError` for `upload_idempotency_service`.

## Passing checks

- `.venv/bin/pytest tests/test_upload_idempotency.py tests/test_account_deletion.py -q` — 28 passed.
- `npm run test:run` — 18 files, 110 tests passed.
- `npm run lint` — passed.
- `npm run build` — passed (existing Vite warning for absent optional analytics env token and chunk-size advisory).
- `npm run cap:sync` — passed for Android, iOS, and web; generated native provider artifacts were not committed.
- `python -m compileall -q app` and `git diff --check` — passed.
- `the-bend-backend/uv.lock` SHA256 remains `c59e3d361f8f175c3d661018029aeb9df00761b74d70f79d6d1e3971fcc59082`.

## Commit

`decfbf5 feat(native): add device media location and sharing`

## Self-review

- Native adapters are behind existing `PlatformServices` contracts; browser implementations remain unchanged.
- Idempotency keys are UUID-shaped, hashed before Redis key construction, scoped by tenant/user/endpoint, and responses are retained for 24 hours without uploaded bytes.
- Redis connection failures fall back to process-local replay protection for development/test continuity; production Redis remains the authoritative store.
- Existing native push tests and platform-service tests pass; the small `NativePushService` import cleanup removes an unused API import that caused initialization coupling and does not alter its runtime behavior.

## Concerns

- Video capture uses WebView `MediaRecorder` because Capacitor Camera is still-photo-only; device support should be validated on physical iOS/Android hardware.
- `cap:sync` reports the existing optional analytics-token and bundle-size warnings; neither blocks this task.
