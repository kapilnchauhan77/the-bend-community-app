# Westmoreland Native Device Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the member-facing native experience with push registration and routing, native media/location/share/browser behavior, bounded offline reading and drafts, resilient messaging, safe Stripe return handling, safety/deletion controls, and privacy-safe observability.

**Architecture:** Complete the `PlatformServices` adapters created in Plan 1 and consume the backend APIs delivered by Plan 2. Feature components call typed services rather than Capacitor directly. Public content uses a bounded Filesystem-backed LRU cache; authenticated mutations remain online-only. Push, WebSocket, and deep-link events converge on the same allowlisted route resolver, while analytics and crash reporting pass through a common redactor.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, React Testing Library, Capacitor 8, APNs/FCM bridge, Filesystem, Camera, Geolocation, Share, Browser, Network, App lifecycle, PostHog, Sentry Capacitor, FastAPI, Redis.

## Global Constraints

- Apply every constraint in `docs/superpowers/plans/2026-08-17-westmoreland-native-apps-roadmap.md`.
- Run only after the Plan 2 exit gate passes.
- Ask for push only after sign-in and a contextual explanation; ask for camera, photos, microphone, or location only when the member invokes that feature.
- Never cache messages, tokens, account settings, private media, payment responses, precise coordinates, or authenticated API bodies.
- Never silently queue a message, payment, listing interest, registration action, or profile mutation.
- Do not commit APNs keys, Firebase service credentials, `GoogleService-Info.plist`, `google-services.json`, PostHog keys, Sentry tokens, signing files, or generated upload artifacts.
- Keep the website's existing browser implementations and PWA behavior working.

---

## File structure

### Create

- `the-bend-frontend/src/platform/native/NativePushService.ts` and tests — contextual permission, installation registration, revocation, and tap routing.
- `the-bend-frontend/src/platform/native/NativeMediaService.ts`, `NativeLocationService.ts`, `NativeShareService.ts`, `NativeBrowserService.ts`, and contract tests.
- `the-bend-frontend/src/platform/native/NativeNetworkService.ts` — connection state and lifecycle refresh.
- `the-bend-frontend/src/platform/native/NativeContentCache.ts` and tests — 50-item/50-MB public-content LRU.
- `the-bend-frontend/src/platform/native/NativeAnalyticsService.ts`, `NativeCrashReporter.ts`, and redaction tests.
- `the-bend-frontend/src/components/native/PermissionPrimer.tsx`, `OfflineBanner.tsx`, `CachedContentNotice.tsx`, `UploadProgress.tsx`, and `ReconnectBanner.tsx`.
- `the-bend-frontend/src/hooks/useCachedPublicContent.ts`, `useOnlineMutation.ts`, and `useNativeLifecycle.ts`.
- `the-bend-frontend/src/drafts/DraftStore.ts` and tests — local, unsubmitted form drafts.
- `the-bend-frontend/src/checkout/CheckoutCoordinator.ts`, `checkoutState.ts`, and tests.
- `the-bend-frontend/src/safety/ReportDialog.tsx`, `BlockMemberDialog.tsx`, and tests.
- `the-bend-frontend/src/pages/DeleteAccountPage.tsx`, `SupportPage.tsx`, `PrivacyPage.tsx`, and component tests.
- `the-bend-backend/app/services/upload_idempotency_service.py` and `tests/test_upload_idempotency.py`.

### Modify

- `the-bend-frontend/package.json`, `package-lock.json`, `src/main.tsx`, `src/index.css`, and native platform projects.
- `src/platform/contracts.ts`, `createPlatformServices.ts`, `native/NativePlatformServices.ts`, and web adapter implementations.
- `src/services/api.ts`, `notificationApi.ts`, `uploadApi.ts`, `messageApi.ts`, `advertisingApi.ts`, and `eventApi.ts`.
- `src/hooks/usePushNotifications.ts` and `useWebSocket.ts`.
- `src/components/shared/CameraCapture.tsx`, `LocationPinEditor.tsx`, and `ShareButton.tsx`.
- Public detail pages, creation forms, `MessagesPage.tsx`, `NotificationsPage.tsx`, `SettingsPage.tsx`, `ProfileHubPage.tsx`, and route declarations.
- `the-bend-backend/app/api/v1/upload.py` and `app/config.py`.

---

### Task 1: Complete native push registration, preferences, and tap routing

