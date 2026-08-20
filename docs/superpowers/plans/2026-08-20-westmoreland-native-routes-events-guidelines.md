# Westmoreland native routes, events, and Guidelines implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove website chrome from native routes, give focused routes one reliable Back header, secure and render exact event details, and add usable Community Guidelines navigation.

**Architecture:** Add an explicit native presentation context under `NativeAppShell`, a pure route policy for bottom-navigation visibility, and a reusable `NativeRouteFrame` for focused routes. `PageLayout` consumes native context and automatically suppresses website chrome under `NativeRoutes`. Event detail gets a tenant-safe backend lookup and a dedicated native page.

**Tech stack:** FastAPI, SQLAlchemy async, PostgreSQL, React 19, TypeScript 5.9, React Router 7, Vitest, React Testing Library, Capacitor 8, scoped native CSS.

**Spec:** `docs/superpowers/specs/2026-08-20-westmoreland-native-phase-2-ux-design.md`

## Global constraints

- Bottom navigation appears only on `/`, `/explore`, `/bender`, and `/you` after trailing-slash normalization.
- Focused, auth, legal, task, and unmatched routes do not reserve bottom-navigation height.
- Do not infer native presentation from viewport size, user agent, or URL hostname.
- Native `PageLayout` omits website navigation, web bottom navigation, sponsor strip, footer, and install banner.
- Each focused route renders exactly one Back control. Auth pages own their Back control through the auth plan.
- Direct-link Back uses `window.history.state.idx > 0`; otherwise it replaces with the route's approved fallback.
- Protected-route login redirects must not display a stale focused-route header.
- Event detail must hide cross-tenant, inactive, deleted, blocked, unauthorized, and missing records behind one unavailable response.
- Community Guidelines remains public and member-facing.
- Execute Bender plan Task 1 before this plan's event-detail frontend task because both consume `parseSafeExternalUrl`.
- Run backend commands with `uv run --frozen`.
- Use `npx tsc --noEmit`, not TypeScript build mode. The current non-build check is green.
- Complete the Phase 2 index baseline task first. Every commit below starts from a clean tracked tree and stages only its exact Files list.
- Never use `git add .`, `git add -A`, or a directory-wide add.
- No production deployment or store submission is authorized by this plan.

---

## File responsibility map

### Create

- `the-bend-frontend/src/routes/nativeRoutePolicy.ts` owns root-navigation visibility.
- `the-bend-frontend/src/routes/nativeRoutePolicy.test.ts` covers exact and descendant paths.
- `the-bend-frontend/src/components/layout/NativePresentationContext.tsx` exposes explicit native presentation.
- `the-bend-frontend/src/components/layout/NativeRouteFrame.tsx` owns focused-route title, actions, and Back behavior.
- `the-bend-frontend/src/components/layout/NativeRouteFrame.test.tsx` covers history and fallback navigation.
- `the-bend-frontend/src/components/layout/PageLayout.test.tsx` protects native and web chrome.
- `the-bend-backend/tests/test_event_detail_visibility.py` covers tenant and viewer privacy.
- `the-bend-frontend/src/pages/EventDetailPage.tsx` owns exact event loading and rendering.
- `the-bend-frontend/src/pages/EventDetailPage.test.tsx` covers state, source, sharing, and cancellation.

### Modify

