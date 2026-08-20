# Westmoreland native Explore and Map implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make native Explore tabs, List and Map switching, location help, and business map controls clear, URL-stable, and accessible.

**Architecture:** Keep `NativeExplorePage` as the URL and request-state owner. Extract the type tabs and view switch into focused components, use a pure map-availability helper for deterministic URL correction, and keep Leaflet inside a labelled native region. No web route or backend behavior changes.

**Tech stack:** React 19, TypeScript 5.9, React Router 7, React Leaflet 5, Leaflet 1.9, Vitest, React Testing Library, scoped native CSS, Capacitor 8.

**Spec:** `docs/superpowers/specs/2026-08-20-westmoreland-native-phase-2-ux-design.md`

## Global constraints

- Preserve all current Explore result types in this order: All, Listings, Businesses, Events, Bender, Volunteer.
- All and Businesses are the only map-capable types.
- Hide the List and Map switch while eligible results are pending. Preserve a requested `mode=map` silently during that pending state without rendering the map.
- Render the List and Map switch only after a resolved result set contains at least one privacy-safe business coordinate.
- Keep `mode=map` when map availability resolves to available. Replace the URL with List when availability resolves to empty or unsupported.
- Do not request location until the user activates Near me or Use my location.
- Keep map coordinates ephemeral and preserve current tenant and privacy filters.
- Keep every selector and control at least 44 by 44 points.
- Scope CSS below `.native-app`; do not change the web Explore page.
- The Phase 2 index plan establishes a clean worktree and index before this workstream starts. Stop if an unrelated path becomes modified or staged.
- Before every commit, stage only the exact task paths listed in that step, confirm the staged names, and run the staged diff check. Do not stage generated SwiftPM files or any unlisted path.
- No production deployment or store submission is authorized by this plan.

---

## File responsibility map

### Create

- `the-bend-frontend/src/components/native/ui/NativeExploreTypeTabs.tsx` owns tab focus, key navigation, selected-tab scrolling, ids, and panel linkage.
- `the-bend-frontend/src/components/native/ui/NativeExploreTypeTabs.test.tsx` covers the tab contract.
- `the-bend-frontend/src/components/native/ui/NativeViewModeSwitch.tsx` renders the single List and Map segmented control.
- `the-bend-frontend/src/components/native/ui/NativeViewModeSwitch.test.tsx` covers selection and callbacks when map availability is resolved and available.
- `the-bend-frontend/src/native/discovery/mapAvailability.ts` resolves pending, available, unsupported, and empty map states.
- `the-bend-frontend/src/native/discovery/mapAvailability.test.ts` covers the pure state matrix.

### Modify

- `the-bend-frontend/src/pages/native/NativeExplorePage.tsx` composes tabs, panel, switch, filters, map status, and location help.
- `the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx` covers URL correction and page integration.
- `the-bend-frontend/src/components/native/NativeExploreMap.tsx` owns map and marker semantics.
- `the-bend-frontend/src/components/native/NativeExploreMap.test.tsx` covers marker, selector, preview, and region labels.
- `the-bend-frontend/src/pages/native/NativeExplorePermission.integration.test.tsx` covers request-driven location and denial.
- `the-bend-frontend/src/native/discovery/queries.test.ts` preserves URL parsing and serialization rules.
- `the-bend-frontend/src/styles/native.css` owns scoped tabs, segmented controls, location help, and focus states.
- `the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx` protects the CSS contracts.

---

### Task 1: Extract an accessible Explore type tab rail

**Files:**

- Create: `the-bend-frontend/src/components/native/ui/NativeExploreTypeTabs.tsx`
- Create: `the-bend-frontend/src/components/native/ui/NativeExploreTypeTabs.test.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeExplorePage.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx`

**Interfaces:**

```ts
export const NATIVE_EXPLORE_TYPES = [
  ['All', 'all'],
  ['Listings', 'listings'],
  ['Businesses', 'businesses'],
  ['Events', 'events'],
  ['Bender', 'bender'],
  ['Volunteer', 'volunteer'],
] as const

export interface NativeExploreTypeTabsProps {
  value: NativeExploreType
  panelId: string
  onChange(value: NativeExploreType): void
}
```

- [ ] **Step 1: Write the failing tab tests**

Cover one tabbable selected tab, stable tab and panel ids, `aria-controls`, `aria-selected`, Left Arrow, Right Arrow, Home, End, click selection, wrapping from the last tab to the first, and selected-tab `scrollIntoView` with `{ block: 'nearest', inline: 'center' }`.