**Files:**
- Create: `src/platform/native/NativePushService.ts`
- Test: `src/platform/native/NativePushService.test.ts`
- Modify: `src/platform/contracts.ts`
- Modify: `src/platform/native/NativePlatformServices.ts`
- Modify: `src/services/notificationApi.ts`
- Modify: `src/hooks/usePushNotifications.ts`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/pages/NotificationsPage.tsx`
- Modify: `ios/App/App/AppDelegate.swift`
- Modify: `android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Produces `PushService.explainAndRequest(): Promise<'granted' | 'denied' | 'prompt'>`.
- Produces `PushService.register(session: AuthSnapshot): Promise<void>` and `unregister(mode: 'online' | 'offline'): Promise<void>`.
- Produces `PushService.addTapListener(handler: (target: DeepLinkTarget) => void): Promise<RemoveListener>`.
- Adds `notificationApi.getPreferences`, `updatePreferences`, `registerInstallation`, `disableInstallation`, and `revokeInstallation`.

- [ ] **Step 1: Write failing permission, token-rotation, and tap tests**

```ts
it('does not request permission during construction', () => {
  new NativePushService(deps);
  expect(PushNotifications.requestPermissions).not.toHaveBeenCalled();
});

it('registers a rotated token against the stable installation id', async () => {
  await service.register(authenticatedMember);
  emitRegistration({ value: 'new-token' });
  expect(api.registerInstallation).toHaveBeenCalledWith(
    stableInstallationId,
    expect.objectContaining({ token: 'new-token', platform: 'ios' }),
  );
});

it('maps a notification tap through the same deep-link allowlist', async () => {
  await service.addTapListener(handler);
  emitPushTap({ data: { target_type: 'message', target_id: threadId } });
  expect(handler).toHaveBeenCalledWith({ path: `/messages/${threadId}`, requiresAuth: true });
});
```

- [ ] **Step 2: Confirm the focused suite fails on the current web-only push hook**

Run: `cd the-bend-frontend && npm run test:run -- src/platform/native/NativePushService.test.ts`

Expected: FAIL because `NativePushService` and native installation API methods do not exist.

- [ ] **Step 3: Implement lifecycle and preference behavior**

Generate one installation UUID and one revocation secret, storing both in secure storage. Register only after authentication and permission grant. Persist a replacement revocation secret returned by the backend. On online sign-out, disable the installation then remove the local secret; on offline sign-out, delete the provider token locally but retain only installation ID plus revocation secret until `revokeInstallation` succeeds.

```ts
const PUSH_TARGETS: Record<PushCategory, (id: string) => DeepLinkTarget> = {
  message_received: (id) => ({ path: `/messages/${id}`, requiresAuth: true }),
  listing_interest_received: (id) => ({ path: `/listing/${id}`, requiresAuth: true }),
  registration_decision: () => ({ path: '/notifications', requiresAuth: true }),
  urgent_listing_published: (id) => ({ path: `/listing/${id}`, requiresAuth: false }),
};
```

Settings loads and saves server-owned category preferences. If OS permission is denied, category controls are disabled and the screen offers `PushNotifications.checkPermissions()` plus an App-settings shortcut. Suppress foreground display when the open conversation matches the payload target, but still refresh unread counts.

- [ ] **Step 4: Verify native and web notification behavior**

Run:

```bash
cd the-bend-frontend
npm run test:run -- src/platform/native/NativePushService.test.ts src/pages/SettingsPage.test.tsx
npm run lint
npm run build
npm run cap:sync
```

Expected: tests pass, web build exits 0, and both native projects synchronize without embedded provider credentials.

- [ ] **Step 5: Commit push UX**

```bash
git add the-bend-frontend/src/platform/native/NativePushService.ts the-bend-frontend/src/platform/native/NativePushService.test.ts the-bend-frontend/src/platform/contracts.ts the-bend-frontend/src/platform/native/NativePlatformServices.ts the-bend-frontend/src/services/notificationApi.ts the-bend-frontend/src/hooks/usePushNotifications.ts the-bend-frontend/src/pages/SettingsPage.tsx the-bend-frontend/src/pages/NotificationsPage.tsx the-bend-frontend/ios/App/App/AppDelegate.swift the-bend-frontend/android/app/src/main/AndroidManifest.xml
git commit -m "feat(native): register and route native notifications"
```

---

### Task 2: Add native media, location, sharing, and idempotent uploads