- `the-bend-frontend/src/components/layout/NativeAppShell.tsx` provides context and conditional bottom navigation.
- `the-bend-frontend/src/components/layout/NativeAppShell.test.tsx` covers inset and route changes.
- `the-bend-frontend/src/components/layout/PageLayout.tsx` consumes native context.
- `the-bend-frontend/src/routes/NativeRoutes.tsx` applies focused frames and the real event detail.
- `the-bend-frontend/src/routes/NativeRoutes.test.tsx` covers the full route matrix.
- `the-bend-frontend/src/routes/PublicMemberRoutes.tsx` exposes shared event detail URLs to web recipients.
- `the-bend-frontend/src/routes/WebRoutes.test.tsx` protects the public event-detail destination.
- `the-bend-frontend/src/pages/BrowsePage.tsx` suppresses duplicate sponsor content in native presentation.
- `the-bend-frontend/src/pages/ListingDetailPage.tsx` suppresses its duplicate native Back row.
- `the-bend-frontend/src/pages/EventsPage.tsx` suppresses duplicate native chrome and routes cards internally.
- `the-bend-frontend/src/pages/VolunteerPage.tsx` suppresses duplicate native Back.
- `the-bend-frontend/src/pages/TalentPage.tsx` suppresses duplicate native Back.
- `the-bend-frontend/src/pages/MessagesPage.tsx` lets the frame own thread Back behavior.
- `the-bend-frontend/src/services/eventApi.ts` types and cancels event detail requests.
- `the-bend-backend/app/repositories/event_repo.py` adds a visible tenant-scoped lookup.
- `the-bend-backend/app/services/event_service.py` applies one not-found contract.
- `the-bend-backend/app/api/v1/events.py` injects tenant and optional viewer.
- `the-bend-frontend/src/pages/GuidelinesViewPage.tsx` adds section ids, contents, hash focus, and native-only chrome rules.
- `the-bend-frontend/src/pages/GuidelinesViewPage.native.test.tsx` covers contents and Back.
- `the-bend-frontend/src/styles/native.css` owns focused-frame, inset, event, and Guidelines layout.
- `the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx` protects touch and layout rules.

---

### Task 1: Add route policy, presentation context, and focused frame

**Files:**

- Create: `the-bend-frontend/src/routes/nativeRoutePolicy.ts`
- Create: `the-bend-frontend/src/routes/nativeRoutePolicy.test.ts`
- Create: `the-bend-frontend/src/components/layout/NativePresentationContext.tsx`
- Create: `the-bend-frontend/src/components/layout/NativeRouteFrame.tsx`
- Create: `the-bend-frontend/src/components/layout/NativeRouteFrame.test.tsx`
- Create: `the-bend-frontend/src/components/layout/PageLayout.test.tsx`
- Modify: `the-bend-frontend/src/components/layout/NativeAppShell.tsx`
- Modify: `the-bend-frontend/src/components/layout/NativeAppShell.test.tsx`
- Modify: `the-bend-frontend/src/components/layout/PageLayout.tsx`
- Modify: `the-bend-frontend/src/styles/native.css`

**Interfaces:**

```ts
export const NATIVE_ROOT_DESTINATIONS: ReadonlySet<string>

export function showsNativeBottomNavigation(
  pathname: string,
): boolean

export function NativePresentationProvider(
  props: React.PropsWithChildren,
): React.ReactElement

export function useNativePresentation(): boolean

export interface NativeBackButtonProps {
  fallbackPath: string
  label?: string
}

export function NativeBackButton(
  props: NativeBackButtonProps,
): React.ReactElement

export interface NativeRouteFrameProps {
  title: string
  fallbackPath: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function NativeRouteFrame(
  props: NativeRouteFrameProps,
): React.ReactElement
```

`NativeRouteFrame` renders its app-bar title in a non-heading `<span data-testid="native-route-title">`. The child page owns the single logical `h1`. A focused Bender post adds a visually hidden `h1` because its compact post card has no page heading.

- [ ] **Step 1: Write failing policy, frame, shell, and layout tests**

Cover:

- Exact root destinations show bottom navigation.
- Trailing slashes normalize, but `/bender/:postId` and other descendants remain focused.
- Focused routes hide navigation and release its 88px inset.
- Root route transitions restore navigation and inset.
- `NativeBackButton` uses `navigate(-1)` when `history.state.idx > 0`.
- Direct links replace with the fallback.
- Back has a 44-point accessible target.
- `PageLayout` under the provider renders no website chrome or install banner.
- Web `PageLayout` remains unchanged.
- Explicit `embeddedNative` still works in isolated tests.

```ts
expect(showsNativeBottomNavigation('/bender')).toBe(true)
expect(showsNativeBottomNavigation('/bender/00000000-0000-0000-0000-000000000001')).toBe(false)
```

- [ ] **Step 2: Run the tests and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- \
  src/routes/nativeRoutePolicy.test.ts \
  src/components/layout/NativeRouteFrame.test.tsx \
  src/components/layout/PageLayout.test.tsx \
  src/components/layout/NativeAppShell.test.tsx
