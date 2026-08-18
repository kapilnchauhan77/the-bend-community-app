# Westmoreland Native UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the web-derived native Home and Explore presentation with an accessible, warm, modern Westmoreland dashboard and unified discovery experience while preserving the website, shared APIs, tenant lock, authentication, cache privacy, deep links, and mutation safety.

**Architecture:** Keep domain types, API clients, tenant/auth state, platform services, and the public-content cache shared. Add a native-only presentation boundary beneath `NativeAppShell`, normalize heterogeneous public entities through pure view-model adapters, and let dedicated Home and Explore hooks own independent request states. Native styles are scoped under `.native-app`; web routes continue to render the existing web pages.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Vitest, React Testing Library, Tailwind CSS 4, scoped CSS custom properties, Lucide React, Capacitor 8, Capacitor Haptics/Geolocation/Network, Android Gradle, Xcode/iOS Simulator.

**Spec:** `docs/superpowers/specs/2026-08-18-westmoreland-native-ui-redesign-design.md`

## Global Constraints

- Implement only Phase 1: native design primitives, shell/navigation, Home, Explore, contextual location/map behavior, accessibility, dark mode, and simulator evidence.
- Do not redesign listing, business, event, Bender, message, profile, endorsement, settings, authentication, or creation detail screens.
- Do not modify the web `HomePage`, web `ExplorePage`, desktop navigation, global body typography, or global heading rules.
- Preserve the actual web routing baseline: `PublicMemberRoutes` maps `/` to `HomePage` and currently has no `/explore` route, so web `/explore` must continue to render `NotFoundPage`. Do not add a web Explore route as part of native Phase 1.
- Do not add backend routes, schemas, cross-type ranking, personalized ranking, background location, or private-coordinate storage.
- Use `listingApi.getOpportunities` for Volunteer results. Do not introduce the separate volunteer-directory API into Phase 1 discovery.
- Treat only businesses as mappable in Phase 1 because `Shop` is the only approved public type with latitude/longitude fields. Listings, events, and opportunity listings must produce `coordinates: null`.
- The current public business directory omits coordinates and may return `has_more` without `next_cursor`. This plan uses bounded public business-detail hydration only after a business-bearing result set is visible, solely to establish map eligibility, and never invents a pagination cursor.
- Never request location on launch, Home load, ordinary search, or ordinary list browsing. Request it only after an explicit Near me or location-dependent map action.
- Keep all public cache writes inside the existing `ContentCache` projection and size/age boundaries. Never cache search queries, auth state, messages, precise device coordinates, or mutation responses.
- Guest browsing remains public. Posting, saving, messaging, endorsing, and protected tabs keep their existing online/auth requirements.
- Preserve existing deep-link allowlists and protected-route behavior. A Create continuation must store only an allowlisted path plus a typed action identifier and must be consumed once.
- Preserve the current web fallback services. Native-only haptics must have a web no-op adapter.
- Respect `prefers-reduced-motion`, 44-by-44-point targets, text scaling, semantic landmarks, safe areas, keyboard insets, and light/dark semantic colors.
- Before each commit, inspect `git diff --check` and `git status --short`. Never stage the pre-existing iOS SwiftPM changes unless a later, separately authorized task owns them:
  - `the-bend-frontend/ios/App/CapApp-SPM/Package.swift`
  - `the-bend-frontend/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/`
- Keep `the-bend-backend/uv.lock` byte-identical; expected SHA-256 at plan creation is `c59e3d361f8f175c3d661018029aeb9df00761b74d70f79d6d1e3971fcc59082`.
- No production deployment or app-store submission is authorized by this plan. Simulator success is an evidence gate, not release approval.

---

## File Responsibility Map

### Create

- `the-bend-frontend/src/styles/native.css` — tokens and selectors scoped beneath `.native-app`, including dark mode, safe-area spacing, reduced motion, fixed media geometry, and bottom-sheet insets.
- `the-bend-frontend/src/components/native/ui/NativePageHeader.tsx` — compact Bend/Westmoreland identity and optional notification/account action.
- `the-bend-frontend/src/components/native/ui/NativeSearchBar.tsx` — controlled search entry with submit, clear, and accessible label.
- `the-bend-frontend/src/components/native/ui/NativeQuickAction.tsx` — 44-point action tile with icon, label, and callback.
- `the-bend-frontend/src/components/native/ui/NativeSectionHeader.tsx` — semantic section title and optional See all action.
- `the-bend-frontend/src/components/native/ui/NativeUrgentCard.tsx` — compact urgent-need presentation.
- `the-bend-frontend/src/components/native/ui/NativeDiscoveryCard.tsx` — shared listing/business/event/volunteer card shell.
- `the-bend-frontend/src/components/native/ui/NativeFilterChip.tsx` — selected/removable type and filter chip.
- `the-bend-frontend/src/components/native/ui/NativeFilterSheet.tsx` — focus-managed secondary-filter sheet.
- `the-bend-frontend/src/components/native/ui/NativeResultGroup.tsx` — independently resolving grouped result section.
- `the-bend-frontend/src/components/native/ui/NativeFeedback.tsx` — `NativeEmptyState`, `NativeInlineError`, and `NativeSkeleton`.
- `the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx` — primitive states, semantics, target sizes, and callback contracts.
- `the-bend-frontend/src/platform/native/NativeHapticsService.ts` and `NativeHapticsService.test.ts` — Capacitor haptic adapter and capability/error behavior.
- `the-bend-frontend/src/platform/web/WebHapticsService.ts` — browser no-op implementation.
- `the-bend-frontend/src/components/layout/NativeAppShell.test.tsx` — scope, scroll-root registration, and safe shell behavior.
- `the-bend-frontend/src/components/layout/NativeBottomNav.test.tsx` — root navigation, active reselect, Create semantics, protected tabs, and haptics.
- `the-bend-frontend/src/components/layout/PostActionSheet.test.tsx` — focus, dismissal, typed continuation, and haptics.
- `the-bend-frontend/src/native/discovery/types.ts` — native view-model, query, section-state, and map types.
- `the-bend-frontend/src/native/discovery/adapters.ts` and `adapters.test.ts` — pure listing/business/event/opportunity formatters.
- `the-bend-frontend/src/native/discovery/queries.ts` and `queries.test.ts` — URL parser/serializer and API parameter translation.
- `the-bend-frontend/src/hooks/useNativeHome.ts` and `useNativeHome.test.tsx` — independent Home section orchestration.
- `the-bend-frontend/src/pages/native/NativeHomePage.tsx` and `NativeHomePage.test.tsx` — approved Home composition and public/member behavior.
- `the-bend-frontend/src/hooks/useNativeExplore.ts` and `useNativeExplore.test.tsx` — grouped All requests, typed pagination, debounced search, stale-response rejection, and local retries.
- `the-bend-frontend/src/pages/native/NativeExplorePage.tsx` and `NativeExplorePage.test.tsx` — URL-owned Explore composition, filters, list/map mode, and contextual permission UI.
- `the-bend-frontend/src/components/native/NativeExploreMap.tsx` and `NativeExploreMap.test.tsx` — lazy, business-only map and marker preview.

### Modify

- `the-bend-frontend/src/components/layout/NativeAppShell.tsx` — import native CSS, establish `.native-app`, own safe-area layout, and provide root-scroll coordination.
- `the-bend-frontend/src/components/layout/NativeBottomNav.tsx` — Home/Explore/Create/Inbox/You presentation, active reselect, safe-area behavior, and haptics.
- `the-bend-frontend/src/components/layout/PostActionSheet.tsx` — Create wording, typed pending intent, selection haptics, and existing focus behavior.
- `the-bend-frontend/src/auth/pendingDestination.ts` and test — optional allowlisted Create action metadata without breaking existing path-only callers.
- `the-bend-frontend/src/platform/contracts.ts` — `HapticsService` contract and `PlatformServices.haptics`.
- `the-bend-frontend/src/platform/native/NativePlatformServices.ts` — native haptics instance.
- `the-bend-frontend/src/platform/web/WebPlatformServices.ts` — web no-op haptics instance.
- `the-bend-frontend/src/platform/createPlatformServices.test.ts` — both runtime branches satisfy the new contract.
- `the-bend-frontend/src/services/shopApi.ts` — typed business directory response and accepted query parameters.
- `the-bend-frontend/src/services/eventApi.ts` — typed public list/upcoming/detail responses.
- `the-bend-frontend/src/services/listingApi.ts` — typed stories response if the existing `SuccessStory` type is sufficient.
- `the-bend-frontend/src/services/sponsorApi.ts` — typed public sponsor response.
- `the-bend-frontend/src/types/index.ts` — only missing public response types; do not duplicate existing domain models.
- `the-bend-frontend/src/hooks/useCachedPublicContent.ts` and test — additive explicit status/error output while retaining all existing fields and lifecycle guarantees.
- `the-bend-frontend/src/routes/NativeRoutes.tsx` and test — dedicated native Home/Explore routes.
- `the-bend-frontend/src/routes/WebRoutes.test.tsx` — prove the existing web page mappings remain intact.