**Files:**
- Create: `src/platform/native/NativeMediaService.ts`
- Create: `src/platform/native/NativeLocationService.ts`
- Create: `src/platform/native/NativeShareService.ts`
- Create: `src/platform/native/NativeBrowserService.ts`
- Test: `src/platform/native/nativeDeviceServices.test.ts`
- Create: `src/components/native/PermissionPrimer.tsx`
- Create: `src/components/native/UploadProgress.tsx`
- Modify: `src/components/shared/CameraCapture.tsx`
- Modify: `src/components/shared/LocationPinEditor.tsx`
- Modify: `src/components/shared/ShareButton.tsx`
- Modify: `src/services/uploadApi.ts`
- Create: `the-bend-backend/app/services/upload_idempotency_service.py`
- Modify: `the-bend-backend/app/api/v1/upload.py`
- Modify: `the-bend-backend/app/config.py`
- Test: `the-bend-backend/tests/test_upload_idempotency.py`

**Interfaces:**
- Produces `MediaService.pickPhoto`, `capturePhoto`, and `captureVideo` returning `{ blob, localUri, mimeType, filename }`.
- Produces `LocationService.getForegroundPosition(): Promise<{ latitude: number; longitude: number; accuracy: number }>`.
- Produces `ShareService.share({ title, text, url }): Promise<'shared' | 'cancelled'>`.
- Changes upload calls to accept `idempotencyKey` and upload progress.

- [ ] **Step 1: Write failing adapter and backend replay tests**

```ts
it('returns cancellation without throwing when the picker is dismissed', async () => {
  camera.getPhoto.mockRejectedValue({ message: 'User cancelled photos app' });
  await expect(media.pickPhoto()).resolves.toBeNull();
});

it('does not request location before the member confirms the primer', async () => {
  render(<LocationPinEditor />);
  expect(Geolocation.requestPermissions).not.toHaveBeenCalled();
});
```

```python
async def test_same_upload_idempotency_key_returns_first_result(client, member_headers, image):
    first = await upload(client, member_headers, image, key="upload-123")
    second = await upload(client, member_headers, image, key="upload-123")
    assert second.json() == first.json()
    assert await stored_media_count() == 1
```

- [ ] **Step 2: Confirm frontend and backend tests fail**

Run:

```bash
cd the-bend-frontend && npm run test:run -- src/platform/native/nativeDeviceServices.test.ts
cd ../the-bend-backend && .venv/bin/pytest tests/test_upload_idempotency.py -q
```

Expected: both commands fail on missing implementations.

- [ ] **Step 3: Implement adapters and Redis-backed upload replay protection**

Install `@capacitor/geolocation@^8`. `CameraCapture`, `LocationPinEditor`, and `ShareButton` consume interfaces from `usePlatformServices`; their browser paths remain the existing implementations. Convert Capacitor file URIs through `Capacitor.convertFileSrc`/Filesystem reads without placing the file body in logs or telemetry.

Send `Idempotency-Key` on `/upload/images`, `/upload/photo`, `/upload/avatar`, and `/upload/media`. The backend key is `upload-idempotency:{tenant_id}:{user_id}:{endpoint}:{sha256(key)}`, stores the completed JSON response for 24 hours, and returns `409 UPLOAD_IN_PROGRESS` while an unexpired claim is active. Validate UUID-shaped keys and never store uploaded bytes in Redis.