```

- [ ] **Step 3: Implement the route foundation**

`NativeAppShell` reads `useLocation()`, wraps `Outlet` in `NativePresentationProvider`, sets `data-bottom-navigation="visible|hidden"` on `.native-main`, and conditionally renders `NativeBottomNav`.

`PageLayout` computes:

```ts
const embedded = embeddedNative || useNativePresentation()
```

Back behavior is:

```ts
const canGoBack =
  typeof window.history.state?.idx === 'number' &&
  window.history.state.idx > 0

if (canGoBack) navigate(-1)
else navigate(fallbackPath, { replace: true })
```

Split bottom inset with:

```css
.native-main[data-bottom-navigation="visible"] {
  padding-bottom: calc(88px + var(--native-safe-bottom));
}

.native-main[data-bottom-navigation="hidden"] {
  padding-bottom: var(--native-safe-bottom);
}
```

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run the Step 2 command again.

- [ ] **Step 5: Commit the route foundation**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/routes/nativeRoutePolicy.ts \
  the-bend-frontend/src/routes/nativeRoutePolicy.test.ts \
  the-bend-frontend/src/components/layout/NativePresentationContext.tsx \
  the-bend-frontend/src/components/layout/NativeRouteFrame.tsx \
  the-bend-frontend/src/components/layout/NativeRouteFrame.test.tsx \
  the-bend-frontend/src/components/layout/PageLayout.test.tsx \
  the-bend-frontend/src/components/layout/NativeAppShell.tsx \
  the-bend-frontend/src/components/layout/NativeAppShell.test.tsx \
  the-bend-frontend/src/components/layout/PageLayout.tsx \
  the-bend-frontend/src/styles/native.css
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(native): add route-aware focused shell"
```

---

### Task 2: Apply the native route matrix and remove duplicate chrome

**Files:**

- Modify: `the-bend-frontend/src/routes/NativeRoutes.tsx`
- Modify: `the-bend-frontend/src/routes/NativeRoutes.test.tsx`
- Modify: `the-bend-frontend/src/pages/BrowsePage.tsx`
- Modify: `the-bend-frontend/src/pages/ListingDetailPage.tsx`
- Modify: `the-bend-frontend/src/pages/EventsPage.tsx`
- Modify: `the-bend-frontend/src/pages/VolunteerPage.tsx`
- Modify: `the-bend-frontend/src/pages/TalentPage.tsx`
- Modify: `the-bend-frontend/src/pages/MessagesPage.tsx`
- Modify: `the-bend-frontend/src/styles/native.css`

- [ ] **Step 1: Write failing parameterized route tests**

Use the exact matrix from specification section 5.2. Assert navigation state, frame title, fallback, access wrapper, and page component for every route. Add specific tests for one Back control, protected login without a stale frame, exact `EventDetailPage`, authenticated Messages action on a focused Bender post, and the native Page unavailable frame.

```tsx
it.each([
  ['/listing/00000000-0000-0000-0000-000000000001', 'Listing'],
  ['/business/00000000-0000-0000-0000-000000000001', 'Business'],
  ['/events/00000000-0000-0000-0000-000000000001', 'Event'],
])('renders one focused header for %s', (path, title) => {
  renderNativeRoute(path)
  expect(screen.getByTestId('native-route-title')).toHaveTextContent(title)
  expect(screen.getAllByRole('button', { name: 'Go back' })).toHaveLength(1)
})
```