---

### Task 1: Establish native-scoped visual foundations and primitive components

**Files:**
- Create: `src/styles/native.css`
- Create: `src/components/native/ui/NativePageHeader.tsx`
- Create: `src/components/native/ui/NativeSearchBar.tsx`
- Create: `src/components/native/ui/NativeQuickAction.tsx`
- Create: `src/components/native/ui/NativeSectionHeader.tsx`
- Create: `src/components/native/ui/NativeUrgentCard.tsx`
- Create: `src/components/native/ui/NativeDiscoveryCard.tsx`
- Create: `src/components/native/ui/NativeFilterChip.tsx`
- Create: `src/components/native/ui/NativeFilterSheet.tsx`
- Create: `src/components/native/ui/NativeResultGroup.tsx`
- Create: `src/components/native/ui/NativeFeedback.tsx`
- Create: `src/components/native/ui/NativeComponents.test.tsx`
- Modify: `src/components/layout/NativeAppShell.tsx`

**Interfaces:**

~~~ts
export interface NativeSearchBarProps {
  value: string
  label: string
  placeholder: string
  onChange(value: string): void
  onSubmit(): void
  onClear(): void
}

export interface NativeDiscoveryCardModel {
  id: string
  kind: 'listing' | 'business' | 'event' | 'volunteer'
  label: string
  title: string
  supportingText: string
  thumbnailUrl: string | null
  targetPath: string
  coordinates: { latitude: number; longitude: number } | null
  urgent: boolean
}

export interface NativeResultGroupProps {
  heading: string
  status: 'loading' | 'success' | 'empty' | 'error'
  count?: number
  onRetry(): void
  onSeeAll?(): void
  children: React.ReactNode
}
~~~

- [ ] **Step 1: Write failing primitive contract tests**

Cover controlled search submit/clear, one `h2` per result group, Retry callbacks, removable-chip labels, urgent text independent of color, fixed image width/height attributes, 44-point control classes, sheet focus/escape/backdrop/return-focus, and loading/empty/error render states.

~~~tsx
it('announces urgency and preserves a direct destination', () => {
  render(<NativeUrgentCard item={urgentListing} onOpen={onOpen} />)
  expect(screen.getByText(/urgent need/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /generator/i }))
  expect(onOpen).toHaveBeenCalledWith('/listing/listing-1')
})

it('labels an active removable filter', () => {
  render(<NativeFilterChip label="Urgent" selected removable onRemove={onRemove} />)
  fireEvent.click(screen.getByRole('button', { name: /remove urgent filter/i }))
  expect(onRemove).toHaveBeenCalledOnce()
})
~~~

- [ ] **Step 2: Run the focused suite and confirm red**

Run: `cd the-bend-frontend && npm run test:run -- src/components/native/ui/NativeComponents.test.tsx`

Expected: FAIL because the native UI components do not exist.

- [ ] **Step 3: Add semantic native tokens under one root**

`NativeAppShell` imports `@/styles/native.css` and renders:

~~~tsx
return (
  <NativeAppShellProvider value={scrollCoordinator}>
    <div className="native-app">
      <main id="native-main" className="native-main">
        <Outlet />
      </main>
      <NativeBottomNav />
    </div>
  </NativeAppShellProvider>
)
~~~

Define light tokens on `.native-app` and dark tokens on `.dark .native-app`. Use the approved semantic values:

~~~css
.native-app {
  --native-page: #f7f3ea;
  --native-card: #fffdf8;
  --native-elevated: #ffffff;
  --native-text: #1f2a24;
  --native-muted: #68716c;
  --native-primary: #2b5b49;
  --native-primary-contrast: #ffffff;
  --native-bronze: #a77935;
  --native-urgent-surface: #fff0ee;
  --native-urgent-border: #d96a5e;
  --native-urgent-text: #8f3027;
  --native-border: #ded7ca;
  --native-focus: #2d6f9f;
  --native-shadow: 0 8px 24px rgb(31 42 36 / 10%);
  --native-space-1: 4px;
  --native-space-2: 8px;
  --native-space-3: 12px;
  --native-space-4: 16px;
  --native-space-6: 24px;
  --native-space-8: 32px;
  --native-radius-card: 18px;
  --native-radius-control: 16px;
  --native-radius-pill: 999px;
  --native-nav-height: 68px;
  --native-safe-top: env(safe-area-inset-top, 0px);
  --native-safe-bottom: env(safe-area-inset-bottom, 0px);
  --native-keyboard-bottom: 0px;
  --native-duration-short: 140ms;
  --native-duration-medium: 220ms;
  min-height: 100dvh;
  color: var(--native-text);
  background: var(--native-page);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
}

.dark .native-app {
  --native-page: #121915;
  --native-card: #18221d;
  --native-elevated: #202c26;
  --native-text: #f4f0e7;
  --native-muted: #b6bdb8;
  --native-primary: #70b99b;
  --native-primary-contrast: #101814;
  --native-bronze: #d0a45f;
  --native-urgent-surface: #3a201e;
  --native-urgent-border: #d97b70;
  --native-urgent-text: #ffb6ad;
  --native-border: #33433a;
  --native-focus: #8cc9ef;
  --native-shadow: 0 10px 28px rgb(0 0 0 / 28%);
}

.native-main {
  min-height: 100dvh;
  padding-bottom: calc(var(--native-nav-height) + env(safe-area-inset-bottom));
}

