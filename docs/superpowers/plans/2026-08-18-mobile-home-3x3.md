# Mobile Home 3x3 Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a mobile-only square 3x3 Home-page menu with Events, Business Directory, and Bender, including an accessible five-second upcoming-event preview.

**Architecture:** Keep the current six-item `services` collection as the desktop source of truth, add the three mobile destinations in `HomePage.tsx`, and render separate responsive mobile and desktop menu shells so desktop geometry remains unchanged. Reuse the existing `upcomingEvents` request for the Events preview; a local interval advances only its display index and never changes the `/events` destination.

**Tech Stack:** React 19, TypeScript, React Router, Tailwind CSS 4, Lucide icons, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-18-mobile-home-3x3-design.md`

## Global Constraints

- Below `md`, render exactly nine links in a true 3-column by 3-row square with no horizontal overflow at 320px.
- Preserve the existing six-card `md:grid-cols-3 lg:grid-cols-6` desktop service strip.
- New routes are exactly `/events`, `/directory`, and `/bender`.
- Events previews at most the three already-fetched upcoming events and changes every 5000ms.
- Events always links to `/events`; zero/one event and reduced-motion states do not rotate.
- Preserve the incumbent palette, typography, event sections, and sponsor-banner behavior.
- Give the semantic mobile-menu classes explicit `html.dark` surfaces, borders, text, and focus treatment consistent with the existing theme.

---

### Task 1: Responsive 3x3 Navigation Contract

**Files:**
- Modify: `the-bend-frontend/e2e/home-events-responsive.spec.ts`
- Modify: `the-bend-frontend/src/pages/HomePage.tsx`
- Modify: `the-bend-frontend/src/index.css`

**Interfaces:**
- Consumes: existing `services` entries and React Router `Link`.
- Produces: `[data-testid="mobile-service-grid"]`, `[data-testid="desktop-service-grid"]`, and nine mobile routes ordered in three rows.

- [ ] **Step 1: Write the failing mobile-grid test**

Extend the mobile Playwright case with literal assertions for nine links, the three new `href` values, square frame dimensions, three unique column positions, three unique row positions, and absence of horizontal overflow. Extend the desktop case to require the six-link desktop grid and a hidden mobile grid. The break caught is a regression back to two columns, removal/misrouting of a destination, loss of the square composition, or accidental desktop replacement.

```ts
const mobileGrid = page.getByTestId('mobile-service-grid');
await expect(mobileGrid.getByRole('link')).toHaveCount(9);
await expect(mobileGrid.getByRole('link', { name: /Events/ })).toHaveAttribute('href', '/events');
await expect(mobileGrid.getByRole('link', { name: 'Business Directory' })).toHaveAttribute('href', '/directory');
await expect(mobileGrid.getByRole('link', { name: 'Bender' })).toHaveAttribute('href', '/bender');
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/home-events-responsive.spec.ts`

Expected: FAIL because the current Home page exposes neither test grid and renders six mobile links in two columns.

- [ ] **Step 3: Implement separate mobile and desktop menu shells**

In `HomePage.tsx`, import `CalendarDays`, `Building2`, and `Sparkles`. Retain the current `services` array for desktop, define mobile additions with exact labels/routes, and render:

```tsx
const mobileServices = [
  ...services,
  { icon: CalendarDays, label: 'Events', desc: '', href: '/events' },
  { icon: Building2, label: 'Business Directory', desc: '', href: '/directory' },
  { icon: Sparkles, label: 'Bender', desc: '', href: '/bender' },
];

<div className="home-mobile-menu md:hidden">
  <div aria-hidden="true" className="home-mobile-menu__gold-square" />
  <div data-testid="mobile-service-grid" className="home-mobile-service-grid">
    {mobileServices.map(({ icon: Icon, label, href }) => (
      <Link key={label} to={href} aria-label={label} className="home-mobile-service-tile">
        <Icon aria-hidden="true" className="home-mobile-service-icon" />
        <span className="home-mobile-service-label">
          {label === 'Volunteer Opportunities' ? 'Opportunities' : label}
        </span>
      </Link>
    ))}
  </div>
</div>
<div data-testid="desktop-service-grid" className="hidden md:grid md:grid-cols-3 lg:grid-cols-6 gap-3">
  {services.map(({ icon: Icon, label, desc, href }) => (
    <Link key={label} to={href} className="group bg-[hsl(40,20%,98%)] border border-[hsl(35,18%,84%)] p-4 text-center transition-all duration-200 cursor-pointer hover:border-[hsl(35,45%,42%)] hover:shadow-md">
      <Icon className="w-5 h-5 mx-auto mb-2 text-[hsl(35,45%,42%)] transition-transform group-hover:scale-110" />
      <h3 className="text-sm font-semibold text-[hsl(30,15%,20%)] mb-0.5 font-serif">{label}</h3>
      <p className="text-[11px] text-[hsl(30,10%,50%)] leading-tight">{desc}</p>
    </Link>
  ))}
</div>
```

In `index.css`, add the exact mobile geometry and incumbent brand treatment. Keep every target above 44px at 320px.

```css
.home-mobile-menu {
  position: relative;
  isolation: isolate;
}

.home-mobile-menu__gold-square {
  position: absolute;
  inset: 0.4rem -0.25rem -0.4rem 0.25rem;
  z-index: -1;
  border: 1px solid hsl(35 45% 42% / 0.45);
  background: hsl(38 35% 88% / 0.18);
  transform: rotate(0.75deg);
}