- [ ] **Step 4: Run contract, upload, lint, and native sync checks**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest tests/test_upload_idempotency.py -q
cd ../the-bend-frontend
npm run test:run -- src/platform/native/nativeDeviceServices.test.ts
npm run lint
npm run build
npm run cap:sync
```

Expected: all checks pass and denied/cancelled permissions leave each screen usable.

- [ ] **Step 5: Commit native device services**

```bash
git add the-bend-frontend/package.json the-bend-frontend/package-lock.json the-bend-frontend/src/platform/native/NativeMediaService.ts the-bend-frontend/src/platform/native/NativeLocationService.ts the-bend-frontend/src/platform/native/NativeShareService.ts the-bend-frontend/src/platform/native/NativeBrowserService.ts the-bend-frontend/src/platform/native/nativeDeviceServices.test.ts the-bend-frontend/src/components/native/PermissionPrimer.tsx the-bend-frontend/src/components/native/UploadProgress.tsx the-bend-frontend/src/components/shared/CameraCapture.tsx the-bend-frontend/src/components/shared/LocationPinEditor.tsx the-bend-frontend/src/components/shared/ShareButton.tsx the-bend-frontend/src/services/uploadApi.ts the-bend-backend/app/services/upload_idempotency_service.py the-bend-backend/app/api/v1/upload.py the-bend-backend/app/config.py the-bend-backend/tests/test_upload_idempotency.py
git commit -m "feat(native): add device media location and sharing"
```

---

### Task 3: Add bounded offline reading, network gates, and local drafts

**Files:**
- Create: `src/platform/native/NativeNetworkService.ts`
- Create: `src/platform/native/NativeContentCache.ts`
- Test: `src/platform/native/NativeContentCache.test.ts`
- Create: `src/hooks/useCachedPublicContent.ts`
- Create: `src/hooks/useOnlineMutation.ts`
- Create: `src/hooks/useNativeLifecycle.ts`
- Create: `src/components/native/OfflineBanner.tsx`
- Create: `src/components/native/CachedContentNotice.tsx`
- Create: `src/drafts/DraftStore.ts`
- Test: `src/drafts/DraftStore.test.ts`
- Modify: `src/pages/ListingDetailPage.tsx`, `BusinessProfilePage.tsx`, `EventsPage.tsx`, and `BenderPage.tsx`
- Modify: `src/pages/CreateListingPage.tsx` and the creation flow inside `src/pages/BenderPage.tsx`.
- Modify: `src/auth/sessionManager.ts`

**Interfaces:**
- Produces `ContentCache.put`, `get`, `remove`, `clear`, and `stats` for public entity kinds only.
- Produces `useCachedPublicContent(key, fetcher)` with `{ data, source, cachedAt, refresh }`.
- Produces `DraftStore.save/load/remove/clearPrivateDrafts`.

- [ ] **Step 1: Write failing LRU, denylist, and draft-cleanup tests**

```ts
it('evicts least recently used entries until both limits pass', async () => {
  await fillCache({ items: 51, bytes: 51 * MB });
  expect((await cache.stats()).items).toBeLessThanOrEqual(50);
  expect((await cache.stats()).bytes).toBeLessThanOrEqual(50 * MB);
});

it.each(['message', 'account', 'checkout'])('rejects private cache kind %s', async (kind) => {
  await expect(cache.put({ kind } as never)).rejects.toThrow('PUBLIC_CONTENT_ONLY');
});

it('clears private drafts on sign-out', async () => {
  await drafts.save('create-listing', draft);
  await session.logout();
  expect(await drafts.load('create-listing')).toBeNull();
});
```

- [ ] **Step 2: Confirm cache/draft suites fail**

Run: `cd the-bend-frontend && npm run test:run -- src/platform/native/NativeContentCache.test.ts src/drafts/DraftStore.test.ts`

Expected: FAIL because cache and draft stores do not exist.

- [ ] **Step 3: Implement public cache and explicit online mutation gates**

Store a JSON index plus content files under `Directory.Data/bend-public-cache`; cache only normalized fields used by the four public detail screens and at most one downloaded display image. Update `lastAccessedAt` atomically, evict oldest entries after every write, and discard malformed/expired index records rather than rendering them. Cache writes are best-effort; network success must not fail because disk caching failed.

`useCachedPublicContent` serves network first when online, cached data with timestamp when offline, and refreshes visible content on reconnection/foreground. `useOnlineMutation` returns stable `OFFLINE_ACTION_UNAVAILABLE` before executing any protected mutation. Drafts contain typed form fields and local media URIs only; they are never marked submitted and are cleared on success, discard, or sign-out.

- [ ] **Step 4: Verify offline and web regressions**

Run:

```bash
cd the-bend-frontend
npm run test:run -- src/platform/native/NativeContentCache.test.ts src/drafts/DraftStore.test.ts
npm run lint
npm run build
npm run build:native
```

Expected: tests pass; website build still uses the browser cache adapter; native offline detail views show source timestamp and disabled mutations.

- [ ] **Step 5: Commit offline reading**

```bash
git add the-bend-frontend/src/platform/native/NativeNetworkService.ts the-bend-frontend/src/platform/native/NativeContentCache.ts the-bend-frontend/src/platform/native/NativeContentCache.test.ts the-bend-frontend/src/hooks/useCachedPublicContent.ts the-bend-frontend/src/hooks/useOnlineMutation.ts the-bend-frontend/src/hooks/useNativeLifecycle.ts the-bend-frontend/src/components/native/OfflineBanner.tsx the-bend-frontend/src/components/native/CachedContentNotice.tsx the-bend-frontend/src/drafts/DraftStore.ts the-bend-frontend/src/drafts/DraftStore.test.ts the-bend-frontend/src/pages/ListingDetailPage.tsx the-bend-frontend/src/pages/BusinessProfilePage.tsx the-bend-frontend/src/pages/EventsPage.tsx the-bend-frontend/src/pages/BenderPage.tsx the-bend-frontend/src/pages/CreateListingPage.tsx the-bend-frontend/src/auth/sessionManager.ts
git commit -m "feat(native): add bounded offline reading and drafts"
```

---

### Task 4: Make messaging reconnect, resynchronize, and deduplicate safely

**Files:**
- Modify: `src/hooks/useWebSocket.ts`
- Modify: `src/services/messageApi.ts`
- Modify: `src/stores/messageStore.ts`
- Modify: `src/pages/MessagesPage.tsx`
- Create: `src/components/native/ReconnectBanner.tsx`
- Test: `src/hooks/useWebSocket.test.ts`
- Modify: `the-bend-backend/app/api/ws/chat.py`
- Test: `the-bend-backend/tests/test_websocket_resync.py`

**Interfaces:**
- Changes WebSocket auth to use `SessionManager.getAccessToken()` rather than `localStorage`.
- Produces connection states `idle | connecting | connected | reconnecting | offline`.
- Produces `messageApi.getThreadMessages(threadId, { after_cursor })` resynchronization.

- [ ] **Step 1: Write failing serialized reconnect and deduplication tests**

```ts
it('uses bounded exponential backoff with jitter', () => {
  disconnectFiveTimes();
  expect(scheduledDelays()).toEqual([1000, 2000, 4000, 8000, 16000]);
});