@media (prefers-reduced-motion: reduce) {
  .native-app *, .native-app *::before, .native-app *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
~~~

`NativeAppShell` keeps a root ref and listens to `window.visualViewport.resize`. Set `--native-keyboard-bottom` to `Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop) + 'px'`, reset it on cleanup, and cover listener removal in `NativeAppShell.test.tsx`. Bottom sheets add the keyboard inset to `max(16px, var(--native-safe-bottom))` so focused controls remain above the software keyboard.

For native appearance, keep the existing explicit `localStorage.theme` preference authoritative. When it is absent, `NativeAppShell` observes `matchMedia('(prefers-color-scheme: dark)')` and toggles `document.documentElement.classList` accordingly, including listener cleanup. This behavior lives in the native shell and must not change the website's current theme initialization.

- [ ] **Step 4: Implement the primitives as presentation-only components**

Every component receives data and callbacks through props. No primitive imports an API client, store, router hook, tenant hook, or platform service. `NativePageHeader` renders the compact B mark beside the full “THE BEND / COMMUNITY” wordmark and a separate Westmoreland context label; it must not fall back to a lone B as the complete identity. `NativeFilterSheet` uses the existing dialog behavior pattern: focus the close control on open, trap Tab within enabled controls, close on Escape/backdrop, and return focus to its trigger.

- [ ] **Step 5: Prove native styling does not alter the web root**

Add an assertion that `NativeAppShell` owns the only `native-app` root in a rendered native route. Confirm `src/index.css` is unchanged.

Run:

~~~bash
cd the-bend-frontend
npm run test:run -- src/components/native/ui/NativeComponents.test.tsx src/components/layout/NativeAppShell.test.tsx
npm run lint
npm run build
~~~

Expected: focused tests PASS; lint PASS; web build PASS with only previously documented bundle warnings.

- [ ] **Step 6: Commit only Task 1 files**

~~~bash
git add the-bend-frontend/src/styles/native.css \
  the-bend-frontend/src/components/native/ui \
  the-bend-frontend/src/components/layout/NativeAppShell.tsx \
  the-bend-frontend/src/components/layout/NativeAppShell.test.tsx
git diff --cached --check
git commit -m "feat(native-ui): add scoped design primitives"
~~~

---

### Task 2: Refine the native shell, five-tab navigation, haptics, and Create continuation

**Files:**
- Create: `src/platform/native/NativeHapticsService.ts`
- Create: `src/platform/native/NativeHapticsService.test.ts`
- Create: `src/platform/web/WebHapticsService.ts`
- Create: `src/components/layout/NativeBottomNav.test.tsx`
- Create: `src/components/layout/PostActionSheet.test.tsx`
- Modify: `src/platform/contracts.ts`
- Modify: `src/platform/native/NativePlatformServices.ts`
- Modify: `src/platform/web/WebPlatformServices.ts`
- Modify: `src/platform/createPlatformServices.test.ts`
- Modify: `src/components/layout/NativeAppShell.tsx`
- Modify: `src/components/layout/NativeBottomNav.tsx`
- Modify: `src/components/layout/PostActionSheet.tsx`
- Modify: `src/auth/pendingDestination.ts`
- Modify: `src/auth/pendingDestination.test.ts`
- Modify: `src/routes/NativeRoutes.test.tsx`

**Interfaces:**

~~~ts
export type HapticKind = 'selection' | 'impact' | 'success'

export interface HapticsService {
  selection(): Promise<void>
  impact(): Promise<void>
  success(): Promise<void>
}

export type NativeRootTab = 'home' | 'explore' | 'inbox' | 'you'

export interface NativeAppShellContextValue {
  registerRootScroll(tab: NativeRootTab, element: HTMLElement | null): void
  scrollRootToTop(tab: NativeRootTab): void
}

export type NativeCreateAction =
  | 'offer-listing'
  | 'request-listing'
  | 'bender-post'

export interface NativePendingIntent {
  destination: string
  action: NativeCreateAction | null
}
~~~

- [ ] **Step 1: Write failing haptics, navigation, and pending-intent tests**

Cover native adapter method mapping, rejected plugin calls being swallowed as best-effort feedback, web no-op behavior, Create wording, active Home/Explore reselect, inactive-root navigation, `aria-current`, safe-area nav class, detail-route history preservation, Create selection haptic, focus return, allowlisted action/path pairs, malicious path rejection, and one-time consumption.

~~~tsx
it('scrolls an already-selected Explore root instead of pushing another entry', () => {
  renderNavAt('/explore')
  fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
  expect(scrollRootToTop).toHaveBeenCalledWith('explore')
  expect(navigate).not.toHaveBeenCalled()
})

it('stores an allowlisted Create intent for a guest', () => {
  setPendingIntent({ destination: '/create?type=offer', action: 'offer-listing' })
  expect(getPendingIntent()).toEqual({
    destination: '/create?type=offer',
    action: 'offer-listing',
  })
})
~~~

- [ ] **Step 2: Run the focused tests and confirm red**

Run:

~~~bash
cd the-bend-frontend
npm run test:run -- src/platform/native/NativeHapticsService.test.ts \
  src/platform/createPlatformServices.test.ts \
  src/components/layout/NativeBottomNav.test.tsx \
  src/components/layout/PostActionSheet.test.tsx \
  src/auth/pendingDestination.test.ts
~~~

Expected: FAIL because haptics, shell coordination, and typed intents are absent.

- [ ] **Step 3: Implement haptics through the platform contract**

Map `selection` to `Haptics.selectionChanged()`, `impact` to `Haptics.impact({ style: ImpactStyle.Medium })`, and `success` to `Haptics.notification({ type: NotificationType.Success })`. Each method catches plugin/capability errors because haptics must never block navigation. Do not use a web vibration fallback; native output remains governed by the operating system's haptic accessibility and device settings. The web adapter returns resolved promises.

Add `haptics: HapticsService` to `PlatformServices` and construct the correct adapter in native and web service factories.

- [ ] **Step 4: Add shell scroll coordination**

The shell owns a ref map keyed by `NativeRootTab`. `registerRootScroll` stores or deletes a root element. `scrollRootToTop` calls `element.scrollTo({ top: 0, behavior })`, using `auto` when reduced motion is requested and `smooth` otherwise. Home and Explore pages will register their scroll containers in later tasks.

- [ ] **Step 5: Replace Post wording with Create and preserve auth continuation**

Use this action map:

~~~ts
const createActions = [
  { action: 'offer-listing', label: 'Offer something', path: '/create?type=offer' },
  { action: 'request-listing', label: 'Request something', path: '/create?type=request' },
  { action: 'bender-post', label: 'Share on Bender', path: '/bender' },
] as const
~~~

`NativeBottomNav` renders Home, Explore, Create, Inbox, You. Inactive root tabs navigate. Active Home/Explore tabs call `scrollRootToTop`. Create calls `haptics.impact()` then opens the sheet. An action calls `haptics.selection()`, stores `NativePendingIntent` for guests, and reuses the current login destination behavior.

Keep `setPendingDestination(path)`, `getPendingDestination()`, and `consumePendingDestination()` byte-for-byte compatible for protected routes, push, deep links, and the existing `native_pending_post_path` storage assertion. Store Create action metadata under a second key, `native_pending_create_action`.

`setPendingIntent` first validates an exact allowlisted pair, writes the destination through `setPendingDestination`, then writes the action key. `getPendingIntent` combines the two values only when the pair still matches. `consumePendingIntent` returns that validated pair once and clears both keys. `clearPendingDestination` also clears the action key so successful login, cancellation, and ordinary path-only continuation cannot leave stale action metadata.

- [ ] **Step 6: Run shell and routing regression tests**

~~~bash
cd the-bend-frontend
npm run test:run -- src/platform/native/NativeHapticsService.test.ts \
  src/platform/createPlatformServices.test.ts \
  src/components/layout/NativeAppShell.test.tsx \
  src/components/layout/NativeBottomNav.test.tsx \
  src/components/layout/PostActionSheet.test.tsx \
  src/auth/pendingDestination.test.ts \
  src/deep-links/useDeepLinks.integration.test.tsx \
  src/hooks/usePushNotifications.test.ts \
  src/routes/NativeRoutes.test.tsx
npm run lint
~~~

Expected: all focused tests PASS and existing path-only continuation callers remain green.

- [ ] **Step 7: Commit only Task 2 files**

~~~bash
git add the-bend-frontend/src/platform/contracts.ts \
  the-bend-frontend/src/platform/native/NativeHapticsService.ts \
  the-bend-frontend/src/platform/native/NativeHapticsService.test.ts \
  the-bend-frontend/src/platform/native/NativePlatformServices.ts \
  the-bend-frontend/src/platform/web/WebHapticsService.ts \
  the-bend-frontend/src/platform/web/WebPlatformServices.ts \
  the-bend-frontend/src/platform/createPlatformServices.test.ts \
  the-bend-frontend/src/components/layout/NativeAppShell.tsx \
  the-bend-frontend/src/components/layout/NativeBottomNav.tsx \
  the-bend-frontend/src/components/layout/NativeBottomNav.test.tsx \
  the-bend-frontend/src/components/layout/PostActionSheet.tsx \
  the-bend-frontend/src/components/layout/PostActionSheet.test.tsx \
  the-bend-frontend/src/auth/pendingDestination.ts \
  the-bend-frontend/src/auth/pendingDestination.test.ts \
  the-bend-frontend/src/routes/NativeRoutes.test.tsx
git diff --cached --check
git commit -m "feat(native-ui): refine shell and create navigation"
~~~

---

### Task 3: Add typed discovery contracts, adapters, URL state, and explicit cached-request states

**Files:**
- Create: `src/native/discovery/types.ts`
- Create: `src/native/discovery/adapters.ts`
- Create: `src/native/discovery/adapters.test.ts`
- Create: `src/native/discovery/queries.ts`
- Create: `src/native/discovery/queries.test.ts`
- Modify: `src/types/index.ts`
- Modify: `src/services/shopApi.ts`
- Modify: `src/services/eventApi.ts`
- Modify: `src/services/listingApi.ts`
- Modify: `src/services/sponsorApi.ts`
- Modify: `src/hooks/useCachedPublicContent.ts`
- Modify: `src/hooks/useCachedPublicContent.test.tsx`

**Interfaces:**

~~~ts
export type NativeDiscoveryKind =
  | 'listing'
  | 'business'
  | 'event'
  | 'volunteer'

export type NativeExploreType =
  | 'all'
  | 'listings'
  | 'businesses'
  | 'events'
  | 'volunteer'

export type NativeSectionStatus = 'loading' | 'success' | 'empty' | 'error'

export interface NativeSectionState<T> {
  status: NativeSectionStatus
  data: T
  source: 'network' | 'cache' | null
  cachedAt: string | null
  error: Error | null
  retry(): Promise<void>
}

export interface NativeExploreQuery {
  q: string
  type: NativeExploreType
  category: string | null
  urgency: 'normal' | 'urgent' | null
  sort: string | null
  mode: 'list' | 'map'
  near: boolean
}

export interface ItemsResponse<T> {
  items: T[]
}

export interface CachedPublicContentOptions<T> {
  isEmpty?(value: T): boolean
  enabled?: boolean
  cachePolicy?: 'public' | 'none'
}
~~~

- [ ] **Step 1: Write failing adapter, query, and cache-state tests**

Adapter coverage:

- listing title, owner, thumbnail, urgency, and `/listing/:id` path;
- opportunity listing normalized with `kind: 'volunteer'`;
- business address/avatar, public coordinates, and `/business/:id` path;
- event date/location/image and `/events/:id` path;
- invalid, absent, NaN, or out-of-range business coordinates become `null`;
- listing, event, and volunteer coordinates are always `null`.

Query coverage:

- canonical URL parameters are `q`, `type`, `category`, `urgency`, `sort`, `mode`, and `near`;
- unknown values fall back safely;
- empty/default values are omitted;
- frontend `q` translates to backend `search`;
- All mode requests use a bounded limit of 5;
- See all keeps the query and changes only the intended type/filter.

Cache-hook coverage:

~~~ts
expect(result.current).toMatchObject({
  status: 'loading',
  data: null,
  error: null,
})

await waitFor(() => expect(result.current.status).toBe('error'))
expect(result.current.error?.message).toBe('network failed')
~~~

Also prove a cache fallback returns `status: 'success'` and `source: 'cache'`, cache-write failure cannot mask network success, key changes reset state, unmounted requests remain inert, and retry clears a prior error.

- [ ] **Step 2: Run the focused suites and confirm red**

~~~bash
cd the-bend-frontend
npm run test:run -- src/native/discovery/adapters.test.ts \
  src/native/discovery/queries.test.ts \
  src/hooks/useCachedPublicContent.test.tsx
~~~

Expected: FAIL because the native discovery modules and explicit request states do not exist.

- [ ] **Step 3: Type only the public API surfaces consumed by Phase 1**

Use existing `Listing`, `Shop`, `CommunityEvent`, `Sponsor`, `SuccessStory`, and `PaginatedResponse` types. Add a new response type only if the server shape cannot be expressed by `PaginatedResponse<T>`.

Required client contracts:

~~~ts
export interface PublicRequestOptions { signal?: AbortSignal }

export interface ListingPublicClient {
  browse(
    params: Record<string, string | number | boolean | undefined>,
    options?: PublicRequestOptions,
  ): Promise<AxiosResponse<PaginatedResponse<Listing>>>
  getOpportunities(
    params: Record<string, string | number | boolean | undefined>,
    options?: PublicRequestOptions,
  ): Promise<AxiosResponse<PaginatedResponse<Listing>>>
  getStories(params?: Record<string, string>):
    Promise<AxiosResponse<ItemsResponse<SuccessStory>>>
}

export interface ShopPublicClient {
  directory(
    params?: Record<string, string | number | boolean | undefined>,
    options?: PublicRequestOptions,
  ): Promise<AxiosResponse<PaginatedResponse<Shop>>>
}

export interface EventPublicClient {
  list(
    params?: Record<string, string | number | boolean | undefined>,
    options?: PublicRequestOptions,
  ): Promise<AxiosResponse<PaginatedResponse<CommunityEvent>>>
  getUpcoming(limit?: number):
    Promise<AxiosResponse<ItemsResponse<CommunityEvent>>>
}

export interface SponsorPublicClient {
  list(placement?: string): Promise<AxiosResponse<ItemsResponse<Sponsor>>>
}
~~~

Pass `PublicRequestOptions.signal` to Axios. Existing callers remain source-compatible because the options argument is optional.

- [ ] **Step 4: Implement pure view-model adapters**

Adapters accept domain objects and return `NativeDiscoveryCardModel`. Formatting functions receive `locale` and `now` where time-sensitive output is required so tests are deterministic. Do not read auth, tenant, location, cache, or router state inside adapters.

Validate business coordinates:

~~~ts
function publicCoordinates(shop: Shop) {
  const latitude = shop.latitude
  const longitude = shop.longitude
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) return null
  return { latitude, longitude }
}
~~~

