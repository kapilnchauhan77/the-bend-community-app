# Compact advertise pricing implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the twelve duration-specific sponsor cards on `/advertise` with four placement cards whose native duration controls select the exact existing pricing record.

**Architecture:** Keep the API response and `AdPricing` contract unchanged. Group records by `placement`, sort each group by `duration_days`, derive the displayed record from a selected record ID, and fall back to the 30-day record or the earliest available duration. Keep the grouping and selection logic next to `AdvertisePage` because no other caller needs it.

**Tech stack:** React 19, TypeScript, React Router, Tailwind CSS, Playwright.

**Spec:** User-approved D1-D3 in the current task. No separate design document or approval gate was requested.

## Global constraints

- Render one card per placement. The verified API currently supplies `homepage`, `footer`, `events`, and `browse`, each with 30, 60, and 90-day records.
- Use a visible native `select` with 30-day, 60-day, and 90-day options. Default to 30 days. If a placement lacks 30 days, default to its earliest available duration.
- The selected duration must display the price and description from that exact `AdPricing` record. `Select` must pass that same record to the existing details and checkout path so the POST uses its exact `pricing_id`.
- Use a two-column desktop grid and one column on mobile. Remove the redundant placement and duration metadata rows. Preserve short API-provided descriptions.
- Keep controls at least 44 CSS pixels high, contained at 320 CSS pixels wide, keyboard accessible, and readable in the app's active light and dark themes.
- Replace the Max panel copy with heading `Max · Build with BEND`, exact body `Turn your business idea into a working product with the team behind The Bend. From reservation systems to custom apps, we’ll help you build it.`, `Custom pricing`, and `Hosting, support, and third-party costs are quoted separately.`
- Max remains a permanent custom offer outside term-based sponsorship. Preserve its `/make-with-bend` destination and all existing route, Gmail, PageLayout, pricing API, checkout, connector, and success behavior.
- Do not change backend pricing, API types, payment behavior, connector behavior, routes, or unrelated layout.

---

### Task 1: Group native plans and select the exact duration record

**Files:**
- Modify: `the-bend-frontend/src/pages/AdvertisePage.tsx`
- Modify: `the-bend-frontend/e2e/advertise-pricing.spec.ts`

**Interfaces:**
- Consumes: `AdPricing { id, name, description?, placement, duration_days, price_cents }` from `src/types/index.ts` and the unchanged `advertisingApi.getPricing()` response.
- Produces: local `PlacementPricingGroup { placement: string; plans: AdPricing[] }`, a pure grouping function that preserves first-seen placement order and sorts each group's plans by ascending `duration_days`, and selected record IDs keyed by placement.
- Selection rule: choose the explicitly selected ID when it still belongs to the group, otherwise choose `duration_days === 30`, otherwise choose the first sorted plan.

- [ ] **Step 1: Run the focused baseline**

Run:

```bash
cd the-bend-frontend
npx playwright test e2e/advertise-pricing.spec.ts --workers=1 --reporter=line
```

Expected: the existing five tests pass before edits.

- [ ] **Step 2: Write failing browser tests**

Update the controlled 12-record fixture and assertions to prove these user-visible contracts:

```typescript
await expect(page.locator('[data-pricing-card]')).toHaveCount(4);
await expect(page.getByRole('combobox')).toHaveCount(4);
await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCount(4);
await expect(page.getByText('Placement:', { exact: true })).toHaveCount(0);
```

For each placement, assert the 30-day record supplies the initial title, short description, price, and selected option. Change one card to 90 days and assert its displayed description and price come from that exact fixture row. Scope locators to the card so repeated duration labels and prices cannot satisfy the wrong assertion.

Intercept `POST /api/v1/advertising/checkout`, choose a non-default duration, fill the three required details fields, submit, and assert the body contains that row's literal `pricing_id`. Fulfill the POST without a redirect. This test must not contact Stripe or create a checkout.

Add a separate fixture in which one placement has only 60-day and 90-day records. Assert that card defaults to the 60-day record and that its options remain duration-sorted.

Update the existing Max tests to require the exact approved heading and both approved copy strings while retaining its destination, contrast, mobile containment, focus, and no-POST coverage. Preserve the connector and whole-dollar coverage against the compact cards.

- [ ] **Step 3: Run RED and verify the reason**

Run:

```bash
cd the-bend-frontend
npx playwright test e2e/advertise-pricing.spec.ts --workers=1 --reporter=line
```

Expected: fail because the current page renders twelve cards and buttons, has no duration dropdown, and still uses the old Max heading and body. Test setup and the unchanged connector flow must not fail.

- [ ] **Step 4: Implement the minimal grouping and selection UI**

In `AdvertisePage.tsx`, add the local group type and pure grouping function. Store selected record IDs by placement. Render the derived groups in `grid-cols-1 md:grid-cols-2`, and scope each native select, price, description, and Select button to its placement card. Use the exact selected `AdPricing` object with the existing `handleSelectPlan` function. Add only narrow Max-card selectors or theme rules needed by the existing contrast tests.

- [ ] **Step 5: Run GREEN**

Run:

```bash
cd the-bend-frontend
npx playwright test e2e/advertise-pricing.spec.ts --workers=1 --reporter=line
```

Expected: all focused tests pass, including exact checkout payload, missing-30 fallback, mobile containment, active dark mode, and preserved Max and connector behavior.

- [ ] **Step 6: Run static checks and review the diff**

Run:

```bash
cd the-bend-frontend
npm run build
npx eslint src/pages/AdvertisePage.tsx e2e/advertise-pricing.spec.ts
cd ..
git diff --check
git diff -- the-bend-frontend/src/pages/AdvertisePage.tsx the-bend-frontend/e2e/advertise-pricing.spec.ts
```

Compare any `AdvertisePage.tsx:46 react-hooks/set-state-in-effect` result with the known unchanged baseline. Do not fix unrelated diagnostics.

- [ ] **Step 7: Commit only the coupled page and test**

```bash
git add the-bend-frontend/src/pages/AdvertisePage.tsx the-bend-frontend/e2e/advertise-pricing.spec.ts
git commit -m "feat: simplify advertising plan selection"
```

Do not stage `.superpowers/plans/` or unrelated files.
