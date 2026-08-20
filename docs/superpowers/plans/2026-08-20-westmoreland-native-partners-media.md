# Westmoreland native Partners and media implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Partners carousel operable without swipe and stop organization logos from being cropped in native cards.

**Architecture:** Keep `NativePartnerCarousel` as a manual scroll-snap carousel and add explicit Previous and Next controls that use the same active-index state as swipe. Add a media-fit value to the native discovery presentation model so adapters identify logos and photos by source field instead of URL heuristics.

**Tech stack:** React 19, TypeScript 5.9, Vitest, React Testing Library, scoped native CSS, Lucide React, Capacitor 8.

**Spec:** `docs/superpowers/specs/2026-08-20-westmoreland-native-phase-2-ux-design.md`

## Global constraints

- Preserve partner API order, swipe, scroll snap, pagination dots, live status, website validation, logo fallback, and the `Partner with us` footer.
- Do not autoplay or clone carousel items.
- Previous and Next controls render only when at least two partners exist.
- Previous is disabled at index 0. Next is disabled at the final index.
- Controls, swipe, active slide, dots, physical scroll position, and live status must stay synchronized.
- Dots remain noninteractive visual indicators.
- Business and sponsor logos use contained fitting. Listing, event, volunteer, and Bender media use cover fitting.
- Adapters choose fit from the source field, not URL text or load success.
- Keep every control at least 44 by 44 points and scope CSS below `.native-app`.
- The Phase 2 index plan establishes a clean worktree and index before this workstream starts. Stop if an unrelated path becomes modified or staged.
- Before every commit, stage only the exact task paths listed in that step, confirm the staged names, and run the staged diff check. Do not stage generated SwiftPM files or any unlisted path.
- No production deployment or store submission is authorized by this plan.

---

## File responsibility map

### Modify

- `the-bend-frontend/src/components/native/ui/NativePartnerCarousel.tsx` owns control behavior and carousel synchronization.
- `the-bend-frontend/src/components/native/ui/NativePartnerCarousel.test.tsx` covers controls, swipe, reset, and extremes.
- `the-bend-frontend/src/native/discovery/types.ts` adds the explicit media-fit contract.
- `the-bend-frontend/src/native/discovery/adapters.ts` assigns fit by domain source.
- `the-bend-frontend/src/native/discovery/adapters.test.ts` protects every adapter mapping.
- `the-bend-frontend/src/components/native/ui/NativeDiscoveryCard.tsx` renders the fit class or data value.
- `the-bend-frontend/src/pages/native/NativeHomePage.test.tsx` checks Home card composition.
- `the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx` checks Explore card composition.
- `the-bend-frontend/src/components/native/NativeExploreMap.test.tsx` updates typed business fixtures.
- `the-bend-frontend/src/pages/native/NativeExploreMap.lazy.integration.test.tsx` updates typed business fixtures.
- `the-bend-frontend/src/styles/native.css` owns carousel controls and contained or covered media.
- `the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx` protects CSS geometry and focus.

---

### Task 1: Add Previous and Next partner controls

**Files:**

- Modify: `the-bend-frontend/src/components/native/ui/NativePartnerCarousel.tsx`
- Modify: `the-bend-frontend/src/components/native/ui/NativePartnerCarousel.test.tsx`

**Interfaces:**

```ts
function partnerSlideOffset(
  track: HTMLUListElement,
  index: number,
): number

function moveToPartner(index: number): void
```

`moveToPartner` clamps the requested index, scrolls the track to that slide's `offsetLeft`, and updates `{ partnerOrder, index }` immediately. It uses `behavior: 'auto'` under `prefers-reduced-motion: reduce` and `behavior: 'smooth'` otherwise.

- [ ] **Step 1: Write failing carousel-control tests**

Cover:

- Previous and Next are absent for zero or one partner.
- Two or more partners render `Previous partner` and `Next partner`.
- Previous starts disabled and Next starts enabled.
- Next scrolls to the second slide, updates the active slide, dot, and live status.
- Previous returns to the first slide.
- Next disables at the final slide.
- A manual swipe updates control disabled states.
- A changed partner order resets scroll position and controls to index 0.
- No timer starts.

```tsx
it('moves the physical track and announcement with Next', async () => {
  const { container } = render(<NativePartnerCarousel partners={partners} />)
  const track = screen.getByRole('list', { name: 'Community partners' })
  const slides = [...container.querySelectorAll<HTMLElement>('[data-partner-slide]')]
  Object.defineProperty(slides[1], 'offsetLeft', { configurable: true, value: 320 })
  const scrollTo = vi.fn()
  Object.defineProperty(track, 'scrollTo', { configurable: true, value: scrollTo })
  fireEvent.click(screen.getByRole('button', { name: 'Next partner' }))
  expect(scrollTo).toHaveBeenCalledWith({ left: 320, behavior: 'smooth' })
  expect(screen.getByRole('status')).toHaveTextContent("Partner 2 of 3: Erica's Place")
})
```