```tsx
it('moves selection with ArrowRight and links the tab to its panel', () => {
  const onChange = vi.fn()
  render(<NativeExploreTypeTabs value="all" panelId="explore-results" onChange={onChange} />)
  const all = screen.getByRole('tab', { name: 'All' })
  expect(all).toHaveAttribute('id', 'native-explore-tab-all')
  expect(all).toHaveAttribute('aria-controls', 'explore-results')
  fireEvent.keyDown(all, { key: 'ArrowRight' })
  expect(onChange).toHaveBeenCalledWith('listings')
})
```

- [ ] **Step 2: Run the tests and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- src/components/native/ui/NativeExploreTypeTabs.test.tsx src/pages/native/NativeExplorePage.test.tsx
```

Expected: the new module is missing and the page has no owned tab panel.

- [ ] **Step 3: Implement the tab rail and panel ownership**

Use one ref per tab. The key handler derives the next index from `NATIVE_EXPLORE_TYPES`, focuses that button, then calls `onChange`. A layout effect scrolls the selected tab into view. In `NativeExplorePage`, keep URL updates in the existing `change` callback and render results inside:

```tsx
<div
  id="native-explore-results"
  role="tabpanel"
  aria-labelledby={`native-explore-tab-${query.type}`}
>
  {results}
</div>
```

Selecting a type clears category, urgency, sort, and Near me. The existing serializer retains Map only when the target is All or Businesses; every other target serializes as List.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

```bash
npm run test:run -- src/components/native/ui/NativeExploreTypeTabs.test.tsx src/pages/native/NativeExplorePage.test.tsx src/native/discovery/queries.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the tab unit**

Stage the exact task paths from the clean baseline:

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/components/native/ui/NativeExploreTypeTabs.tsx \
  the-bend-frontend/src/components/native/ui/NativeExploreTypeTabs.test.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "fix(native-explore): complete type tab behavior"
```

Expected staged names are exactly the four paths above. Stop before committing if any other path appears.

---

### Task 2: Make List and Map one deterministic view control

**Files:**

- Create: `the-bend-frontend/src/native/discovery/mapAvailability.ts`
- Create: `the-bend-frontend/src/native/discovery/mapAvailability.test.ts`
- Create: `the-bend-frontend/src/components/native/ui/NativeViewModeSwitch.tsx`
- Create: `the-bend-frontend/src/components/native/ui/NativeViewModeSwitch.test.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeExplorePage.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx`
- Modify: `the-bend-frontend/src/native/discovery/queries.test.ts`

**Interfaces:**

```ts
export type NativeMapAvailability =
  | { status: 'unsupported' }
  | { status: 'pending' }
  | { status: 'empty' }
  | { status: 'available' }

export function getNativeMapAvailability(input: {
  type: NativeExploreType
  resultStatus: NativeSectionStatus
  coordinateCount: number
}): NativeMapAvailability

