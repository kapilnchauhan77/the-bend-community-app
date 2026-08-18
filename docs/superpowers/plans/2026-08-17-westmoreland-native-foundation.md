# Westmoreland Native Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce installable iOS and Android development builds with a Westmoreland-only native route shell, typed platform boundaries, revocable secure sessions, and verified deep-link routing while preserving the existing website.

**Architecture:** Add Capacitor 8 directly to the existing Vite project and split route composition between web and native without duplicating feature pages. A `PlatformServices` container chooses browser or Capacitor adapters. The backend replaces unrevocable refresh JWTs with database-backed refresh sessions, while the native client keeps access tokens in memory and refresh credentials in Keychain/Keystore.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest, React Testing Library, Capacitor 8, `@aparajita/capacitor-secure-storage`, FastAPI, SQLAlchemy async, Alembic, PostgreSQL.

## Global Constraints

- Apply every constraint in `docs/superpowers/plans/2026-08-17-westmoreland-native-apps-roadmap.md`.
- Do not add native admin or super-admin routes.
- Do not store a native access token in `localStorage`, Preferences, Filesystem, Keychain, or Keystore; memory only.
- Configure secure storage with iCloud synchronization disabled.
- Website login, refresh, routes, tenant resolution, and PWA behavior must continue to pass regression checks.
- Native development and production configurations must both resolve `tenantSlug` to `westmoreland`.

---

## File structure

### Create

- `the-bend-frontend/capacitor.config.ts` — app identity and native web-dir configuration.
- `the-bend-frontend/vitest.config.ts` — frontend unit/component test runner.
- `the-bend-frontend/src/test/setup.ts` — DOM and Capacitor mocks.
- `the-bend-frontend/src/platform/contracts.ts` — all shared platform interfaces.
- `the-bend-frontend/src/platform/runtimeConfig.ts` — validated runtime and tenant configuration.
- `the-bend-frontend/src/platform/createPlatformServices.ts` — web/native adapter selection.
- `the-bend-frontend/src/platform/web/*` — browser implementations.
- `the-bend-frontend/src/platform/native/*` — Capacitor implementations required by this phase.
- `the-bend-frontend/src/auth/sessionManager.ts` — in-memory access token and serialized refresh lifecycle.
- `the-bend-frontend/src/auth/pendingDestination.ts` — allowlisted auth continuation state.
- `the-bend-frontend/src/routes/PublicMemberRoutes.tsx` — shared public/member route declarations.
- `the-bend-frontend/src/routes/WebAdminRoutes.tsx` — website-only privileged routes.
- `the-bend-frontend/src/routes/NativeRoutes.tsx` — native allowlisted route declarations.
- `the-bend-frontend/src/components/layout/NativeAppShell.tsx` — safe-area native layout.
- `the-bend-frontend/src/components/layout/NativeBottomNav.tsx` — Home/Explore/Post/Inbox/You navigation.
- `the-bend-frontend/src/components/layout/PostActionSheet.tsx` — central posting choices and auth continuation.
- `the-bend-frontend/src/pages/ExplorePage.tsx` — native Explore category hub.
- `the-bend-frontend/src/pages/ProfileHubPage.tsx` — native You hub.
- `the-bend-frontend/src/deep-links/deepLinkRoutes.ts` — URL-to-route allowlist.
- `the-bend-frontend/src/deep-links/useDeepLinks.ts` — cold/warm link listener.
- `the-bend-frontend/scripts/render-association-files.mjs` — validated Apple/Android association-file generator.
- `the-bend-backend/app/models/refresh_session.py` — revocable refresh-session persistence.
- `the-bend-backend/tests/test_refresh_sessions.py` — login/refresh/logout/revocation coverage.
- `the-bend-backend/alembic/versions/nat001_add_refresh_sessions.py` — migration with revision `nat001` and the repository's current head as `down_revision`.

### Modify