- [ ] **Step 2: Run the test and confirm RED**

```bash
cd the-bend-frontend
npm run test:run -- src/components/native/ui/NativePartnerCarousel.test.tsx
```

Expected: Previous and Next buttons are missing.

- [ ] **Step 3: Implement control synchronization**

Use icon plus screen-reader text or text labels. The buttons stay outside the `aria-hidden` pagination container:

```tsx
<div className="native-partner-controls" aria-label="Partner carousel controls">
  <button
    type="button"
    className="native-partner-step native-control"
    aria-label="Previous partner"
    disabled={safeActiveIndex === 0}
    onClick={() => moveToPartner(safeActiveIndex - 1)}
  >
    <ChevronLeft aria-hidden="true" />
  </button>
  <button
    type="button"
    className="native-partner-step native-control"
    aria-label="Next partner"
    disabled={safeActiveIndex === partners.length - 1}
    onClick={() => moveToPartner(safeActiveIndex + 1)}
  >
    <ChevronRight aria-hidden="true" />
  </button>
</div>
```

Do not set `aria-hidden` on slides containing website links. Keep slide position labels.

- [ ] **Step 4: Run the test and confirm GREEN**

```bash
npm run test:run -- src/components/native/ui/NativePartnerCarousel.test.tsx
```

- [ ] **Step 5: Commit the carousel behavior**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/components/native/ui/NativePartnerCarousel.tsx \
  the-bend-frontend/src/components/native/ui/NativePartnerCarousel.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "fix(native-home): add partner carousel controls"
```

Expected staged names are exactly the two paths above. Stop before committing if any other path appears.

---

### Task 2: Add an explicit media-fit presentation contract

**Files:**

- Modify: `the-bend-frontend/src/native/discovery/types.ts`
- Modify: `the-bend-frontend/src/native/discovery/adapters.ts`
- Modify: `the-bend-frontend/src/native/discovery/adapters.test.ts`
- Modify: `the-bend-frontend/src/components/native/ui/NativeDiscoveryCard.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeHomePage.test.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx`
- Modify: `the-bend-frontend/src/components/native/NativeExploreMap.test.tsx`
- Modify: `the-bend-frontend/src/pages/native/NativeExploreMap.lazy.integration.test.tsx`
- Modify: `the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx`

**Interfaces:**

```ts
export type NativeMediaFit = 'cover' | 'contain'

export interface NativeDiscoveryCardModel {
  id: string
  kind: NativeDiscoveryKind
  label: string
  title: string
  supportingText: string
  thumbnailUrl: string | null
  mediaFit: NativeMediaFit
  targetPath: string
  coordinates: { latitude: number; longitude: number } | null
  urgent: boolean
}
```

- [ ] **Step 1: Write failing adapter and card tests**

Expected mappings:

```ts
expect(adaptBusiness(shop).mediaFit).toBe('contain')
expect(adaptListing(listing).mediaFit).toBe('cover')
expect(adaptEvent(event).mediaFit).toBe('cover')
expect(adaptOpportunity(opportunity).mediaFit).toBe('cover')
expect(adaptBender(post).mediaFit).toBe('cover')
```

Render a business and listing card and assert `data-media-fit="contain"` and `data-media-fit="cover"`. Verify missing and failed media still use the same stable fallback geometry.

- [ ] **Step 2: Run the focused tests and confirm RED**

```bash
npm run test:run -- src/native/discovery/adapters.test.ts src/pages/native/NativeHomePage.test.tsx src/pages/native/NativeExplorePage.test.tsx src/components/native/NativeExploreMap.test.tsx src/pages/native/NativeExploreMap.lazy.integration.test.tsx src/components/native/ui/NativeComponents.test.tsx
```

Expected: the model lacks `mediaFit` and cards do not expose a fit contract.

- [ ] **Step 3: Add the model field and adapter values**

Set `mediaFit: 'contain'` only when the selected source field is an organization logo or avatar. Set `cover` for content imagery. Render:

```tsx
<img
  data-media-fit={item.mediaFit}
  className={`native-discovery-media native-discovery-media--${item.mediaFit}`}
  src={resolveAssetUrl(item.thumbnailUrl)}
  alt={item.kind === 'bender' ? '' : item.title}
  width="96"
  height="96"
  loading="lazy"