export interface NativeViewModeSwitchProps {
  value: 'list' | 'map'
  onChange(value: 'list' | 'map'): void
}
```

`getNativeMapAvailability` returns `unsupported` unless type is All or Businesses. For a supported type it returns `pending` while the business-bearing result state is loading, `available` when `coordinateCount > 0`, and `empty` for every resolved zero-coordinate state, including empty and error.

- [ ] **Step 1: Write the failing state-matrix and control tests**

```ts
it.each([
  [{ type: 'events', resultStatus: 'success', coordinateCount: 2 }, 'unsupported'],
  [{ type: 'businesses', resultStatus: 'loading', coordinateCount: 0 }, 'pending'],
  [{ type: 'businesses', resultStatus: 'success', coordinateCount: 0 }, 'empty'],
  [{ type: 'all', resultStatus: 'success', coordinateCount: 1 }, 'available'],
])('resolves map availability', (input, expected) => {
  expect(getNativeMapAvailability(input as never).status).toBe(expected)
})
```

Add page tests proving:

- `mode=map` survives while the business-bearing section is loading.
- Neither the List and Map switch nor the map renders while availability is pending.
- Pending availability does not call URL replacement, so `mode=map` remains silent in the URL.
- The segmented control renders only when availability is available.
- Successful zero-coordinate results replace the URL with List.
- Unsupported types replace a direct `mode=map` URL with List.
- Available coordinates retain Map.
- Selecting Events, Bender, Listings, or Volunteer clears Map.
- No removable `Map` filter chip renders.
- Empty and unsupported states render neither the segmented control nor the map.

- [ ] **Step 2: Run the tests and confirm RED**

```bash
npm run test:run -- src/native/discovery/mapAvailability.test.ts src/components/native/ui/NativeViewModeSwitch.test.tsx src/pages/native/NativeExplorePage.test.tsx src/native/discovery/queries.test.ts
```

Expected: missing helper and switch, plus the current Map chip and stale URL failures.

- [ ] **Step 3: Implement the helper, switch, and URL correction**

For All, derive `resultStatus` from the business group. For Businesses, derive it from `model.typed.state`. Use a guarded effect:

```ts
useEffect(() => {
  if (query.mode !== 'map') return
  if (mapAvailability.status === 'unsupported' || mapAvailability.status === 'empty') {
    change({ mode: 'list' }, true)
  }
}, [change, mapAvailability.status, query.mode])
```

Remove the Map filter chip. Keep category, urgency, sort, and Near me chips unchanged. `NativeViewModeSwitch` uses `aria-label="Explore view"` and two 44-point buttons with `aria-pressed`.

Render `NativeViewModeSwitch` only when `mapAvailability.status === 'available'`. While status is `pending`, leave `query.mode` untouched and render the existing loading or result placeholder without the switch or map. The guarded effect performs no pending correction and uses replacement navigation only after availability resolves to `empty` or `unsupported`.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

```bash
npm run test:run -- src/native/discovery/mapAvailability.test.ts src/components/native/ui/NativeViewModeSwitch.test.tsx src/pages/native/NativeExplorePage.test.tsx src/native/discovery/queries.test.ts
```

- [ ] **Step 5: Commit the view-mode unit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/native/discovery/mapAvailability.ts \
  the-bend-frontend/src/native/discovery/mapAvailability.test.ts \
  the-bend-frontend/src/components/native/ui/NativeViewModeSwitch.tsx \
  the-bend-frontend/src/components/native/ui/NativeViewModeSwitch.test.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx \
  the-bend-frontend/src/native/discovery/queries.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "fix(native-explore): simplify list and map state"
```

Expected staged names are exactly the seven paths above. Stop before committing if any other path appears.

---

### Task 3: Correct map, marker, selector, and location semantics

**Files:**

- Modify: `the-bend-frontend/src/components/native/NativeExploreMap.tsx`
- Modify: `the-bend-frontend/src/components/native/NativeExploreMap.test.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeExplorePage.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeExplorePermission.integration.test.tsx`

**Interfaces:** Existing `NativeExploreMapProps` remains unchanged.

- [ ] **Step 1: Write failing semantic and permission tests**

Assert:

- The map wrapper is `role="region"` with `aria-label="Business map"`.
- No interactive ancestor uses `role="status"`.
- Each Leaflet marker has the business title instead of `Marker` as its accessible name.
- Selector labels use `Show {business} on map`.
- Preview actions use `Open {business} details`.
- `Use my location` references help text through `aria-describedby`.
- No location request occurs on render or ordinary map selection.
- Denial retains Westmoreland-wide results and exposes Retry once.

```tsx
expect(screen.getByRole('region', { name: 'Business map' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Show Inn at Montross on map' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Use my location' })).toHaveAttribute(
  'aria-describedby',
  'native-map-location-help',
)
```

- [ ] **Step 2: Run the tests and confirm RED**

```bash
npm run test:run -- src/components/native/NativeExploreMap.test.tsx src/pages/native/NativeExplorePage.test.tsx src/pages/native/NativeExplorePermission.integration.test.tsx
```

Expected: generic marker and selector names, status-wrapped map, and missing location description.

- [ ] **Step 3: Implement the semantic changes**

Pass `alt={business.title}` and `title={business.title}` to each `Marker`. Keep result-count announcements in separate `<p role="status">` elements. Render:

```tsx
<section aria-labelledby="native-business-map-title">
  <h2 id="native-business-map-title">Business map</h2>
  <p id="native-map-location-help">
    We ask only after you choose this button. Your location sorts or centers nearby Westmoreland results.
  </p>
  <button type="button" aria-describedby="native-map-location-help">
    Use my location
  </button>
</section>
```

The Leaflet wrapper owns the region label. Popup, selector, and detail labels include the business title.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

```bash
npm run test:run -- src/components/native/NativeExploreMap.test.tsx src/pages/native/NativeExplorePage.test.tsx src/pages/native/NativeExplorePermission.integration.test.tsx
```

- [ ] **Step 5: Commit the map semantics unit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/components/native/NativeExploreMap.tsx \
  the-bend-frontend/src/components/native/NativeExploreMap.test.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePermission.integration.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "fix(native-map): label location and business controls"