it('resynchronizes after the last cursor before hiding reconnecting', async () => {
  reconnect();
  await flushPromises();
  expect(messageApi.getThreadMessages).toHaveBeenCalledWith(threadId, { after_cursor: lastCursor });
  expect(store.connectionState).toBe('connected');
});

it('deduplicates WebSocket push and REST copies by message id', () => {
  store.merge([message]);
  store.addMessage(message);
  expect(store.messages.filter((item) => item.id === message.id)).toHaveLength(1);
});
```

- [ ] **Step 2: Confirm focused suites fail**

Run:

```bash
cd the-bend-frontend && npm run test:run -- src/hooks/useWebSocket.test.ts
cd ../the-bend-backend && .venv/bin/pytest tests/test_websocket_resync.py -q
```

Expected: frontend fails on fixed 3-second reconnect/localStorage auth; backend fails on absent `after_cursor` handling.

- [ ] **Step 3: Implement lifecycle-aware reconnect and REST resync**

Use delays `min(1000 * 2**attempt, 30000)` with ±20% deterministic-testable jitter. Stop timers while offline/backgrounded, reconnect on foreground, and reset attempts only after resync succeeds. Treat the existing message cursor as the last server cursor; the REST endpoint returns messages strictly after it. Merge by message UUID and update unread counts before setting state to `connected`.

Do not put access tokens in logs or breadcrumbs. Keep current typing/read events and suppress push presentation only when the affected thread is visibly active.

- [ ] **Step 4: Run messaging regression and native builds**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest tests/test_websocket_resync.py tests/test_send_message_reference.py tests/test_message_hydration.py -q
cd ../the-bend-frontend
npm run test:run -- src/hooks/useWebSocket.test.ts
npm run lint
npm run build:native
```

Expected: all checks pass; reconnect indicator remains until server state is merged.

- [ ] **Step 5: Commit resilient messaging**

```bash
git add the-bend-frontend/src/hooks/useWebSocket.ts the-bend-frontend/src/hooks/useWebSocket.test.ts the-bend-frontend/src/services/messageApi.ts the-bend-frontend/src/stores/messageStore.ts the-bend-frontend/src/pages/MessagesPage.tsx the-bend-frontend/src/components/native/ReconnectBanner.tsx the-bend-backend/app/api/ws/chat.py the-bend-backend/tests/test_websocket_resync.py
git commit -m "feat(messages): resync native conversations after reconnect"
```

---

### Task 5: Coordinate secure-browser checkout and authoritative return states

**Files:**
- Create: `src/checkout/checkoutState.ts`
- Create: `src/checkout/CheckoutCoordinator.ts`
- Test: `src/checkout/CheckoutCoordinator.test.ts`
- Modify: `src/platform/native/NativeBrowserService.ts`
- Modify: `src/services/advertisingApi.ts`
- Modify: `src/services/eventApi.ts`
- Modify: `src/pages/AdvertisePage.tsx`
- Modify: `src/pages/EventsPage.tsx`
- Modify: `src/deep-links/deepLinkRoutes.ts`