/>
```

Do not infer fit from an extension, hostname, dimensions, or load failure.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

```bash
npm run test:run -- src/native/discovery/adapters.test.ts src/pages/native/NativeHomePage.test.tsx src/pages/native/NativeExplorePage.test.tsx src/components/native/NativeExploreMap.test.tsx src/pages/native/NativeExploreMap.lazy.integration.test.tsx src/components/native/ui/NativeComponents.test.tsx
```

- [ ] **Step 5: Commit the media contract**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/native/discovery/types.ts \
  the-bend-frontend/src/native/discovery/adapters.ts \
  the-bend-frontend/src/native/discovery/adapters.test.ts \
  the-bend-frontend/src/components/native/ui/NativeDiscoveryCard.tsx \
  the-bend-frontend/src/pages/native/NativeHomePage.test.tsx \
  the-bend-frontend/src/pages/native/NativeExplorePage.test.tsx \
  the-bend-frontend/src/components/native/NativeExploreMap.test.tsx \
  the-bend-frontend/src/pages/native/NativeExploreMap.lazy.integration.test.tsx \
  the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "fix(native-media): preserve organization logos"
```

Expected staged names are exactly the nine paths above. Stop before committing if any other path appears.

---

### Task 3: Add scoped control and media CSS

**Files:**

- Modify: `the-bend-frontend/src/styles/native.css`
- Modify: `the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx`

- [ ] **Step 1: Write failing CSS contract tests**

```ts
expect(cssRule('.native-app .native-partner-step')).toMatch(/min-width:\s*44px/)
expect(cssRule('.native-app .native-partner-step')).toMatch(/min-height:\s*44px/)
expect(cssRule('.native-app .native-discovery-media--contain')).toMatch(/object-fit:\s*contain/)
expect(cssRule('.native-app .native-discovery-media--cover')).toMatch(/object-fit:\s*cover/)
```

Also require visible focus, disabled styling that does not rely on opacity alone, and unchanged `.native-partner-logo img { object-fit: contain; }`.

- [ ] **Step 2: Run the test and confirm RED**

```bash
npm run test:run -- src/components/native/ui/NativeComponents.test.tsx
```

- [ ] **Step 3: Add native-scoped CSS**

Use existing spacing, border, primary, muted, focus, card, and radius tokens. Keep controls adjacent to the pagination without covering the carousel. Preserve text growth and page width.

- [ ] **Step 4: Run workstream verification**

```bash
npm run test:run -- \
  src/components/native/ui/NativePartnerCarousel.test.tsx \
  src/native/discovery/adapters.test.ts \
  src/pages/native/NativeHomePage.test.tsx \
  src/pages/native/NativeExplorePage.test.tsx \
  src/components/native/NativeExploreMap.test.tsx \
  src/pages/native/NativeExploreMap.lazy.integration.test.tsx \
  src/components/native/ui/NativeComponents.test.tsx
npx tsc --noEmit
npm run lint
npm run build
npm run build:native
```

- [ ] **Step 5: Commit the scoped styling**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -- \
  the-bend-frontend/src/styles/native.css \
  the-bend-frontend/src/components/native/ui/NativeComponents.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "style(native): clarify partner and logo media controls"
```

Expected staged names are exactly the two paths above. Stop before committing if any other path appears.

---

### Task 4: Verify Partners and media on Android and iOS

**Files:**

- Create locally, do not track: `.superpowers/sdd/2026-08-20-native-phase-2/partners-media/`

- [ ] **Step 1: Use the final exact-source installed packages**

```bash
cd "$(git rev-parse --show-toplevel)"
PHASE2_SOURCE_COMMIT="$(git rev-parse HEAD)"
test -f the-bend-frontend/android/app/build/outputs/apk/debug/app-debug.apk
test -d "/tmp/bend-native-phase2-$PHASE2_SOURCE_COMMIT/Build/Products/Debug-iphonesimulator/App.app"
```

First execute the index plan's Full verification and package gate. It runs Gradle and Xcode, hashes both artifacts, installs the APK on `emulator-5554`, and installs the simulator app on `C824154C-356B-4B2C-BDF1-2DC8F71BDB23`. Do not substitute an older installed build or rerun only `build:native` and `cap copy`.

- [ ] **Step 2: Verify the carousel**

On Android and iOS, verify zero, one, and many partner states, swipe, Previous, Next, disabled ends, active dots, status announcements, API-order reset, large text, dark mode, and no page-level horizontal overflow.

- [ ] **Step 3: Verify organization and content media**

Confirm business and partner logos fit without cropping. Confirm listing, event, volunteer, and Bender photographs still fill their media boxes. Force one broken logo and confirm fallback geometry remains stable.

- [ ] **Step 4: Run screen readers and record evidence**

Use TalkBack and VoiceOver to operate Previous and Next and traverse the active partner card. Record source commit, APK SHA-256, app-bundle path, simulator identifiers, and screenshot names. Return both simulators to Home.