- [ ] **Step 5: Implement canonical Explore query parsing and serialization**

`parseNativeExploreQuery(URLSearchParams)` returns a complete safe object. `serializeNativeExploreQuery(query)` emits stable parameter order. `toListingParams`, `toBusinessParams`, `toEventParams`, and `toOpportunityParams` translate `q` to `search` and include only endpoint-supported filters.

Do not pass `mode`, `near`, unsupported category values, or device coordinates to endpoints that do not accept them.

- [ ] **Step 6: Make cached public state explicit without breaking consumers**

Retain `data`, `source`, `cachedAt`, and `refresh`. Add `status` and `error`. Rules:

1. First request starts at `loading`.
2. Network success sets `success` or `empty` based on the supplied value.
3. Network failure followed by valid cache sets `success` or `empty` with `source: 'cache'`.
4. No network result and no cache sets `error` with the original fetch error or `new Error('OFFLINE_NO_CACHE')` when no network request was attempted.
5. Cache read/write failure never replaces a valid network result.
6. A key change clears stale visible data and starts the new key at `loading`.
7. A prior key or unmounted request never writes visible state.

Accept an optional emptiness predicate:

~~~ts
export function useCachedPublicContent<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CachedPublicContentOptions<T> = {},
)
~~~

Default `isEmpty` recognizes `null`, empty arrays, and objects with an empty `items` array.

When `enabled` is false, do not fetch or read cache and return an idle loading state with `data: null`; activating it starts one request. When `cachePolicy` is `none`, skip every cache read/write while retaining loading, error, reconnect, key-generation, retry, and unmount protection.

- [ ] **Step 7: Run focused and existing cache/privacy tests**

~~~bash
cd the-bend-frontend
npm run test:run -- src/native/discovery/adapters.test.ts \
  src/native/discovery/queries.test.ts \
  src/hooks/useCachedPublicContent.test.tsx \
  src/platform/native/NativeContentCache.test.ts
npm run lint
~~~

Expected: all tests PASS; cache projection tests confirm device coordinates and unsupported private fields are not persisted.

- [ ] **Step 8: Commit only Task 3 files**

~~~bash
git add the-bend-frontend/src/native/discovery \
  the-bend-frontend/src/types/index.ts \
  the-bend-frontend/src/services/shopApi.ts \
  the-bend-frontend/src/services/eventApi.ts \
  the-bend-frontend/src/services/listingApi.ts \
  the-bend-frontend/src/services/sponsorApi.ts \
  the-bend-frontend/src/hooks/useCachedPublicContent.ts \
  the-bend-frontend/src/hooks/useCachedPublicContent.test.tsx
git diff --cached --check
git commit -m "feat(native-ui): add typed discovery data models"
~~~

---

### Task 4: Build the dedicated native Home dashboard

**Files:**
- Create: `src/hooks/useNativeHome.ts`
- Create: `src/hooks/useNativeHome.test.tsx`
- Create: `src/pages/native/NativeHomePage.tsx`
- Create: `src/pages/native/NativeHomePage.test.tsx`
- Modify: `src/components/layout/NativeAppShell.tsx`

**Interfaces:**

~~~ts
export interface NativeHomeViewModel {
  urgent: NativeSectionState<NativeDiscoveryCardModel[]>
  upcoming: NativeSectionState<NativeDiscoveryCardModel[]>
  opportunities: NativeSectionState<NativeDiscoveryCardModel[]>
  highlights: NativeSectionState<SuccessStory[]>
  partners: NativeSectionState<Sponsor[]>
}

export interface NativeHomePageProps {
  now?: Date
}
~~~

**Data ownership:**

| Section | Existing client call | Limit | Cache policy/key |
|---|---|---:|---|
| Urgent needs | `listingApi.browse({ urgency: 'urgent', limit: 3 })` | 3 | public, `listing:native-home-urgent` |
| Happening soon | `eventApi.getUpcoming(3)` | 3 | public, `event:native-home-upcoming` |
| Opportunities | `listingApi.getOpportunities({ limit: 5 })` | 5 | public, `listing:native-home-opportunities` |
| Community highlights | `listingApi.getStories({ featured: 'true', limit: '3' })` | 3 | network-only |
| Partners | `sponsorApi.list('homepage')` | all active homepage items | network-only |

- [ ] **Step 1: Write failing Home hook tests**

Use deferred promises to prove:

- the five requests start independently;
- an urgent failure does not remove successful events;
- cached urgent/events/opportunities render with freshness metadata;
- each Retry invokes only its failed section;
- resolving a request after unmount is inert;
- stable cache keys never contain a search term, user ID, token, or coordinate.