- [ ] **Step 2: Run route tests and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- src/routes/NativeRoutes.test.tsx src/components/layout/NativeAppShell.test.tsx src/components/layout/NativeRouteFrame.test.tsx src/routes/WebRoutes.test.tsx
```

- [ ] **Step 3: Apply focused frames**

Place `NativeRouteFrame` inside `ProtectedRoute` for protected destinations. Shared pages use `useNativePresentation()` to suppress internal Back rows or sponsor content only in native mode. Add `showBackButton?: boolean` to the private `ChatView` props with a default of `true`; `MessagesPage` passes `showBackButton={!native}` for native threads.

For focused Bender, wrap the existing page with `title="Bender post"`, fallback `/bender`, and an authenticated Messages icon action. The action is a small private component in `NativeRoutes.tsx` that reads the existing auth store and calls `navigate('/messages')`. Bender plan Task 4 suppresses the internal sticky header in focused native mode and adds the focused page's visually hidden `h1`.

- [ ] **Step 4: Run route and affected page tests**

```bash
npm run test:run -- \
  src/routes/NativeRoutes.test.tsx \
  src/components/layout/NativeAppShell.test.tsx \
  src/components/layout/NativeRouteFrame.test.tsx \
  src/pages/BenderPage.native.test.tsx \
  src/pages/GuidelinesViewPage.native.test.tsx \
  src/routes/WebRoutes.test.tsx
```

- [ ] **Step 5: Commit the route matrix**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/routes/NativeRoutes.tsx \
  the-bend-frontend/src/routes/NativeRoutes.test.tsx \
  the-bend-frontend/src/pages/BrowsePage.tsx \
  the-bend-frontend/src/pages/ListingDetailPage.tsx \
  the-bend-frontend/src/pages/EventsPage.tsx \
  the-bend-frontend/src/pages/VolunteerPage.tsx \
  the-bend-frontend/src/pages/TalentPage.tsx \
  the-bend-frontend/src/pages/MessagesPage.tsx \
  the-bend-frontend/src/styles/native.css
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(native): apply focused route matrix"
```

---

### Task 3: Secure event detail in the backend

**Files:**

- Create: `the-bend-backend/tests/test_event_detail_visibility.py`
- Modify: `the-bend-backend/app/repositories/event_repo.py`
- Modify: `the-bend-backend/app/services/event_service.py`
- Modify: `the-bend-backend/app/api/v1/events.py`

**Interfaces:**

```py
async def get_visible_by_id(
    self,
    event_id: UUID,
    tenant_id: UUID,
    viewer_id: UUID | None = None,
) -> Event | None:
    ...
```

- [ ] **Step 1: Write failing visibility tests**

Cover active same-tenant success, cross-tenant, inactive, deleted or missing, blocked author, legacy event with no author, unresolved tenant, and cross-tenant viewer treated as anonymous.

- [ ] **Step 2: Run the tests and confirm RED**

```bash
cd the-bend-backend
uv run --frozen pytest tests/test_event_detail_visibility.py -q
```

Expected: the current unscoped detail lookup exposes records that discovery hides.

- [ ] **Step 3: Implement the visible lookup**

Require event id, tenant id, active status, and the same viewer-block exclusion used by discovery. Preserve legacy events with no author. `EventService.get_event` raises the existing `NotFoundError('Event')` for every hidden case. The endpoint injects current tenant and optional viewer; a viewer from another tenant becomes anonymous.

- [ ] **Step 4: Run event and discovery backend tests**

```bash
uv run --frozen pytest tests/test_event_detail_visibility.py tests/test_user_block_discovery.py -q
```

- [ ] **Step 5: Commit backend event privacy**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-backend/tests/test_event_detail_visibility.py \
  the-bend-backend/app/repositories/event_repo.py \
  the-bend-backend/app/services/event_service.py \
  the-bend-backend/app/api/v1/events.py
git diff --cached --name-only
git diff --cached --check
git commit -m "fix(events): scope event details to visible tenant"
```

---

### Task 4: Implement the real native event detail page

**Files:**

- Create: `the-bend-frontend/src/pages/EventDetailPage.tsx`
- Create: `the-bend-frontend/src/pages/EventDetailPage.test.tsx`
- Modify: `the-bend-frontend/src/services/eventApi.ts`
- Modify: `the-bend-frontend/src/routes/NativeRoutes.tsx`
- Modify: `the-bend-frontend/src/routes/NativeRoutes.test.tsx`
- Modify: `the-bend-frontend/src/routes/PublicMemberRoutes.tsx`
- Modify: `the-bend-frontend/src/routes/WebRoutes.test.tsx`
- Modify: `the-bend-frontend/src/pages/EventsPage.tsx`
- Modify: `the-bend-frontend/src/styles/native.css`

**Consumes:**

```ts
export function parseSafeExternalUrl(
  raw: string | null | undefined,
): SafeExternalUrl | null