- `the-bend-frontend/package.json`, `package-lock.json`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/services/api.ts`, `src/stores/authStore.ts`, `src/pages/LoginPage.tsx`, `src/pages/RegisterPage.tsx`, and `src/pages/SettingsPage.tsx`.
- Generated `the-bend-frontend/ios/` and `the-bend-frontend/android/` projects.
- `the-bend-backend/app/models/__init__.py`, `app/core/security.py`, `app/schemas/auth.py`, `app/services/auth_service.py`, and `app/api/v1/auth.py`.

---

### Task 1: Add the tested Capacitor runtime foundation

**Files:**
- Modify: `the-bend-frontend/package.json`
- Modify: `the-bend-frontend/package-lock.json`
- Modify: `the-bend-frontend/vite.config.ts`
- Create: `the-bend-frontend/vitest.config.ts`
- Create: `the-bend-frontend/src/test/setup.ts`
- Create: `the-bend-frontend/src/platform/runtimeConfig.ts`
- Test: `the-bend-frontend/src/platform/runtimeConfig.test.ts`
- Create: `the-bend-frontend/capacitor.config.ts`
- Create: generated `the-bend-frontend/ios/`
- Create: generated `the-bend-frontend/android/`

**Interfaces:**
- Produces: `getRuntimeConfig(platform?: RuntimeKind): RuntimeConfig`.
- Produces scripts: `test`, `test:run`, `cap:sync`, `cap:ios`, `cap:android`, `build:native`.

- [ ] **Step 1: Write the failing runtime tests**

```ts
import { describe, expect, it } from 'vitest';
import { getRuntimeConfig } from './runtimeConfig';