~~~tsx
it('keeps successful sections visible when urgent needs fail', async () => {
  listingBrowse.reject(new Error('urgent unavailable'))
  upcoming.resolve(eventsResponse)
  renderHook(() => useNativeHome())
  await waitFor(() => expect(result.current.urgent.status).toBe('error'))
  expect(result.current.upcoming.status).toBe('success')
})
~~~

- [ ] **Step 2: Write failing Home page behavior tests**

Verify the exact content order:

1. compact Bend/Westmoreland header;
2. Around Westmoreland title and search;
3. Offer, Find, Volunteer, Events;
4. urgent needs;
5. happening soon;
6. opportunities;
7. community highlights;
8. partners.

Also cover search transfer to `/explore?q=generator`, See all destinations, guest account entry, signed-in notification/account entry, section-local skeleton/empty/error states, cached banner, root-scroll registration, one `h1`, lazy images, a subtle 44-point “Partner with us” button linking to the existing `/advertise` route, and no decorative hero.

~~~tsx
it('hands search to the canonical Explore URL', () => {
  renderNativeHome()
  fireEvent.change(screen.getByRole('searchbox', { name: /search westmoreland/i }), {
    target: { value: 'food pantry' },
  })
  fireEvent.submit(screen.getByRole('search'))
  expect(navigate).toHaveBeenCalledWith('/explore?q=food%20pantry')
})
~~~

- [ ] **Step 3: Run Home suites and confirm red**

~~~bash
cd the-bend-frontend
npm run test:run -- src/hooks/useNativeHome.test.tsx \
  src/pages/native/NativeHomePage.test.tsx
~~~

Expected: FAIL because the Home hook and native page do not exist.

- [ ] **Step 4: Implement independent section orchestration**

Use `useCachedPublicContent` separately for the three cacheable projections. Use the same hook with `cachePolicy: 'none'` for highlights and partners so lifecycle/error behavior remains consistent without writing unsupported cache kinds.

Map API responses only after the response shape is validated as an array or `items` array. Malformed responses become a section-local error; do not silently render a successful empty section.

- [ ] **Step 5: Implement the approved Home composition**

The root is a labeled scroll region registered as `home`. Keep the first viewport compact: the header, title, search, quick actions, and the start of urgent content must appear before any tall media.

Quick actions:

~~~ts
const quickActions = [
  { label: 'Offer', path: '/create?type=offer', protected: true },
  { label: 'Find', path: '/explore?type=listings', protected: false },
  { label: 'Volunteer', path: '/explore?type=volunteer', protected: false },
  { label: 'Events', path: '/explore?type=events', protected: false },
] as const
~~~

For Offer, reuse the typed Create pending-intent helper from Task 2. Public actions navigate directly. See all URLs are:

- urgent: `/explore?type=listings&urgency=urgent`
- events: `/explore?type=events`
- opportunities: `/explore?type=volunteer`

Do not display personalized ranking. Show saved/account indicators only when an existing API response already includes the value.

- [ ] **Step 6: Verify Home behavior and web isolation**

~~~bash
cd the-bend-frontend
npm run test:run -- src/hooks/useNativeHome.test.tsx \
  src/pages/native/NativeHomePage.test.tsx \
  src/components/native/ui/NativeComponents.test.tsx
npm run lint
npm run build
~~~

Expected: tests PASS; lint PASS; web build PASS; `src/pages/HomePage.tsx` and `src/index.css` remain absent from the diff.

- [ ] **Step 7: Commit only Task 4 files**

~~~bash
git add the-bend-frontend/src/hooks/useNativeHome.ts \
  the-bend-frontend/src/hooks/useNativeHome.test.tsx \
  the-bend-frontend/src/pages/native/NativeHomePage.tsx \
  the-bend-frontend/src/pages/native/NativeHomePage.test.tsx \
  the-bend-frontend/src/components/layout/NativeAppShell.tsx \
  the-bend-frontend/src/hooks/useCachedPublicContent.ts \
  the-bend-frontend/src/hooks/useCachedPublicContent.test.tsx
git diff --cached --check
git commit -m "feat(native-ui): add Westmoreland home dashboard"
~~~

---

### Task 5: Build unified Explore with grouped All results, filters, and authoritative typed views

**Files:**
- Create: `src/hooks/useNativeExplore.ts`
- Create: `src/hooks/useNativeExplore.test.tsx`
- Create: `src/pages/native/NativeExplorePage.tsx`
- Create: `src/pages/native/NativeExplorePage.test.tsx`
- Modify: `src/routes/NativeRoutes.tsx`
- Modify: `src/routes/NativeRoutes.test.tsx`
- Modify: `src/routes/WebRoutes.test.tsx`

**Interfaces:**

~~~ts
export interface NativeExploreGroup {
  kind: NativeDiscoveryKind
  heading: string
  state: NativeSectionState<NativeDiscoveryCardModel[]>
}

export interface NativeTypedResults {
  state: NativeSectionState<NativeDiscoveryCardModel[]>
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: Error | null
  loadMore(): Promise<void>
}

export interface NativeExploreViewModel {
  groups: NativeExploreGroup[]
  typed: NativeTypedResults | null
  refreshAll(): Promise<void>
}
~~~

**Request matrix:**

| Type | Client | Supported request fields |
|---|---|---|
| Listings | `listingApi.browse` | `search`, `category`, `urgency`, `sort`, `cursor`, `limit` |
| Businesses | `shopApi.directory` | `search`, `business_type`, `cursor`, `limit` |
| Events | `eventApi.list` | `search`, `category`, `cursor`, `limit` |
| Volunteer | `listingApi.getOpportunities` | `search`, `urgency`, `sort`, `cursor`, `limit` |

- [ ] **Step 1: Write failing grouped-result tests**

Prove All mode:

- starts all four requests in parallel;
- returns at most five cards per group;
- preserves successful groups when one fails;
- retries only the failed group;
- shows a group-local empty state;
- translates canonical `q` to backend `search`;
- uses the default cache keys below only when `q` and secondary filters are empty.

Default Explore cache keys:

- `listing:native-explore-default`
- `business:native-explore-default`
- `event:native-explore-default`
- `listing:native-explore-volunteer-default`

Search and filtered results use `cachePolicy: 'none'`. Their keys may exist in hook memory for stale-request coordination but must never reach `ContentCache.put`.

- [ ] **Step 2: Write failing typed-view and stale-response tests**

Cover initial page, cursor append without duplicates, load-more failure preserving current items, no load-more button without a non-empty `next_cursor`, query/type change resetting the cursor, old request completion ignored, aborted Axios requests not displayed as errors, and independent full-refresh error behavior.

~~~tsx
it('ignores a late response from the previous query', async () => {
  const oldRequest = deferredResponse()
  const newRequest = deferredResponse()
  renderHook(({ query }) => useNativeExplore(query), {
    initialProps: { query: listingQuery('tractor') },
  })
  rerender({ query: listingQuery('generator') })
  newRequest.resolve(responseFor('generator'))
  oldRequest.resolve(responseFor('tractor'))
  await waitFor(() => expect(result.current.typed?.state.data[0]?.title).toBe('Generator'))
})
~~~

- [ ] **Step 3: Write failing Explore page tests**

Cover:

- search stays visible;
- chips are All, Listings, Businesses, Events, Volunteer;
- URL is the source of truth for type/query/filter/sort/mode/near;
- text input updates immediately while URL/network search is debounced by 300 ms;
- Enter submits immediately;
- secondary filters open in a focus-managed bottom sheet;
- active filters render as removable chips;
- See all preserves `q` and chooses the intended type;
- All view renders grouped headings;
- typed view renders one authoritative result list;
- partial failure never becomes a full-screen failure;
- browser Back restores the prior Explore state.

- [ ] **Step 4: Run the Explore suites and confirm red**

~~~bash
cd the-bend-frontend
npm run test:run -- src/hooks/useNativeExplore.test.tsx \
  src/pages/native/NativeExplorePage.test.tsx \
  src/routes/NativeRoutes.test.tsx \
  src/routes/WebRoutes.test.tsx
~~~

Expected: FAIL because native Explore and route mappings do not exist.

- [ ] **Step 5: Implement grouped All requests**

Instantiate one independent cached-public hook per group; use `enabled` to activate All mode or the corresponding typed mode. Stable callbacks prevent request loops. Each group maps its own `AxiosResponse.data.items` through the pure adapter.