export function publicWestmorelandUrl(path: string): string
```

**Interfaces:**

```ts
export interface PublicRequestOptions {
  signal?: AbortSignal
}

type EventDetailState =
  | { status: 'loading' }
  | { status: 'success'; event: CommunityEvent }
  | { status: 'unavailable' }
  | { status: 'error'; error: Error }
```

- [ ] **Step 1: Write failing API, page, and route tests**

Cover typed success, image fallback, category, time, location, description, canonical public share URL under a simulated Capacitor local origin, safe source attribution, rejected source URL, 400, 401, 403, 404, and 422 as one unavailable state, network, 408, 429, and 5xx as Retry, retry recovery, id-change cancellation, stale-content removal, native direct routing, public web direct routing, and internal event-card navigation. The public web test must prove `/events/:eventId` renders EventDetailPage with ordinary web PageLayout chrome instead of Not Found or NativeRouteFrame.

```tsx
expect(screen.getByRole('link', { name: 'View source' })).not.toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Retry event' })).toBeInTheDocument()
```

- [ ] **Step 2: Run tests and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- src/pages/EventDetailPage.test.tsx src/routes/NativeRoutes.test.tsx src/routes/WebRoutes.test.tsx src/native/discovery/adapters.test.ts
```

- [ ] **Step 3: Implement typed, abortable event detail**

`eventApi.getDetail` returns `AxiosResponse<CommunityEvent>` and accepts `AbortSignal`. Reset to loading on each id, abort on id change or unmount, and ignore obsolete completions. Open valid sources with `usePlatformServices().browser.open`. Build the ShareButton URL with `publicWestmorelandUrl` and the path `/events/${event.id}`; never derive a public mobile share from `window.location.origin`.

Register the same EventDetailPage at `/events/:eventId` in `PublicMemberRoutes`. EventDetailPage uses PageLayout so the public web route retains website chrome while the native presentation context suppresses it inside NativeRouteFrame. The page owns one `h1` in both presentations. Do not create a second event-detail implementation.

Native event cards navigate internally. Preserve the source URL as the secondary `View source` action. Web Events behavior remains unchanged.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the Step 2 command again, then:

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run build:native
```

- [ ] **Step 5: Commit event detail**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/pages/EventDetailPage.tsx \
  the-bend-frontend/src/pages/EventDetailPage.test.tsx \
  the-bend-frontend/src/services/eventApi.ts \
  the-bend-frontend/src/routes/NativeRoutes.tsx \
  the-bend-frontend/src/routes/NativeRoutes.test.tsx \
  the-bend-frontend/src/routes/PublicMemberRoutes.tsx \
  the-bend-frontend/src/routes/WebRoutes.test.tsx \
  the-bend-frontend/src/pages/EventsPage.tsx \
  the-bend-frontend/src/styles/native.css
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(native): add event detail route"
```

---

### Task 5: Add Community Guidelines contents and hash focus

**Files:**

- Modify: `the-bend-frontend/src/pages/GuidelinesViewPage.tsx`
- Modify: `the-bend-frontend/src/pages/GuidelinesViewPage.native.test.tsx`
- Modify: `the-bend-frontend/src/routes/NativeRoutes.tsx`
- Modify: `the-bend-frontend/src/routes/NativeRoutes.test.tsx`
- Modify: `the-bend-frontend/src/styles/native.css`

**Interfaces:**

```ts
export const GUIDELINE_SECTIONS = [
  { id: 'purpose-mission', label: '1. Purpose & Mission' },
  { id: 'membership-eligibility', label: '2. Membership & Eligibility' },
  { id: 'acceptable-use', label: '3. Acceptable Use' },
  { id: 'listings-transactions', label: '4. Listings & Transactions' },
  { id: 'events-community-features', label: '5. Events & Community Features' },
  { id: 'advertising-sponsored-content', label: '6. Advertising & Sponsored Content' },
  { id: 'limitation-liability', label: '7. Limitation of Liability' },
  { id: 'privacy-data', label: '8. Privacy & Data' },
  { id: 'content-moderation-enforcement', label: '9. Content Moderation & Enforcement' },
  { id: 'modifications', label: '10. Modifications' },
  { id: 'contact', label: '11. Contact' },
] as const
```