**Interfaces:**
- Produces `CheckoutCoordinator.start(kind, request): Promise<CheckoutResult>`.
- Produces results `complete | cancelled | pending | failed | unavailable`.
- Polls `GET /checkout/status/{kind}/{session_id}`; URL parameters never produce success directly.

- [ ] **Step 1: Write failing forged-return, pending, and cancellation tests**

```ts
it('never trusts a success query parameter', async () => {
  deepLink.emit('https://westmoreland.bend.community/checkout/return?success=true&session_id=cs_test');
  api.status.mockResolvedValue({ status: 'not_found' });
  await expect(result).resolves.toMatchObject({ state: 'failed' });
});

it('returns pending after bounded verification polling', async () => {
  api.status.mockResolvedValue({ status: 'pending' });
  await expect(coordinator.verify('event', 'cs_test')).resolves.toMatchObject({ state: 'pending' });
  expect(api.status).toHaveBeenCalledTimes(5);
});
```

- [ ] **Step 2: Confirm coordinator tests fail**

Run: `cd the-bend-frontend && npm run test:run -- src/checkout/CheckoutCoordinator.test.ts`

Expected: FAIL because checkout orchestration does not exist.

- [ ] **Step 3: Implement capability-gated checkout**

Fetch `/capabilities/native` before exposing the entry. Open only an HTTPS Stripe URL returned by the backend. Accept return links only from `westmoreland.bend.community/checkout/return`, close the Browser, extract the opaque session reference, and poll the backend at 0, 1, 2, 4, and 8 seconds. Fetch the resulting event/advertisement after `paid|complete`; represent cancellation, pending, provider error, and unavailable capability with separate recoverable screens.

- [ ] **Step 4: Run checkout and build checks**

Run:

```bash
cd the-bend-frontend
npm run test:run -- src/checkout/CheckoutCoordinator.test.ts
npm run lint
npm run build
npm run cap:sync
```

Expected: all checks pass and no route infers purchase success from the callback URL.

- [ ] **Step 5: Commit checkout coordination**

```bash
git add the-bend-frontend/src/checkout the-bend-frontend/src/platform/native/NativeBrowserService.ts the-bend-frontend/src/services/advertisingApi.ts the-bend-frontend/src/services/eventApi.ts the-bend-frontend/src/pages/AdvertisePage.tsx the-bend-frontend/src/pages/EventsPage.tsx the-bend-frontend/src/deep-links/deepLinkRoutes.ts
git commit -m "feat(native): verify browser checkout returns"
```

---

### Task 6: Expose reporting, blocking, support, privacy, and account deletion

**Files:**
- Create: `src/services/safetyApi.ts`
- Create: `src/services/accountApi.ts`
- Create: `src/safety/ReportDialog.tsx`
- Create: `src/safety/BlockMemberDialog.tsx`
- Test: `src/safety/safetyFlows.test.tsx`
- Create: `src/pages/DeleteAccountPage.tsx`
- Create: `src/pages/SupportPage.tsx`
- Create: `src/pages/PrivacyPage.tsx`
- Test: `src/pages/DeleteAccountPage.test.tsx`
- Modify: `src/pages/ListingDetailPage.tsx`, `BusinessProfilePage.tsx`, `EventsPage.tsx`, `BenderPage.tsx`, `MessagesPage.tsx`, `SettingsPage.tsx`, and `ProfileHubPage.tsx`
- Modify: `src/routes/PublicMemberRoutes.tsx` and `NativeRoutes.tsx`
- Modify: `src/deep-links/deepLinkRoutes.ts`

**Interfaces:**
- Produces one reusable report dialog for all six backend target types.
- Produces block/unblock actions from profile and conversation contexts.
- Produces password-confirmed deletion and polling status views.

- [ ] **Step 1: Write failing safety and deletion UI tests**