Use `Promise.all` only for an explicit `refreshAll` callback. Do not collapse group state into one promise for initial rendering.

- [ ] **Step 6: Implement typed pagination with a request generation**

For the selected type:

1. increment a generation ref whenever query/type/filters/sort changes;
2. abort the prior Axios request;
3. replace items for a first-page request;
4. append and de-duplicate by `kind + ':' + id` for a cursor request;
5. apply a response only if generation and request key still match;
6. expose Load more only when the server supplies both `has_more: true` and a non-empty `next_cursor`.

The current business directory may return `has_more` without `next_cursor`. Do not synthesize a cursor, repeat the first page, or claim all results loaded. In that response state, hide Load more and show a non-blocking “Refine your search to narrow businesses” message. A backend cursor enhancement is outside this presentation plan.

- [ ] **Step 7: Implement URL-owned Explore composition**

Use `useSearchParams` with `parseNativeExploreQuery` and `serializeNativeExploreQuery`. Replace the current URL for debounced typing; push a new history entry for explicit type, filter, mode, and See all changes.

Secondary filter choices are limited to endpoint-supported values:

- Listings: category `staff`, `materials`, `equipment`; urgency `normal`/`urgent`; sort `urgency_desc`/`created_desc`/`expiry_asc`.
- Businesses: a text `business_type` value selected from currently returned business types; no urgency/sort.
- Events: `community`, `music`, `art`, `food`, `market`, `historic`, `outdoor`, `education`.
- Volunteer: urgency `normal`/`urgent`; sort `urgency_desc`/`created_desc`/`expiry_asc`.

Do not offer Talent as a type chip. Volunteer results come only from `getOpportunities`.

- [ ] **Step 8: Switch only native routes**

~~~tsx
<Route path="/" element={<NativeHomePage />} />
<Route path="/explore" element={<NativeExplorePage />} />
~~~

`PublicMemberRoutes` must still resolve `/` to `HomePage` and must not gain a `/explore` route; web `/explore` continues to resolve to `NotFoundPage`. Keep the existing `ExplorePage.tsx` file unchanged even though it is no longer used by `NativeRoutes`. Add explicit route assertions so future imports cannot collapse the native/web boundary.

- [ ] **Step 9: Run Explore, route, and web regression checks**

~~~bash
cd the-bend-frontend
npm run test:run -- src/hooks/useNativeExplore.test.tsx \
  src/pages/native/NativeExplorePage.test.tsx \
  src/native/discovery/queries.test.ts \
  src/routes/NativeRoutes.test.tsx \
  src/routes/WebRoutes.test.tsx \
  src/pages/ExplorePage.test.tsx
npm run lint
npm run build
npm run build:native
~~~

Expected: all tests PASS; web and native production builds PASS; existing web Home/Explore source files remain unchanged.

- [ ] **Step 10: Commit only Task 5 files**

~~~bash
git add the-bend-frontend/src/hooks/useNativeExplore.ts \
  the-bend-frontend/src/hooks/useNativeExplore.test.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx \
  the-bend-frontend/src/routes/NativeRoutes.tsx \
  the-bend-frontend/src/routes/NativeRoutes.test.tsx \
  the-bend-frontend/src/routes/WebRoutes.test.tsx
git diff --cached --check
git commit -m "feat(native-ui): add unified Westmoreland explore"
~~~

---

### Task 6: Add contextual Near me behavior and a deferred business-only map

**Files:**
- Create: `src/components/native/NativeExploreMap.tsx`
- Create: `src/components/native/NativeExploreMap.test.tsx`
- Modify: `src/hooks/useNativeExplore.ts`
- Modify: `src/hooks/useNativeExplore.test.tsx`
- Modify: `src/pages/native/NativeExplorePage.tsx`
- Modify: `src/pages/native/NativeExplorePage.test.tsx`
- Modify: `src/services/shopApi.ts`
- Modify: `src/native/discovery/types.ts`
- Modify: `src/native/discovery/adapters.ts`
- Modify: `src/styles/native.css`

**Interfaces:**

~~~ts
export interface NativeMapBusiness extends NativeDiscoveryCardModel {
  kind: 'business'
  coordinates: { latitude: number; longitude: number }
  distanceMiles: number | null
}

export type NativeLocationState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'granted'; latitude: number; longitude: number }
  | { status: 'denied'; message: string }
  | { status: 'unavailable'; message: string }

export interface NativeExploreMapProps {
  businesses: NativeMapBusiness[]
  userCoordinates: { latitude: number; longitude: number } | null
  selectedId: string | null
  onSelect(id: string): void
  onOpen(path: string): void
}
~~~

- [ ] **Step 1: Write failing permission-timing tests**

Prove `location.getForegroundPosition` is not called on shell mount, Home mount, Explore mount, search, type selection, list scrolling, business result loading, or ordinary map rendering.

It is called only after:

- the user selects Near me in Businesses mode; or
- the user taps Use my location inside map mode.

Cover granted, denied, restricted, unavailable, timeout/service error, retry, and cancellation. Every failure keeps Westmoreland-wide results usable.

- [ ] **Step 2: Write failing map eligibility and privacy tests**

Cover:

- only business cards can enter the map;
- directory results with no public coordinates are hydrated through bounded public `shopApi.getShop` calls only after a business-bearing result set is visible;
- invalid coordinates are discarded;
- no device coordinate is written to the URL, cache, analytics, local storage, or pending intent;
- map mode is disabled offline;
- an empty coordinate set stays in list mode with a clear explanation;
- marker selection opens a compact preview before detail navigation;
- the Leaflet module is absent until map mode is selected.

- [ ] **Step 3: Run location/map suites and confirm red**

~~~bash
cd the-bend-frontend
npm run test:run -- src/components/native/NativeExploreMap.test.tsx \
  src/hooks/useNativeExplore.test.tsx \
  src/pages/native/NativeExplorePage.test.tsx
~~~

Expected: FAIL because contextual location and the map component are absent.

- [ ] **Step 4: Type public business detail and hydrate coordinates only for map eligibility**

Type `shopApi.getShop(id)` as `Shop`. The directory currently omits latitude/longitude, so the hook may fetch details only for the visible business result set while online:

- All mode: at most five businesses.
- Businesses mode: at most the current visible page, capped at 20 concurrent candidates.
- Use a concurrency limit of four detail requests.
- Ignore failed details and stale query generations.
- Keep hydrated coordinates in component memory only.
- Never write hydrated coordinates to `NativeContentCache`; its existing business projector intentionally strips them.
- Expose the Map switch only after at least one hydrated business has valid coordinates. Keep Leaflet unimported and unmounted while eligibility is being checked.

- [ ] **Step 5: Implement Near me as an explicit business-only enhancement**

Offer Near me only in Businesses mode. On grant:

1. keep device coordinates in hook memory;
2. hydrate current business coordinates if needed;
3. calculate Haversine distance locally;
4. sort the current visible business page by distance;
5. label the results “Near you within Westmoreland”;
6. leave pagination server-authoritative and re-sort each appended visible set.

Do not imply county-complete distance ranking. If no current business has coordinates, retain server order and explain that distance is unavailable.

On denial or unavailability, clear `near` from the canonical URL and show `PermissionPrimer` with “Continue across Westmoreland” plus a Retry action. Do not request permission again until another explicit user action.

- [ ] **Step 6: Implement a lazy Leaflet map**

Load with:

~~~tsx
const NativeExploreMap = lazy(() => import('@/components/native/NativeExploreMap'))
~~~

Render `MapContainer` only in map mode and only while online with at least one valid `NativeMapBusiness`. Use the existing Leaflet dependency and local marker assets. Marker popups contain the business name, business type/address, optional distance, and Open details. Tile attribution remains visible.

Map mode behavior:

- All mode maps only the business group and labels that scope.
- Businesses mode maps the current visible business page.
- Listings, Events, and Volunteer do not render a map switch.
- Selecting List unmounts Leaflet.
- Use my location is optional and is the only map action that requests device location.

- [ ] **Step 7: Verify location, offline, and lazy-loading behavior**

~~~bash
cd the-bend-frontend
npm run test:run -- src/components/native/NativeExploreMap.test.tsx \
  src/hooks/useNativeExplore.test.tsx \
  src/pages/native/NativeExplorePage.test.tsx \
  src/platform/native/nativeDeviceServices.test.ts \
  src/platform/native/NativeContentCache.test.ts
npm run lint
npm run build:native
~~~

Expected: all tests PASS; native build PASS; the map remains a separate lazy chunk; cache tests prove exact coordinates are absent from persisted public projections.