Do not rewrite guideline content in this task.

- [ ] **Step 1: Write failing contents and Back tests**

Prove all current top-level sections render in document order, `On this page` is a compact disclosure, selection replaces the hash and focuses the matching `tabIndex={-1}` heading, a known direct hash focuses after render, an unknown hash does nothing, native hero and breadcrumb are suppressed, and direct-link Back falls back to Home through the shared frame.

- [ ] **Step 2: Run tests and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- src/pages/GuidelinesViewPage.native.test.tsx src/components/layout/NativeRouteFrame.test.tsx src/routes/NativeRoutes.test.tsx
```

- [ ] **Step 3: Implement native contents navigation**

Render a native-only `<details>` with `<summary>On this page</summary>`. Navigate to the same pathname and search with the selected hash using `{ replace: true }`. After route render, focus and scroll known headings. Honor reduced motion. Unknown hashes leave focus and scroll unchanged.

- [ ] **Step 4: Run route workstream verification**

```bash
npm run test:run -- \
  src/routes/nativeRoutePolicy.test.ts \
  src/components/layout/NativeRouteFrame.test.tsx \
  src/components/layout/PageLayout.test.tsx \
  src/components/layout/NativeAppShell.test.tsx \
  src/routes/NativeRoutes.test.tsx \
  src/pages/EventDetailPage.test.tsx \
  src/pages/GuidelinesViewPage.native.test.tsx \
  src/pages/BenderPage.native.test.tsx \
  src/routes/WebRoutes.test.tsx \
  src/components/native/ui/NativeComponents.test.tsx
npx tsc --noEmit
npm run lint
npm run build
npm run build:native
cd ../the-bend-backend
uv run --frozen pytest tests/test_event_detail_visibility.py -q
```

- [ ] **Step 5: Commit Guidelines navigation**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/pages/GuidelinesViewPage.tsx \
  the-bend-frontend/src/pages/GuidelinesViewPage.native.test.tsx \
  the-bend-frontend/src/routes/NativeRoutes.tsx \
  the-bend-frontend/src/routes/NativeRoutes.test.tsx \
  the-bend-frontend/src/styles/native.css
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(native): add guideline section navigation"
```

---

### Task 6: Verify focused routes, events, and Guidelines on both platforms

**Files:**

- Create locally, do not track: `.superpowers/sdd/2026-08-20-native-phase-2/routes-events-guidelines/`

- [ ] **Step 1: Use the final exact-source installed packages**

```bash
cd "$(git rev-parse --show-toplevel)"
PHASE2_SOURCE_COMMIT="$(git rev-parse HEAD)"
test -f the-bend-frontend/android/app/build/outputs/apk/debug/app-debug.apk
test -d "/tmp/bend-native-phase2-$PHASE2_SOURCE_COMMIT/Build/Products/Debug-iphonesimulator/App.app"
```

First execute the index plan's Full verification and package gate. It runs Gradle and Xcode, hashes both artifacts, installs the APK on `emulator-5554`, and installs the simulator app on `C824154C-356B-4B2C-BDF1-2DC8F71BDB23`. Do not substitute an older installed build or rerun only `build:native` and `cap copy`.

- [ ] **Step 2: Verify the route matrix**

Check all four roots, one direct deep link for each focused public route, a guest protected redirect, an authenticated thread route, one Back-history case, and one direct-link fallback. Confirm one header, one Back control, no website chrome, no install banner, correct bottom inset, and status-bar clearance.

- [ ] **Step 3: Verify event and Guidelines states**

Check event success, safe source, unavailable without Retry, transient Retry, id change, and internal event navigation. Check Guidelines contents order, known and unknown hashes, Back, large text, and dark mode.

- [ ] **Step 4: Run TalkBack and VoiceOver and record evidence**

Operate focused Back, event Retry and source, and Guidelines contents with TalkBack and VoiceOver. Record source commit, APK SHA-256, app-bundle path, simulator identifiers, and evidence names. Return both simulators to Home.