.home-mobile-service-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  aspect-ratio: 1;
  gap: clamp(0.35rem, 1.7vw, 0.55rem);
  padding: clamp(0.45rem, 2vw, 0.7rem);
  border: 1px solid hsl(35 18% 84%);
  background: hsl(40 20% 96%);
}

.home-mobile-service-tile {
  min-width: 0;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.3rem;
  border: 1px solid hsl(35 18% 84%);
  background: hsl(40 20% 98%);
  color: hsl(30 15% 20%);
  text-align: center;
}

.home-mobile-service-tile:focus-visible {
  outline: 2px solid hsl(35 45% 42%);
  outline-offset: 2px;
}

html.dark .home-mobile-service-grid {
  border-color: hsl(35 18% 30%);
  background: hsl(30 12% 14%);
}

html.dark .home-mobile-service-tile {
  border-color: hsl(35 18% 30%);
  background: hsl(30 12% 18%);
  color: hsl(40 20% 92%);
}
```

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run: `PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/home-events-responsive.spec.ts`

Expected: PASS with the mobile and desktop contracts both satisfied.

- [ ] **Step 5: Commit the static responsive menu**

```bash
git add docs/superpowers/specs/2026-08-18-mobile-home-3x3-design.md docs/superpowers/plans/2026-08-18-mobile-home-3x3.md the-bend-frontend/e2e/home-events-responsive.spec.ts the-bend-frontend/src/pages/HomePage.tsx the-bend-frontend/src/index.css
git commit -m "feat: add mobile home 3x3 menu"
```

### Task 2: Accessible Upcoming-Event Rotation

**Files:**
- Modify: `the-bend-frontend/e2e/home-events-responsive.spec.ts`
- Modify: `the-bend-frontend/src/pages/HomePage.tsx`
- Modify: `the-bend-frontend/src/index.css`

**Interfaces:**
- Consumes: `upcomingEvents: CommunityEvent[]` already populated by `eventApi.getUpcoming(3)`.
- Produces: `[data-testid="mobile-events-preview"]` containing the current title, while its parent remains a stable `/events` link.

- [ ] **Step 1: Write failing event-preview tests**

Allow the existing API stub to receive a literal event array. Return three fixtures for the rotation case, one fixture for the static case, and an empty array for the fallback case. Use Playwright Clock to assert the first title on load and the second after 5000ms. In a separate reduced-motion test, emulate `reducedMotion: 'reduce'`, advance 15000ms, and assert that the first title remains. For one event, advance 15000ms and assert it remains; for zero events, assert the literal `See what’s happening` fallback. The break caught is a missing/wrong interval, an empty tile, a changing destination, or rotation that ignores accessibility preferences.

```ts
await page.clock.install();
await page.goto('/');
const preview = page.getByTestId('mobile-events-preview');
await expect(preview).toHaveText('Community Meetup');
await page.clock.fastForward(5000);
await expect(preview).toHaveText('Farmers Market');
```

- [ ] **Step 2: Run the event-preview tests and verify RED**

Run: `PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/home-events-responsive.spec.ts`

Expected: FAIL because there is no event preview inside the mobile menu.

- [ ] **Step 3: Implement the minimal rotation behavior**

Add `mobileEventIndex` state and an effect whose interval is created only when `upcomingEvents.length > 1` and `window.matchMedia('(prefers-reduced-motion: reduce)').matches` is false. Clear the interval on cleanup, normalize the derived index with a safe modulo, and render the fallback `See what’s happening` when no event exists.

```tsx
const [mobileEventIndex, setMobileEventIndex] = useState(0);

useEffect(() => {
  if (upcomingEvents.length <= 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const intervalId = window.setInterval(() => {
    setMobileEventIndex((index) => (index + 1) % upcomingEvents.length);
  }, 5000);

  return () => window.clearInterval(intervalId);
}, [upcomingEvents.length]);

const activeMobileEvent = upcomingEvents.length > 0
  ? upcomingEvents[mobileEventIndex % upcomingEvents.length]
  : null;

<span key={activeMobileEvent?.id ?? 'fallback'} data-testid="mobile-events-preview" className="home-mobile-event-preview">
  {activeMobileEvent?.title ?? 'See what’s happening'}
</span>
```

Add one restrained title transition and disable it inside `@media (prefers-reduced-motion: reduce)`.

```css
@keyframes home-mobile-event-preview-in {
  from { opacity: 0.65; filter: blur(1.5px); }
  to { opacity: 1; filter: blur(0); }
}

.home-mobile-event-preview {
  animation: home-mobile-event-preview-in 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

@media (prefers-reduced-motion: reduce) {
  .home-mobile-event-preview { animation: none; }
}
```

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run: `PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/home-events-responsive.spec.ts`

Expected: PASS for layout, desktop preservation, five-second rotation, and reduced motion.

- [ ] **Step 5: Run complete verification and inspect the rendered result**

Run:

```bash
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
npm run build
npx eslint src/pages/HomePage.tsx e2e/home-events-responsive.spec.ts
node /Users/kapil/.agents/skills/impeccable/scripts/detect.mjs --json src/pages/HomePage.tsx src/index.css
```

Capture one batched browser review at 320x568, 390x844, 430x932, and 1280x900; verify the square geometry, readable labels, focus/touch behavior, no overflow, dark-mode coherence, and unchanged desktop strip. Apply at most one corrective batch and then re-run the targeted test/build.

- [ ] **Step 6: Commit the completed interaction**

```bash
git add the-bend-frontend/e2e/home-events-responsive.spec.ts the-bend-frontend/src/pages/HomePage.tsx the-bend-frontend/src/index.css
git commit -m "feat: rotate upcoming events in mobile menu"
```