- [ ] **Step 8: Commit only Task 6 files**

~~~bash
git add the-bend-frontend/src/components/native/NativeExploreMap.tsx \
  the-bend-frontend/src/components/native/NativeExploreMap.test.tsx \
  the-bend-frontend/src/hooks/useNativeExplore.ts \
  the-bend-frontend/src/hooks/useNativeExplore.test.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx \
  the-bend-frontend/src/services/shopApi.ts \
  the-bend-frontend/src/native/discovery/types.ts \
  the-bend-frontend/src/native/discovery/adapters.ts \
  the-bend-frontend/src/styles/native.css
git diff --cached --check
git commit -m "feat(native-ui): add contextual map discovery"
~~~

---

### Task 7: Harden accessibility, dark mode, lifecycle, performance, and route regression coverage

**Files:**
- Modify: `src/styles/native.css`
- Modify: `src/components/native/ui/NativeComponents.test.tsx`
- Modify: `src/components/layout/NativeAppShell.test.tsx`
- Modify: `src/components/layout/NativeBottomNav.test.tsx`
- Modify: `src/pages/native/NativeHomePage.test.tsx`
- Modify: `src/pages/native/NativeExplorePage.test.tsx`
- Modify: `src/hooks/useNativeHome.test.tsx`
- Modify: `src/hooks/useNativeExplore.test.tsx`
- Modify: `src/routes/NativeRoutes.test.tsx`
- Modify: `src/routes/WebRoutes.test.tsx`

**Acceptance matrix:**

| Concern | Required automated proof |
|---|---|
| Semantics | one page `h1`, ordered `h2` sections, `main`/`nav`/`search` landmarks |
| Navigation | current tab announced; active Home/Explore reselect scrolls; protected tabs preserve destination |
| Focus | logical order; sheets trap and restore; inline Retry receives no surprise focus |
| Touch | interactive controls expose at least 44 by 44 CSS pixels |
| Dark mode | semantic tokens resolve without global web overrides |
| Reduced motion | scroll and animation behavior changes under media query |
| Text scaling | no fixed control heights that clip two-line labels; cards can grow vertically |
| Images | explicit dimensions/aspect ratio and below-fold lazy loading |
| Requests | bounded counts, 300 ms debounce, abort/generation guard, independent errors |
| Offline | cached freshness shown; map/Near me disabled; mutations unchanged |
| Route split | native pages and web pages resolve through separate imports |
| Privacy | no auth/private/device-location payload enters public cache |

- [ ] **Step 1: Add failing cross-state regression cases**

Use parameterized tests for loading, populated, empty, error, cached offline, and dark-class roots. Add:

- rapid query changes followed by unmount;
- reconnect after a cached render;
- active tab reselect under reduced motion;
- long labels and 200-percent-equivalent test strings;
- keyboard-open class/inset behavior;
- guest/member header differences;
- map lazy import spy;
- partial All-mode failure plus successful navigation;
- route-level deep link to `/listing/:id` still rendering the existing detail page;
- protected Inbox/You continuation unchanged.

- [ ] **Step 2: Run the new cases and confirm at least one red assertion**

~~~bash
cd the-bend-frontend
npm run test:run -- src/components/native/ui/NativeComponents.test.tsx \
  src/components/layout/NativeAppShell.test.tsx \
  src/components/layout/NativeBottomNav.test.tsx \
  src/pages/native/NativeHomePage.test.tsx \
  src/pages/native/NativeExplorePage.test.tsx \
  src/hooks/useNativeHome.test.tsx \
  src/hooks/useNativeExplore.test.tsx \
  src/routes/NativeRoutes.test.tsx \
  src/routes/WebRoutes.test.tsx
~~~

Expected: at least one new accessibility/lifecycle regression test FAILS before the hardening change.

- [ ] **Step 3: Apply the minimum hardening changes**

Use only native-scoped CSS and native components. Required rules include:

- `min-block-size: 44px` and `min-inline-size: 44px` for controls;
- visible `:focus-visible` outline using the semantic focus token;
- `overflow-wrap: anywhere` for untrusted titles;
- no fixed card height;
- reserved media `aspect-ratio`;
- bottom sheets padded by `max(16px, env(safe-area-inset-bottom))`;
- main content padded above the bottom nav;
- `aria-live="polite"` for async status summaries and `role="alert"` only for actionable errors;
- skeletons hidden from accessibility APIs while a concise loading status remains available;
- dark tokens under `.dark .native-app` only.

Do not introduce global `!important` rules except the scoped reduced-motion duration override.

- [ ] **Step 4: Run the complete frontend verification**

~~~bash
cd the-bend-frontend
npm run test:run
npm run lint
npm run build
npm run build:native
git diff --check
~~~

Expected:

- all frontend tests PASS;
- ESLint PASS;
- web and native production builds PASS;
- only existing analytics-token, dynamic-import, and chunk-size warnings may remain;
- no generated credentials or secrets appear in `git diff`.

- [ ] **Step 5: Verify the protected backend lock and full backend regression suite**

~~~bash
shasum -a 256 the-bend-backend/uv.lock
cd the-bend-backend
uv run pytest -q
~~~

Expected: lock hash remains `c59e3d361f8f175c3d661018029aeb9df00761b74d70f79d6d1e3971fcc59082` and the full backend suite PASS. No backend source change is expected in this plan.

- [ ] **Step 6: Commit only Task 7 hardening**

~~~bash
git add the-bend-frontend/src/styles/native.css \
  the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx \
  the-bend-frontend/src/components/layout/NativeAppShell.test.tsx \
  the-bend-frontend/src/components/layout/NativeBottomNav.test.tsx \
  the-bend-frontend/src/pages/native/NativeHomePage.test.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx \
  the-bend-frontend/src/hooks/useNativeHome.test.tsx \
  the-bend-frontend/src/hooks/useNativeExplore.test.tsx \
  the-bend-frontend/src/routes/NativeRoutes.test.tsx \
  the-bend-frontend/src/routes/WebRoutes.test.tsx
git diff --cached --check
git commit -m "test(native-ui): harden accessible cross-state behavior"
~~~

---

### Task 8: Sync native projects, install both simulator builds, and capture acceptance evidence

**Files:**
- Create locally but do not track: `.superpowers/sdd/2026-08-18-westmoreland-native-ui/evidence/`
- Create locally but do not track: `.superpowers/sdd/2026-08-18-westmoreland-native-ui/acceptance-report.md`
- Do not intentionally modify application source.

- [ ] **Step 1: Record the clean implementation commit and pre-sync status**

~~~bash
git status --short
git rev-parse HEAD
shasum -a 256 the-bend-backend/uv.lock
cd the-bend-frontend
npm run test:run
npm run lint
npm run build
npm run build:native
~~~

Expected: every verification passes. Record, but do not stage, the pre-existing SwiftPM worktree entries listed under Global Constraints.

- [ ] **Step 2: Sync Capacitor without swallowing generated differences**

~~~bash
cd the-bend-frontend
npm run cap:sync
git status --short
~~~

Inspect every generated difference. Do not include pre-existing `Package.swift` or SwiftPM workspace data in a UI commit. If `cap:sync` generates a new tracked application change directly caused by this plan, stop and commit that file separately with a precise message before continuing.

- [ ] **Step 3: Build and install Android**

~~~bash
cd the-bend-frontend/android
./gradlew assembleDebug
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell am force-stop community.bend.westmoreland
adb -s emulator-5554 shell monkey -p community.bend.westmoreland 1
~~~

Expected: Gradle succeeds, the APK installs, and the Westmoreland app launches on `emulator-5554`.

- [ ] **Step 4: Build and install iOS using the full Xcode simulator runtime**

~~~bash
cd the-bend-frontend
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,id=C824154C-356B-4B2C-BDF1-2DC8F71BDB23' \
  -configuration Debug \
  -derivedDataPath /tmp/bend-native-ui-derived \
  CODE_SIGNING_ALLOWED=NO \
  build
xcrun simctl install C824154C-356B-4B2C-BDF1-2DC8F71BDB23 \
  /tmp/bend-native-ui-derived/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch C824154C-356B-4B2C-BDF1-2DC8F71BDB23 community.bend.westmoreland
~~~

Expected: `xcodebuild` succeeds and the app launches on `Bend Westmoreland iPhone`.

- [ ] **Step 4a: Prepare compact and large phone evidence targets**