```tsx
it.each(['listing', 'shop', 'event', 'bender', 'user', 'message'])('submits a %s report', async (targetType) => {
  renderReport(targetType);
  await user.click(screen.getByRole('button', { name: 'Report' }));
  await user.click(screen.getByRole('button', { name: 'Submit report' }));
  expect(safetyApi.report).toHaveBeenCalledWith(expect.objectContaining({ target_type: targetType }));
});

it('does not claim deletion before server confirmation', async () => {
  accountApi.confirmDeletion.mockRejectedValue(new Error('network'));
  render(<DeleteAccountPage />);
  await confirmWithPassword();
  expect(screen.queryByText('Account deletion started')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Confirm UI tests fail**

Run: `cd the-bend-frontend && npm run test:run -- src/safety/safetyFlows.test.tsx src/pages/DeleteAccountPage.test.tsx`

Expected: FAIL because the shared controls and account API do not exist.

- [ ] **Step 3: Implement store-required member controls**

Add visible report actions to each required surface. After successful block, remove the blocked member's visible content locally, disable the conversation composer, then refetch. Keep content in place on failure. Report success links to Support.

Deletion explains consequences and retained records, verifies password, optionally requests confirmation email, calls the backend, then invokes full local sign-out/secure-state cleanup only after the server accepts the request. Public `/support`, `/privacy`, and `/delete-account` routes must render on the website without authentication; add those exact paths to the native route/deep-link allowlists, and have the deletion route offer sign-in plus a support-assisted path.

- [ ] **Step 4: Run safety, accessibility, and regression checks**

Run:

```bash
cd the-bend-frontend
npm run test:run -- src/safety/safetyFlows.test.tsx src/pages/DeleteAccountPage.test.tsx
npm run lint
npm run build
npm run build:native
```

Expected: tests pass; controls are keyboard/screen-reader reachable; no UI reports success before a successful API response.

- [ ] **Step 5: Commit safety and deletion UX**

```bash
git add the-bend-frontend/src/services/safetyApi.ts the-bend-frontend/src/services/accountApi.ts the-bend-frontend/src/safety the-bend-frontend/src/pages/DeleteAccountPage.tsx the-bend-frontend/src/pages/DeleteAccountPage.test.tsx the-bend-frontend/src/pages/SupportPage.tsx the-bend-frontend/src/pages/PrivacyPage.tsx the-bend-frontend/src/pages/ListingDetailPage.tsx the-bend-frontend/src/pages/BusinessProfilePage.tsx the-bend-frontend/src/pages/EventsPage.tsx the-bend-frontend/src/pages/BenderPage.tsx the-bend-frontend/src/pages/MessagesPage.tsx the-bend-frontend/src/pages/SettingsPage.tsx the-bend-frontend/src/pages/ProfileHubPage.tsx the-bend-frontend/src/routes/PublicMemberRoutes.tsx the-bend-frontend/src/routes/NativeRoutes.tsx the-bend-frontend/src/deep-links/deepLinkRoutes.ts
git commit -m "feat(safety): add native report block and deletion flows"
```

---

### Task 7: Add redacted PostHog and Sentry observability

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/main.tsx`, and native platform projects.
- Create: `src/observability/redactTelemetry.ts`
- Test: `src/observability/redactTelemetry.test.ts`
- Create: `src/platform/native/NativeAnalyticsService.ts`
- Create: `src/platform/native/NativeCrashReporter.ts`
- Modify: `src/platform/contracts.ts`, `native/NativePlatformServices.ts`, and `web/WebPlatformServices.ts`
- Modify: `src/pages/SettingsPage.tsx`

**Interfaces:**
- Produces `redactTelemetry(event, properties): SafeTelemetryEnvelope` with an event-name and property allowlist.
- Produces `AnalyticsService.capture`, `identify`, `reset`, `setOptOut`, and `isOptedOut`.
- Produces `CrashReporter.captureException(error, context)` with scrubbed stable error class/context only.

- [ ] **Step 1: Write failing denylist and identity-reset tests**

```ts
it.each(['message', 'email', 'phone', 'latitude', 'token', 'session_id', 'request_body'])('drops %s', (key) => {
  expect(redactTelemetry('message_send_failed', { [key]: 'secret', result: 'failed' }).properties).not.toHaveProperty(key);
});

it('resets analytics before guest events after sign-out', async () => {
  await session.logout();
  expect(analytics.reset).toHaveBeenCalledBefore(analytics.capture as never);
});
```

- [ ] **Step 2: Confirm observability tests fail**

Run: `cd the-bend-frontend && npm run test:run -- src/observability/redactTelemetry.test.ts`

Expected: FAIL because the redactor and adapters do not exist.

- [ ] **Step 3: Install and configure privacy-safe telemetry**

Run: `cd the-bend-frontend && npm install posthog-js @sentry/react @sentry/capacitor`

Initialize only when the release environment provides public project identifiers. Disable PostHog autocapture, session recording, heatmaps, and persistence of raw form values. Set Sentry `sendDefaultPii: false`, omit authenticated request bodies, strip query strings, and use route templates instead of raw paths. The only allowed properties are `entity_type`, `result`, `error_code`, `route_template`, `connection_state`, `duration_bucket`, `platform`, `os_version`, `app_version`, and `build_number`.