```

Expected staged names are exactly the five paths above. Stop before committing if any other path appears.

---

### Task 4: Add scoped layout, focus, and overflow contracts

**Files:**

- Modify: `the-bend-frontend/src/styles/native.css`
- Modify: `the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeExploreMap.lazy.integration.test.tsx`

- [ ] **Step 1: Write failing CSS and lazy-map tests**

Require `.native-explore-type-tabs` horizontal overflow and trailing padding, nonshrinking tabs, 44-point mode and location controls, visible focus, a bounded tab panel, and `.native-app .leaflet-container { isolation: isolate; z-index: 0; }` so Leaflet cannot paint over native chrome.

```ts
expect(cssRule('.native-app .native-explore-type-tabs')).toMatch(/overflow-x:\s*auto/)
expect(cssRule('.native-app .native-view-mode button')).toMatch(/min-height:\s*44px/)
expect(cssRule('.native-app .leaflet-container')).toMatch(/isolation:\s*isolate/)
```

- [ ] **Step 2: Run the tests and confirm RED**

```bash
npm run test:run -- src/components/native/ui/NativeComponents.test.tsx src/pages/native/NativeExploreMap.lazy.integration.test.tsx
```

- [ ] **Step 3: Add the minimum native-scoped CSS**

Use existing native spacing, border, card, primary, focus, and safe-area tokens. Do not add fixed card heights, animations, or global Leaflet overrides outside `.native-app`.

- [ ] **Step 4: Run the complete Explore verification**

```bash
npm run test:run -- \
  src/components/native/ui/NativeExploreTypeTabs.test.tsx \
  src/components/native/ui/NativeViewModeSwitch.test.tsx \
  src/native/discovery/mapAvailability.test.ts \
  src/native/discovery/queries.test.ts \
  src/components/native/NativeExploreMap.test.tsx \
  src/pages/native/NativeExplorePage.test.tsx \
  src/pages/native/NativeExplorePermission.integration.test.tsx \
  src/pages/native/NativeExploreMap.lazy.integration.test.tsx \
  src/components/native/ui/NativeComponents.test.tsx
npx tsc --noEmit
npm run lint
npm run build
npm run build:native
```

Expected: tests, type checking, lint, web build, and native build pass. Existing documented build warnings may remain.

- [ ] **Step 5: Commit the scoped styling unit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/styles/native.css \
  the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx \
  the-bend-frontend/src/pages/native/NativeExploreMap.lazy.integration.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "style(native-explore): clarify tabs and map controls"
```

Expected staged names are exactly the three paths above. Stop before committing if any other path appears.

---

### Task 5: Verify Explore on Android and iOS

**Files:**

- Create locally, do not track: `.superpowers/sdd/2026-08-20-native-phase-2/explore-map/`

- [ ] **Step 1: Use the final exact-source installed packages**

```bash
cd "$(git rev-parse --show-toplevel)"
PHASE2_SOURCE_COMMIT="$(git rev-parse HEAD)"
test -f the-bend-frontend/android/app/build/outputs/apk/debug/app-debug.apk
test -d "/tmp/bend-native-phase2-$PHASE2_SOURCE_COMMIT/Build/Products/Debug-iphonesimulator/App.app"
```

First execute the index plan's Full verification and package gate. It runs Gradle and Xcode, hashes both artifacts, installs the APK on `emulator-5554`, and installs the simulator app on `C824154C-356B-4B2C-BDF1-2DC8F71BDB23`. Do not substitute an older installed build or rerun only `build:native` and `cap copy`.

- [ ] **Step 2: Verify Android**

Build and install the current APK. Confirm tab swiping and keyboard focus, a hidden List and Map switch while results are pending, silent preservation of `mode=map` during pending, switch appearance only after map availability resolves to available, URL replacement to List after empty or unsupported resolution, named selectors, explicit location request, denial recovery, large text, dark mode, and no page-level horizontal overflow. Run TalkBack across the type tabs, available-state view switch, map selectors, location help, and Retry control.

- [ ] **Step 3: Verify iOS**

Build and install the current simulator app. Confirm the same flow with VoiceOver, large Dynamic Type, dark mode, and status-bar clearance.

- [ ] **Step 4: Record evidence integrity**

Record the source commit, APK SHA-256, app-bundle path, simulator identifiers, and screenshot names in the local evidence folder. Return both simulators to Home. Do not claim completion from an older installed build.