Use the existing iPhone 17 Pro Max simulator `7E175744-EE1A-495D-8C4D-518E663DF100` as the large iOS phone. If `xcrun simctl list devices` does not show `Bend Westmoreland Compact`, create an iPhone SE (3rd generation) target:

~~~bash
xcrun simctl create \
  'Bend Westmoreland Compact' \
  com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation \
  com.apple.CoreSimulator.SimRuntime.iOS-26-5
~~~

Record the returned compact UDID, boot each secondary simulator sequentially, install the same `App.app`, and launch `community.bend.westmoreland`.

For Android, record the original output of `adb -s emulator-5554 shell wm size` and `wm density`. Capture the compact phone at 360 by 640 dp and the large phone at 480 by 1040 dp:

~~~bash
adb -s emulator-5554 shell wm size 720x1280
adb -s emulator-5554 shell wm density 320
adb -s emulator-5554 shell wm size 1440x3120
adb -s emulator-5554 shell wm density 480
adb -s emulator-5554 shell wm size reset
adb -s emulator-5554 shell wm density reset
~~~

Always restore Android size and density after capture. Do not run phone-specific layout evidence on an iPad/tablet target.

- [ ] **Step 5: Prove live Westmoreland API connectivity on both simulators**

On each simulator, verify:

- Home loads real urgent/event/opportunity content or a valid exact empty state from the live tenant;
- Explore searches a known Westmoreland term and returns the same entity identity as the public API;
- no desktop header, promotional hero, or web footer appears;
- bottom navigation remains visible without obscuring content;
- guest browsing does not redirect to login;
- Offer, Inbox, or You does redirect and safely resumes after sign-in.
- opening a listing/business/event from Explore and using the visible or system Back action restores the prior query/filter URL; launching the same supported detail as a deep link still renders safely.

Capture the corresponding API response metadata without recording tokens, email, phone, or credentials.

- [ ] **Step 6: Capture the visual/state matrix**

Required evidence on iOS and Android:

| Mode | Home | Explore |
|---|---|---|
| Light, signed out, online | first viewport and urgent section | All groups and one typed view |
| Dark, signed out, online | first viewport | filters plus results |
| Signed in, online | member header/account entry | protected action continuation |
| Location denied | not requested | Near me denial with county-wide fallback |
| Partial API failure | successful sections retained | failed group Retry plus successful groups |
| Cached offline | freshness banner and cached cards | cached default groups; map/Near me disabled |
| Large text | no clipped controls/cards | chips, sheet, cards, nav usable |

Run the complete state matrix on the primary booted iOS and Android targets. On the compact and large targets, additionally capture Home's first viewport, the Explore chip row/filter sheet, a two-line result card, and bottom navigation so size-specific clipping is independently visible.

Use native settings rather than CSS test classes for visual evidence:

~~~bash
xcrun simctl ui C824154C-356B-4B2C-BDF1-2DC8F71BDB23 appearance dark
xcrun simctl ui C824154C-356B-4B2C-BDF1-2DC8F71BDB23 appearance light
xcrun simctl ui C824154C-356B-4B2C-BDF1-2DC8F71BDB23 content_size accessibility-extra-large
xcrun simctl ui C824154C-356B-4B2C-BDF1-2DC8F71BDB23 content_size large
adb -s emulator-5554 shell cmd uimode night yes
adb -s emulator-5554 shell cmd uimode night no
adb -s emulator-5554 shell settings put system font_scale 2.0
adb -s emulator-5554 shell settings put system font_scale 1.0
~~~

For location denial, reset/revoke the current permission, invoke Near me, and choose Don't Allow when prompted:

~~~bash
xcrun simctl privacy C824154C-356B-4B2C-BDF1-2DC8F71BDB23 reset location community.bend.westmoreland
adb -s emulator-5554 shell pm revoke community.bend.westmoreland android.permission.ACCESS_FINE_LOCATION
adb -s emulator-5554 shell pm revoke community.bend.westmoreland android.permission.ACCESS_COARSE_LOCATION
~~~

Restore light appearance, standard content size, `font_scale 1.0`, and the original Android display dimensions after evidence capture.

For partial-failure evidence, attach Chrome DevTools to the Android debug WebView through `chrome://inspect/#devices` and Safari Web Inspector to the booted iOS Simulator through Develop → Bend Westmoreland iPhone. In each inspector, enable request blocking for `*://api.bend.community/api/v1/events*`, reload Explore, capture the failed Events group alongside successful groups, remove the block, and prove Retry recovers. If request blocking cannot be enabled on either platform, keep that platform's partial-failure row failed; automated component evidence alone does not satisfy this simulator row.

Use deterministic screenshot paths:

~~~bash
xcrun simctl io C824154C-356B-4B2C-BDF1-2DC8F71BDB23 screenshot \
  /Users/kapil/Desktop/projects/the_bend_community_app/.worktrees/westmoreland-native/.superpowers/sdd/2026-08-18-westmoreland-native-ui/evidence/ios-home-light.png
adb -s emulator-5554 exec-out screencap -p > \
  /Users/kapil/Desktop/projects/the_bend_community_app/.worktrees/westmoreland-native/.superpowers/sdd/2026-08-18-westmoreland-native-ui/evidence/android-home-light.png
~~~

For Android offline evidence, disable both transports, verify cached behavior, then restore them:

~~~bash
adb -s emulator-5554 shell svc wifi disable
adb -s emulator-5554 shell svc data disable
adb -s emulator-5554 shell svc wifi enable
adb -s emulator-5554 shell svc data enable
~~~

For iOS offline evidence, use Simulator Settings → Developer → Network Link Conditioner → 100% Loss, verify cached behavior, then turn Network Link Conditioner Off before continuing. If that control is unavailable in the installed runtime, record the limitation, keep the iOS offline row failed, and do not claim the exit gate; do not disable the Mac's network globally.

- [ ] **Step 7: Write the ignored acceptance report**

Record:

- implementation commit SHA;
- frontend test/lint/web-build/native-build results;
- Android Gradle and iOS Xcode results;
- simulator names, IDs, OS versions, and app package ID;
- one row per evidence-matrix state with artifact path and pass/fail;
- live API identity check with no secrets;
- known warning inventory;
- confirmation that location was not requested before explicit intent;
- confirmation that web routes remained unchanged;
- `git status --short` and backend lock SHA.

Do not claim completion if either simulator lacks live content, if any state is untested, or if screenshots show overlap/clipping/desktop chrome.

- [ ] **Step 8: Finish with a source-integrity check**

~~~bash
cd /Users/kapil/Desktop/projects/the_bend_community_app/.worktrees/westmoreland-native
git diff --check
git status --short
git log --oneline --decorate -8
shasum -a 256 the-bend-backend/uv.lock
~~~

Expected: no unintended source difference; only the explicitly preserved generated iOS entries may remain uncommitted; backend lock hash is unchanged. Task 8 creates local evidence only and does not require a source commit.

---

## Final Exit Gate

Phase 1 is implementation-complete only when all statements below are true:

- [ ] Native `/` renders `NativeHomePage` and native `/explore` renders `NativeExplorePage`.
- [ ] Web `/` still renders `HomePage`, web `/explore` still renders the current public not-found surface, and neither web source nor global styling changed.
- [ ] The first Home viewport shows Westmoreland context, search, all four quick actions, and the start of useful live content without collision.
- [ ] Urgent needs, events, volunteer opportunities, community highlights, and partners resolve independently.
- [ ] Explore supports canonical URL state, grouped All results, complete first-page typed views, safe available cursor pagination, filters, partial failure, and stale-response rejection.
- [ ] Volunteer uses listing opportunities; Talent is absent from Phase 1 Explore.
- [ ] Location is requested only after explicit Near me or Use my location intent.
- [ ] Map mode contains only currently visible businesses with valid public coordinates and never persists device coordinates.
- [ ] Guest discovery works; Create/Inbox/You continuation remains allowlisted and one-shot.
- [ ] Loading, empty, error, partial failure, cached offline, denied permission, light, dark, reduced-motion, and large-text states are usable.
- [ ] Full frontend tests, lint, web build, native build, Android Gradle build, and iOS Xcode build pass.
- [ ] Fresh Android and iOS simulator evidence shows live Westmoreland API content and no clipping, overlap, desktop chrome, or broken bottom navigation.
- [ ] Existing tenant isolation, cache privacy, session, deep-link, and mutation-safety behavior remains green.
- [ ] No credential, Firebase configuration, signing material, token, private coordinate, or personal data is committed or included in evidence.
- [ ] No production deployment or app-store release has been performed from this plan.