describe('getRuntimeConfig', () => {
  it.each(['ios', 'android'] as const)('locks %s to Westmoreland', (kind) => {
    const config = getRuntimeConfig(kind);
    expect(config.isNative).toBe(true);
    expect(config.tenantSlug).toBe('westmoreland');
    expect(config.apiBaseUrl).toBe('https://api.bend.community/api/v1');
  });

  it('keeps web tenant resolution configurable', () => {
    expect(getRuntimeConfig('web').kind).toBe('web');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run: `cd the-bend-frontend && npm run test:run -- src/platform/runtimeConfig.test.ts`

Expected: FAIL because `runtimeConfig.ts` does not exist.

- [ ] **Step 3: Install dependencies, add scripts, and implement the runtime**

Run:

```bash
cd the-bend-frontend
npm install @capacitor/core@^8 @capacitor/app@^8 @capacitor/browser@^8 @capacitor/camera@^8 @capacitor/filesystem@^8 @capacitor/haptics@^8 @capacitor/network@^8 @capacitor/preferences@^8 @capacitor/push-notifications@^8 @capacitor/share@^8 @capacitor/splash-screen@^8 @capacitor/status-bar@^8 @aparajita/capacitor-secure-storage@^8
npm install -D @capacitor/cli@^8 @capacitor/android@^8 @capacitor/ios@^8 vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add these scripts:

```json
{
  "test": "vitest",
  "test:run": "vitest run",
  "build:native": "VITE_NATIVE_BUILD=true VITE_API_URL=https://api.bend.community/api/v1 vite build",
  "cap:sync": "npm run build:native && cap sync",
  "cap:ios": "npm run cap:sync && cap open ios",
  "cap:android": "npm run cap:sync && cap open android"
}
```

Implement the native lock before web fallback:

```ts
export function getRuntimeConfig(forcedKind?: RuntimeKind): RuntimeConfig {
  const detected = forcedKind ?? (Capacitor.getPlatform() as RuntimeKind);
  const isNative = detected === 'ios' || detected === 'android';
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
  return {
    kind: detected,
    isNative,
    apiBaseUrl,
    wsBaseUrl: apiBaseUrl.replace(/^http/, 'ws').replace('/api/v1', ''),
    tenantSlug: isNative ? 'westmoreland' : getTenantSlug(),
    appVersion: import.meta.env.VITE_APP_VERSION || '0.0.0-dev',
    buildNumber: import.meta.env.VITE_BUILD_NUMBER || '0',
    environment: import.meta.env.MODE === 'production' ? 'production' : 'development',
  };
}
```

Use this Capacitor configuration:

```ts
const config: CapacitorConfig = {
  appId: 'community.bend.westmoreland',
  appName: 'The Bend: Westmoreland',
  webDir: 'dist',
  bundledWebRuntime: false,
};
```

Initialize both platforms with `npx cap add ios` and `npx cap add android`; set iOS deployment target 15.0 and Android `minSdkVersion = 24`.

- [ ] **Step 4: Verify runtime, web build, and native synchronization**

Run:

```bash
cd the-bend-frontend
npm run test:run -- src/platform/runtimeConfig.test.ts
npm run lint
npm run build
npm run cap:sync
```

Expected: focused tests PASS; lint and both builds exit 0; Capacitor reports iOS and Android synchronized.

- [ ] **Step 5: Commit the foundation**

```bash
git add the-bend-frontend/package.json the-bend-frontend/package-lock.json the-bend-frontend/vite.config.ts the-bend-frontend/vitest.config.ts the-bend-frontend/src/test the-bend-frontend/src/platform/runtimeConfig.ts the-bend-frontend/src/platform/runtimeConfig.test.ts the-bend-frontend/capacitor.config.ts the-bend-frontend/ios the-bend-frontend/android
git commit -m "feat(native): add Capacitor runtime foundation"
```

---

### Task 2: Define platform contracts and browser/native service containers

**Files:**
- Create: `the-bend-frontend/src/platform/contracts.ts`
- Create: `the-bend-frontend/src/platform/createPlatformServices.ts`
- Create: `the-bend-frontend/src/platform/web/WebSessionStore.ts`
- Create: `the-bend-frontend/src/platform/web/WebPlatformServices.ts`
- Create: `the-bend-frontend/src/platform/native/NativeSessionStore.ts`
- Create: `the-bend-frontend/src/platform/native/NativePlatformServices.ts`
- Test: `the-bend-frontend/src/platform/createPlatformServices.test.ts`
- Modify: `the-bend-frontend/src/main.tsx`

**Interfaces:**
- Produces: contracts copied exactly from the roadmap.
- Produces: `createPlatformServices(config: RuntimeConfig): PlatformServices`.
- Produces: `PlatformServicesProvider` and `usePlatformServices(): PlatformServices`.

- [ ] **Step 1: Write failing adapter-selection and secure-session tests**

```ts
it('selects native services for iOS', () => {
  expect(createPlatformServices(config('ios')).sessionStore.kind).toBe('native');
});

it('does not persist an access token in the native session store', async () => {
  await nativeStore.save({ refreshToken: 'refresh-only' });
  expect(await nativeStore.load()).toEqual({ refreshToken: 'refresh-only' });
  expect(JSON.stringify(await nativeStore.load())).not.toContain('accessToken');
});
```

- [ ] **Step 2: Confirm tests fail on missing contracts**

Run: `cd the-bend-frontend && npm run test:run -- src/platform/createPlatformServices.test.ts`

Expected: FAIL with unresolved `createPlatformServices`.

- [ ] **Step 3: Implement contracts, provider, and phase-one adapters**

Use a single secure key and disable iCloud synchronization:

```ts
const SESSION_KEY = 'bend.refresh-session';

export class NativeSessionStore implements SessionStore {
  readonly kind = 'native';

  async load(): Promise<StoredSession | null> {
    await SecureStorage.setSynchronize(false);
    const value = await SecureStorage.get(SESSION_KEY, false, false);
    return value ? { refreshToken: String(value) } : null;
  }

  async save(session: StoredSession): Promise<void> {
    await SecureStorage.setSynchronize(false);
    await SecureStorage.set(
      SESSION_KEY,
      session.refreshToken,
      false,
      false,
      KeychainAccess.whenUnlockedThisDeviceOnly,
    );
  }

  async clear(): Promise<void> {
    await SecureStorage.remove(SESSION_KEY, false);
  }
}
```

The web adapter preserves current browser behavior for this phase. Stub later native services with typed implementations that throw `UnsupportedPlatformOperation` only when invoked; every stub receives a concrete task in Plan 3.

Wrap `<App />` in `PlatformServicesProvider` from `main.tsx`.

- [ ] **Step 4: Run contract tests and existing web checks**

Run:

```bash
cd the-bend-frontend
npm run test:run -- src/platform/createPlatformServices.test.ts
npm run lint
npm run build
```

Expected: tests PASS and the website still builds.

- [ ] **Step 5: Commit the platform boundary**

```bash
git add the-bend-frontend/src/platform the-bend-frontend/src/main.tsx
git commit -m "feat(native): add platform service boundaries"
```

---

### Task 3: Split web and native route composition and add the native shell

**Files:**
- Modify: `the-bend-frontend/src/App.tsx`
- Create: `the-bend-frontend/src/routes/PublicMemberRoutes.tsx`
- Create: `the-bend-frontend/src/routes/WebAdminRoutes.tsx`
- Create: `the-bend-frontend/src/routes/NativeRoutes.tsx`
- Create: `the-bend-frontend/src/components/layout/NativeAppShell.tsx`
- Create: `the-bend-frontend/src/components/layout/NativeBottomNav.tsx`
- Create: `the-bend-frontend/src/components/layout/PostActionSheet.tsx`
- Create: `the-bend-frontend/src/pages/ExplorePage.tsx`
- Create: `the-bend-frontend/src/pages/ProfileHubPage.tsx`
- Test: `the-bend-frontend/src/routes/NativeRoutes.test.tsx`

**Interfaces:**
- Consumes: `RuntimeConfig.isNative` and existing `ProtectedRoute`.
- Produces: `NativeRoutes`, `WebAdminRoutes`, and `NativeAppShell`.

- [ ] **Step 1: Write failing route-surface tests**

```tsx
it.each(['/admin', '/super-admin'])('does not render %s in native mode', async (path) => {
  renderNativeAt(path);
  expect(await screen.findByText(/not available/i)).toBeInTheDocument();
});

it('shows the five approved native destinations', () => {
  renderNativeAt('/');
  for (const label of ['Home', 'Explore', 'Post', 'Inbox', 'You']) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  }
});
```

- [ ] **Step 2: Confirm native-route tests fail**

Run: `cd the-bend-frontend && npm run test:run -- src/routes/NativeRoutes.test.tsx`

Expected: FAIL because the native route table and navigation do not exist.

- [ ] **Step 3: Implement route splits and navigation**

Native routes contain only approved surfaces:

```tsx
export function NativeRoutes() {
  return (
    <Routes>
      <Route element={<NativeAppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/listing/:id" element={<ListingDetailPage />} />
        <Route path="/business/:shopId" element={<BusinessProfilePage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:eventId" element={<EventsPage />} />
        <Route path="/bender" element={<BenderPage />} />
        <Route path="/bender/:postId" element={<BenderPage />} />
        <Route path="/volunteers" element={<VolunteerPage />} />
        <Route path="/talent" element={<TalentPage />} />
        <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/messages/:threadId" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/you" element={<ProtectedRoute><ProfileHubPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/create" element={<ProtectedRoute><CreateListingPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

`PostActionSheet` offers Offer listing, Request listing, and Bender post. Guests store the selected path before navigating to `/login`.

Keep the existing website routes in `PublicMemberRoutes` plus `WebAdminRoutes`. `App.tsx` selects native routes before calling `isRootDomain()`, preventing `capacitor://localhost` from opening the sales landing page.

- [ ] **Step 4: Verify native and website route behavior**

Run:

```bash
cd the-bend-frontend
npm run test:run -- src/routes/NativeRoutes.test.tsx
npm run lint
npm run build
npm run build:native
```

Expected: native route tests PASS; both builds exit 0; no admin bundle import is reachable from `NativeRoutes.tsx`.

- [ ] **Step 5: Commit the adaptive native shell**

```bash
git add the-bend-frontend/src/App.tsx the-bend-frontend/src/routes the-bend-frontend/src/components/layout/NativeAppShell.tsx the-bend-frontend/src/components/layout/NativeBottomNav.tsx the-bend-frontend/src/components/layout/PostActionSheet.tsx the-bend-frontend/src/pages/ExplorePage.tsx the-bend-frontend/src/pages/ProfileHubPage.tsx
git commit -m "feat(native): add Westmoreland member navigation"
```

---

### Task 4: Add revocable backend refresh sessions

**Files:**
- Create: `the-bend-backend/app/models/refresh_session.py`
- Modify: `the-bend-backend/app/models/__init__.py`
- Modify: `the-bend-backend/app/core/security.py`
- Modify: `the-bend-backend/app/schemas/auth.py`
- Modify: `the-bend-backend/app/services/auth_service.py`
- Modify: `the-bend-backend/app/api/v1/auth.py`
- Create: `the-bend-backend/alembic/versions/nat001_add_refresh_sessions.py`
- Test: `the-bend-backend/tests/test_refresh_sessions.py`

**Interfaces:**
- Produces: `RefreshSession(id, user_id, expires_at, last_used_at, revoked_at, created_at)`.
- Produces: `create_refresh_token(user_id: UUID, session_id: UUID) -> str` with JWT claim `sid`.
- Produces: `AuthService.logout(refresh_token: str) -> None`.
- Produces: `POST /api/v1/auth/logout` body `{ "refresh_token": "..." }`.

- [ ] **Step 1: Write failing service tests for login, refresh, and logout**

```python
@pytest.mark.asyncio
async def test_logout_revokes_refresh_session(db, active_user):
    service = AuthService(db)
    tokens = await service.login(active_user.email, "correct-password")
    await service.logout(tokens.refresh_token)
    with pytest.raises(UnauthorizedError):
        await service.refresh_token(tokens.refresh_token)

@pytest.mark.asyncio
async def test_refresh_rejects_missing_or_revoked_sid(db, active_user):
    token = create_refresh_token(active_user.id, uuid4())
    with pytest.raises(UnauthorizedError):
        await AuthService(db).refresh_token(token)
```

- [ ] **Step 2: Confirm the revocation tests fail**

Run: `cd the-bend-backend && .venv/bin/pytest tests/test_refresh_sessions.py -q`

Expected: FAIL because `RefreshSession` and logout do not exist.

- [ ] **Step 3: Implement the model, migration, JWT claim, and endpoint**

Use a database UUID as the `sid` claim:

```python
class RefreshSession(Base):
    __tablename__ = "refresh_sessions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    last_used_at: Mapped[datetime | None]
    revoked_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, nullable=False)
```

Login creates and flushes a row before issuing the token. Refresh requires an active row owned by `sub` and updates `last_used_at`. Logout sets `revoked_at` idempotently. Keep the response shape compatible with the existing frontend.

Set `revision = "nat001"`. Before writing `down_revision`, run `.venv/bin/alembic heads` and copy its single current head; abort rather than guessing if the command reports multiple heads.

- [ ] **Step 4: Run migration and auth regressions**

Run:

```bash
cd the-bend-backend
.venv/bin/alembic upgrade head
.venv/bin/pytest tests/test_refresh_sessions.py -q
.venv/bin/pytest -q
```

Expected: migration succeeds; focused and full backend tests PASS.

- [ ] **Step 5: Commit revocable sessions**

```bash
git add the-bend-backend/app/models/refresh_session.py the-bend-backend/app/models/__init__.py the-bend-backend/app/core/security.py the-bend-backend/app/schemas/auth.py the-bend-backend/app/services/auth_service.py the-bend-backend/app/api/v1/auth.py the-bend-backend/alembic/versions the-bend-backend/tests/test_refresh_sessions.py
git commit -m "feat(auth): add revocable refresh sessions"
```

---

### Task 5: Replace native token persistence with `SessionManager`

**Files:**
- Create: `the-bend-frontend/src/auth/sessionManager.ts`
- Create: `the-bend-frontend/src/auth/pendingDestination.ts`
- Test: `the-bend-frontend/src/auth/sessionManager.test.ts`
- Modify: `the-bend-frontend/src/services/api.ts`
- Modify: `the-bend-frontend/src/stores/authStore.ts`
- Modify: `the-bend-frontend/src/pages/LoginPage.tsx`
- Modify: `the-bend-frontend/src/pages/RegisterPage.tsx`
- Modify: `the-bend-frontend/src/pages/SettingsPage.tsx`

**Interfaces:**
- Produces: `SessionManager.initialize(): Promise<AuthSnapshot>`.
- Produces: `SessionManager.getAccessToken(): string | null`.
- Produces: `SessionManager.setAuthenticated(response: TokenResponse): Promise<void>`.
- Produces: `SessionManager.refresh(): Promise<string | null>` with one in-flight promise.
- Produces: `SessionManager.logout(): Promise<void>`.

- [ ] **Step 1: Write failing session-lifecycle tests**

```ts
it('coalesces concurrent refreshes', async () => {
  await Promise.all([manager.refresh(), manager.refresh(), manager.refresh()]);
  expect(refreshApi).toHaveBeenCalledTimes(1);
});

it('keeps native access tokens in memory only', async () => {
  await manager.setAuthenticated(tokenResponse);
  expect(manager.getAccessToken()).toBe('access');
  expect(await sessionStore.load()).toEqual({ refreshToken: 'refresh' });
});
```

- [ ] **Step 2: Confirm the tests fail before the manager exists**

Run: `cd the-bend-frontend && npm run test:run -- src/auth/sessionManager.test.ts`

Expected: FAIL with unresolved `SessionManager`.

- [ ] **Step 3: Implement hydration, serialized refresh, login, and logout**

The refresh method owns the single promise:

```ts
async refresh(): Promise<string | null> {
  if (this.refreshInFlight) return this.refreshInFlight;
  this.refreshInFlight = this.doRefresh().finally(() => {
    this.refreshInFlight = null;
  });
  return this.refreshInFlight;
}
```

The Axios request interceptor reads `SessionManager.getAccessToken()` and the tenant from `RuntimeConfig`. The response interceptor awaits `refresh()` once, retries only the original request, and calls `logout()` on failure. Web uses `WebSessionStore`; native uses `NativeSessionStore`.

Make Zustand actions asynchronous where storage or API work is required. Replace direct `localStorage` token reads in Settings and WebSocket code with the manager.

- [ ] **Step 4: Run focused and regression checks**

Run:

```bash
cd the-bend-frontend
npm run test:run -- src/auth/sessionManager.test.ts
npm run lint
npm run build
npm run build:native
```

Expected: tests PASS; browser and native builds exit 0; `rg "access_token" src` finds no native persistence path.

- [ ] **Step 5: Commit secure session management**

```bash
git add the-bend-frontend/src/auth the-bend-frontend/src/services/api.ts the-bend-frontend/src/stores/authStore.ts the-bend-frontend/src/pages/LoginPage.tsx the-bend-frontend/src/pages/RegisterPage.tsx the-bend-frontend/src/pages/SettingsPage.tsx
git commit -m "feat(native): secure and serialize member sessions"
```

---

### Task 6: Add verified deep-link routing and authentication continuation

**Files:**
- Create: `the-bend-frontend/src/deep-links/deepLinkRoutes.ts`
- Create: `the-bend-frontend/src/deep-links/useDeepLinks.ts`
- Test: `the-bend-frontend/src/deep-links/deepLinkRoutes.test.ts`
- Modify: `the-bend-frontend/src/components/layout/NativeAppShell.tsx`
- Modify: `the-bend-frontend/src/components/shared/ProtectedRoute.tsx`
- Modify: `the-bend-frontend/ios/App/App/App.entitlements`
- Modify: `the-bend-frontend/android/app/src/main/AndroidManifest.xml`
- Create: `the-bend-frontend/scripts/render-association-files.mjs`
- Modify: `the-bend-frontend/package.json`

**Interfaces:**
- Produces: `parseDeepLink(url: string): DeepLinkTarget | null`.
- Produces: `savePendingDestination(target: DeepLinkTarget): void` and `consumePendingDestination(): string | null`.

- [ ] **Step 1: Write failing allowlist tests**

```ts
it.each([
  ['https://westmoreland.bend.community/listing/00000000-0000-0000-0000-000000000001', '/listing/00000000-0000-0000-0000-000000000001'],
  ['https://westmoreland.bend.community/business/00000000-0000-0000-0000-000000000002', '/business/00000000-0000-0000-0000-000000000002'],
  ['https://westmoreland.bend.community/events/00000000-0000-0000-0000-000000000003', '/events/00000000-0000-0000-0000-000000000003'],
  ['https://westmoreland.bend.community/bender/00000000-0000-0000-0000-000000000004', '/bender/00000000-0000-0000-0000-000000000004'],
  ['https://westmoreland.bend.community/messages/00000000-0000-0000-0000-000000000005', '/messages/00000000-0000-0000-0000-000000000005'],
  ['https://westmoreland.bend.community/notifications', '/notifications'],
])('maps %s to %s', (url, path) => {
  expect(parseDeepLink(url)?.path).toBe(path);
});

it.each([
  'https://other.bend.community/listing/123',
  'https://westmoreland.bend.community/admin',
  'https://evil.example/messages/abc',
])('rejects %s', (url) => expect(parseDeepLink(url)).toBeNull());
```

- [ ] **Step 2: Confirm the deep-link tests fail**

Run: `cd the-bend-frontend && npm run test:run -- src/deep-links/deepLinkRoutes.test.ts`

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement route parsing, warm/cold listeners, and association generation**

Use exact route patterns and auth requirements:

```ts
const routes = [
  { pattern: /^\/$/, requiresAuth: false },
  { pattern: /^\/listing\/[0-9a-f-]+$/i, requiresAuth: false },
  { pattern: /^\/business\/[0-9a-f-]+$/i, requiresAuth: false },
  { pattern: /^\/events(?:\/[0-9a-f-]+)?$/i, requiresAuth: false },
  { pattern: /^\/bender(?:\/[0-9a-f-]+)?$/i, requiresAuth: false },
  { pattern: /^\/messages\/[0-9a-f-]+$/i, requiresAuth: true },
  { pattern: /^\/notifications$/, requiresAuth: true },
];
```

Validate each identifier with a UUID parser after the regular-expression match. Query strings are rejected at this foundation stage; Plan 3 adds the narrowly scoped checkout-return parser without widening other routes.

`useDeepLinks` handles `App.getLaunchUrl()` and `App.addListener('appUrlOpen', ...)`. It stores only an allowlisted path through authentication.

Configure iOS `applinks:westmoreland.bend.community` and Android HTTPS intent filters. `render-association-files.mjs` requires `APPLE_TEAM_ID` and `ANDROID_APP_LINK_SHA256`, validates their formats, and writes exact JSON under `public/.well-known/`; it exits non-zero when production inputs are absent.

- [ ] **Step 4: Verify route safety and both native builds**

Run:

```bash
cd the-bend-frontend
npm run test:run -- src/deep-links/deepLinkRoutes.test.ts
APPLE_TEAM_ID=ABCDE12345 ANDROID_APP_LINK_SHA256=AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99 node scripts/render-association-files.mjs
npm run cap:sync
```

Expected: tests PASS; both association files contain `community.bend.westmoreland`; Capacitor sync succeeds.

- [ ] **Step 5: Commit deep-link support**

```bash
git add the-bend-frontend/src/deep-links the-bend-frontend/src/auth/pendingDestination.ts the-bend-frontend/src/components/layout/NativeAppShell.tsx the-bend-frontend/src/components/shared/ProtectedRoute.tsx the-bend-frontend/ios/App/App/App.entitlements the-bend-frontend/android/app/src/main/AndroidManifest.xml the-bend-frontend/scripts/render-association-files.mjs the-bend-frontend/package.json
git commit -m "feat(native): add verified Westmoreland deep links"
```

---

## Plan 1 exit gate

Run:

```bash
cd the-bend-frontend
npm run lint
npm run test:run
npm run build
npm run cap:sync
cd ../the-bend-backend
.venv/bin/pytest -q
```

Then install debug builds on one iOS 15+ simulator/device and one Android API 24+ emulator/device. Verify guest Home/Explore, the five native navigation actions, sign-in, process-kill session restore, sign-out, rejected admin links, a public listing link, and an authenticated message link. The plan passes only when the website still renders tenant/admin routes independently and native requests show `X-Tenant-Slug: westmoreland`.