Store analytics opt-out before initializing PostHog on later launches. Identify by backend user UUID only; reset on sign-out/account deletion. Add the approved funnel events from the design only at confirmed state transitions.

- [ ] **Step 4: Run privacy, lint, and production-build checks**

Run:

```bash
cd the-bend-frontend
npm run test:run -- src/observability/redactTelemetry.test.ts
npm run lint
npm run build
npm run build:native
```

Expected: all checks pass; bundle/source inspection shows no secret values; a test exception contains release/build but none of the denylisted data.

- [ ] **Step 5: Commit observability**

```bash
git add the-bend-frontend/package.json the-bend-frontend/package-lock.json the-bend-frontend/src/main.tsx the-bend-frontend/src/observability the-bend-frontend/src/platform/native/NativeAnalyticsService.ts the-bend-frontend/src/platform/native/NativeCrashReporter.ts the-bend-frontend/src/platform/contracts.ts the-bend-frontend/src/platform/native/NativePlatformServices.ts the-bend-frontend/src/platform/web/WebPlatformServices.ts the-bend-frontend/src/pages/SettingsPage.tsx the-bend-frontend/ios the-bend-frontend/android
git commit -m "feat(native): add privacy-safe product observability"
```

---

### Task 8: Apply native safe-area, keyboard, back, accessibility, and motion polish

**Files:**
- Modify: `src/components/layout/NativeAppShell.tsx`, `NativeBottomNav.tsx`, and `PostActionSheet.tsx`
- Modify: `src/index.css`
- Create: `src/platform/native/useNativeBackButton.ts`
- Test: `src/components/layout/NativeAppShell.test.tsx`
- Modify: `ios/App/App/Info.plist`, `android/app/src/main/AndroidManifest.xml`, and theme/style resources.

- [ ] **Step 1: Write failing navigation/accessibility tests**

```tsx
it('announces the selected tab and exposes 44px minimum targets', () => {
  render(<NativeBottomNav />);
  expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: 'Post' })).toHaveClass('min-h-11', 'min-w-11');
});

it('closes a sheet before navigating back or exiting', () => {
  openPostSheet();
  emitAndroidBack();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(history.back).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Confirm shell tests fail**

Run: `cd the-bend-frontend && npm run test:run -- src/components/layout/NativeAppShell.test.tsx`

Expected: FAIL on missing native back and accessibility behavior.

- [ ] **Step 3: Implement platform-correct polish**

Use CSS safe-area variables for header, bottom navigation, and fixed dialogs; resize scroll regions with keyboard insets; handle Android back in order: dismiss overlay, navigate within app, then require a second press to exit from Home. Respect `prefers-reduced-motion`, dynamic text up to 200%, screen-reader labels, visible focus, and 44×44-point touch targets. Add permission usage descriptions that match the actual camera/photo/microphone/location flows.

- [ ] **Step 4: Run the entire phase regression gate**

Run:

```bash
cd the-bend-backend
.venv/bin/pytest -q
cd ../the-bend-frontend
npm run test:run
npm run lint
npm run build
npm run cap:sync
cd android && ./gradlew assembleDebug
cd ../ios && xcodebuild -workspace App/App.xcworkspace -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

Expected: backend tests, frontend tests/lint/build, Android debug build, and iOS simulator build all pass.

- [ ] **Step 5: Commit native polish**

```bash
git add the-bend-frontend/src/components/layout/NativeAppShell.tsx the-bend-frontend/src/components/layout/NativeAppShell.test.tsx the-bend-frontend/src/components/layout/NativeBottomNav.tsx the-bend-frontend/src/components/layout/PostActionSheet.tsx the-bend-frontend/src/platform/native/useNativeBackButton.ts the-bend-frontend/src/index.css the-bend-frontend/ios/App/App/Info.plist the-bend-frontend/android/app/src/main/AndroidManifest.xml the-bend-frontend/android/app/src/main/res
git commit -m "feat(native): polish installed app behavior"
```

## Plan 3 exit gate

Install development builds on an iPhone and Android device/emulator and capture evidence for contextual permission decisions, photo/video upload retry without duplication, foreground location, share sheet, offline cached reading with timestamp, reconnection/resync, a push tap into a message, verified checkout cancel/pending/success states, report/block enforcement, account deletion initiation, telemetry redaction, keyboard/safe-area behavior, 200% text, screen reader labels, and reduced motion. The gate passes only when the website regressions still pass and no provider-only flow is claimed from mocks.
