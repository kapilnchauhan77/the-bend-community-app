# Max Make with BEND implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a permanent, custom-priced Max offering on the Westmoreland tenant site with a dedicated Make with BEND page, verified portfolio imagery, and user-initiated Gmail and email-app compose links.

**Architecture:** A typed local data module owns the offer copy, verified portfolio records, and compose-link construction. A new public page renders that data inside the existing `PageLayout`, and one static card on `AdvertisePage` links to it without entering the duration-based pricing or Stripe paths.

**Tech Stack:** React 19, TypeScript 5.9, React Router, Tailwind CSS, Vite, Playwright 1.62, Google Chrome.

**Spec:** `docs/superpowers/specs/2026-09-10-max-make-with-bend-design.md`

## Global constraints

- The production route is `/make-with-bend` on tenant sites such as `https://westmoreland.bend.community`; do not change the `bend.community` root-host branch.
- Do not add a footer link or a global-navigation link.
- Max is a custom quote and does not expire like an advertisement. Hosting, maintenance, support, third-party fees, delivery scope, licensing, and ownership remain separately defined by each quote.
- Do not add Max to `AdPricing`, sponsor records, Stripe checkout, connector checkout, admin pricing, or any backend module.
- Every primary CTA must use the exact visible text `Tell us your idea` and open Gmail compose in a new tab.
- Gmail compose recipients must be exactly `Jd.darr@proline-online.com` and `kapilnchauhan77@gmail.com`; the subject must be exactly `Make with BEND: My idea`.
- The fallback link must use the exact visible text `Use another email app` and a `mailto:` URL with the same two recipients and subject.
- Opening a compose link is the only website action. Do not send email, store an inquiry, issue a Bend API request, or show a sent or received success state.
- Render only the rows under `Included projects` in `docs/max-portfolio-sources.md`. Use their supplied names, contribution descriptions, screenshots, and source URLs without inventing claims.
- The initial published portfolio is exactly The Bend, Provoke, Authentica, Aroma, and Law study platform. Do not render Taco Mexicana, Procys Identity Verification, Inperio AMIE, Arogya Health, MaxAssist, RecipeOps, or Fact Verification Agent.
- Portfolio screenshots are the five `.jpg` files documented in `docs/max-portfolio-sources.md`, are 1280 by 720, use `object-contain`, include descriptive alternative text, and lazy-load below the fold.
- Service examples describe possible work, not completed installations or delivery guarantees.
- Preserve every existing 30, 60, and 90-day advertising package, the 90-day event connector, and their current checkout behavior.
- Follow strict TDD. Commit only after the focused RED and GREEN evidence is recorded.

---

### Task 1: Add the typed Max offering and public page

**Files:**

- Create: `the-bend-frontend/src/data/maxOffering.ts`
- Create: `the-bend-frontend/src/pages/MakeWithBendPage.tsx`
- Modify: `the-bend-frontend/src/App.tsx:13-90`
- Create: `the-bend-frontend/e2e/make-with-bend.spec.ts`
- Consume without modifying: `docs/max-portfolio-sources.md`
- Consume without modifying: `the-bend-frontend/public/images/max-portfolio/*.jpg`

**Interfaces:**

- Produces: `MAX_INQUIRY_RECIPIENTS` as a readonly two-address tuple.
- Produces: `MAX_INQUIRY_SUBJECT` with the exact value `Make with BEND: My idea`.
- Produces: `buildMaxGmailComposeUrl(): string` and `buildMaxMailtoUrl(): string`.
- Produces: `MaxServiceExample`, `MaxPortfolioProject`, and `MaxProcessStep` types.
- Produces: `maxServiceExamples`, `maxPortfolioProjects`, and `maxProcessSteps` readonly arrays.
- Produces: default React page `MakeWithBendPage` at the tenant route `/make-with-bend`.
- Consumes: only rows under `Included projects` in `docs/max-portfolio-sources.md`.

- [ ] **Step 1: Write the failing public-page tests**

Create `e2e/make-with-bend.spec.ts`. Stub `/api/v1/tenant/current` with the complete public tenant shape used by `PageLayout` and the existing public footer-sponsor GET with an empty `items` response. Let any other Bend API request fail the test, and separately assert that Max triggers no inquiry or checkout POST. Add separate tests so a slow viewport does not consume a combined whole-test timeout. Preserve the complete existing `PageLayout`, including its navbar, footer, bottom navigation, install banner, and sponsor banner.

The first test must navigate directly to `/make-with-bend` and assert:

```ts
await expect(page.getByRole('heading', { name: 'Make with BEND', exact: true })).toBeVisible();
await expect(page.getByText('Custom pricing', { exact: true })).toBeVisible();
await expect(page.getByRole('heading', { name: 'What we can build', exact: true })).toBeVisible();

for (const name of [
  'Restaurant reservations',
  'Marina and park live cameras',
  'Service price calculators',
  'Live gas station prices',
  'Newspaper feeds',
  'Video review creator',
]) {
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

await expect(page.getByText(/does not expire like an ad placement/i)).toBeVisible();
await expect(page.getByText(/hosting, maintenance, support, and third-party/i)).toBeVisible();
```

Assert these exact published portfolio names and image paths:

```ts
const publishedProjects = [
  ['The Bend', '/images/max-portfolio/bend-community.jpg'],
  ['Provoke', '/images/max-portfolio/provoke-space.jpg'],
  ['Authentica', '/images/max-portfolio/authentica.jpg'],
  ['Aroma', '/images/max-portfolio/aroma.jpg'],
  ['Law study platform', '/images/max-portfolio/acil-law.jpg'],
] as const;
```

Assert `Taco Mexicana`, `Procys Identity Verification`, `Inperio AMIE`, and `Arogya Health` do not appear as portfolio headings because the source manifest marks them as image gaps. For every rendered portfolio image, assert `naturalWidth > 0`, `naturalHeight > 0`, `loading="lazy"`, width `1280`, height `720`, and a non-empty alternative description.

The compose-link test must derive its expected values by hand, not by importing the production builder:

```ts
const recipients = ['Jd.darr@proline-online.com', 'kapilnchauhan77@gmail.com'];
const gmail = new URL(await page.getByRole('link', { name: 'Tell us your idea', exact: true }).getAttribute('href') ?? '');

expect(gmail.origin).toBe('https://mail.google.com');
expect(gmail.pathname).toBe('/mail/');
expect(gmail.searchParams.get('view')).toBe('cm');
expect(gmail.searchParams.get('fs')).toBe('1');
expect(gmail.searchParams.get('to')?.split(',')).toEqual(recipients);
expect(gmail.searchParams.get('su')).toBe('Make with BEND: My idea');
await expect(page.getByRole('link', { name: 'Tell us your idea', exact: true })).toHaveAttribute('target', '_blank');
await expect(page.getByRole('link', { name: 'Tell us your idea', exact: true })).toHaveAttribute('rel', /noopener/);
await expect(page.getByRole('link', { name: 'Tell us your idea', exact: true })).toHaveAttribute('rel', /noreferrer/);
```

Parse the fallback as a mail address plus query string. Assert the two exact recipients and exact subject. Record all requests whose method is `POST`; assert the list stays empty while the page loads and when the compose anchors receive focus. Do not navigate to Gmail in the automated test and do not claim a populated Gmail session from this test.

Add separate responsive tests for 1440 by 900 light mode, 390 by 844 light mode, and 390 by 844 dark mode. Each test must assert `document.documentElement.scrollWidth <= window.innerWidth`, the approved Bend logo loads, headings and CTA remain contained, and keyboard focus on the CTA has a visible outline. Save focused proof screenshots to this plan's ignored SDD workspace, not a tracked source directory.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd the-bend-frontend
PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/make-with-bend.spec.ts --workers=1
```

Expected: FAIL because `/make-with-bend` renders the current not-found page and the Make with BEND heading, service examples, portfolio, and compose links do not exist.

- [ ] **Step 3: Add the typed content and compose-link implementation**

Create `src/data/maxOffering.ts` with these exact shapes:

```ts
export interface MaxServiceExample {
  title: string;
  description: string;
  dependencyNote: string;
}

export interface MaxPortfolioProject {
  slug: string;
  name: string;
  contribution: string;
  image: {
    src: `/images/max-portfolio/${string}.jpg`;
    alt: string;
    width: 1280;
    height: 720;
  };
  sourceUrl: `https://${string}`;
}

export interface MaxProcessStep {
  number: '01' | '02' | '03' | '04';
  title: string;
  description: string;
}
```

Define the six service entries with the exact test titles. Their descriptions may explain the user-supplied examples, while every `dependencyNote` must state the relevant access, hardware, vendor, or quote dependency. Define four process entries with the titles `Discuss your idea`, `Scope the proposal`, `Build and review`, and `Launch`.

Define exactly these five `maxPortfolioProjects` records, using the supported descriptions from `docs/max-portfolio-sources.md` verbatim:

```ts
[
  {
    slug: 'the-bend',
    name: 'The Bend',
    contribution: 'Community platform for local businesses, listings, events, and community participation.',
    image: { src: '/images/max-portfolio/bend-community.jpg', alt: 'The Bend community platform home page', width: 1280, height: 720 },
    sourceUrl: 'https://bend.community/',
  },
  {
    slug: 'provoke',
    name: 'Provoke',
    contribution: 'AI workspace bringing conversations and productivity tools together.',
    image: { src: '/images/max-portfolio/provoke-space.jpg', alt: 'Provoke AI workspace home page', width: 1280, height: 720 },
    sourceUrl: 'https://www.provoke.space/',
  },
  {
    slug: 'authentica',
    name: 'Authentica',
    contribution: 'Restaurant website with menus, food photography, location information, and contact links.',
    image: { src: '/images/max-portfolio/authentica.jpg', alt: 'Authentica restaurant website home page', width: 1280, height: 720 },
    sourceUrl: 'https://authentica-1jc.pages.dev/',
  },
  {
    slug: 'aroma',
    name: 'Aroma',
    contribution: 'Restaurant website with a browsable menu, food gallery, and ordering and reservation contact links.',
    image: { src: '/images/max-portfolio/aroma.jpg', alt: 'Aroma restaurant website home page', width: 1280, height: 720 },
    sourceUrl: 'https://aroma-7iy.pages.dev/',
  },
  {
    slug: 'law-study-platform',
    name: 'Law study platform',
    contribution: 'AI-assisted judiciary exam preparation with faculty-reviewed material and source-backed answers.',
    image: { src: '/images/max-portfolio/acil-law.jpg', alt: 'Law study platform home page', width: 1280, height: 720 },
    sourceUrl: 'https://study.provoke.space/',
  },
]
```

Do not label the last record ACIL and do not claim client endorsement. Exclude every row under `Candidates awaiting a safe image` and every optional candidate.

Construct compose destinations through one small interface:

```ts
export const MAX_INQUIRY_RECIPIENTS = [
  'Jd.darr@proline-online.com',
  'kapilnchauhan77@gmail.com',
] as const;

export const MAX_INQUIRY_SUBJECT = 'Make with BEND: My idea';

const MAX_INQUIRY_BODY = [
  'Hello,',
  '',
  'I would like to discuss a custom project with the creators of The Bend.',
  '',
  'My idea:',
  '',
  'Business or organization:',
  '',
  'Best way to reach me:',
].join('\n');

export function buildMaxGmailComposeUrl(): string {
  const query = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: MAX_INQUIRY_RECIPIENTS.join(','),
    su: MAX_INQUIRY_SUBJECT,
    body: MAX_INQUIRY_BODY,
  });
  return `https://mail.google.com/mail/?${query.toString()}`;
}

export function buildMaxMailtoUrl(): string {
  const recipients = MAX_INQUIRY_RECIPIENTS.join(',');
  return `mailto:${recipients}?subject=${encodeURIComponent(MAX_INQUIRY_SUBJECT)}&body=${encodeURIComponent(MAX_INQUIRY_BODY)}`;
}
```

- [ ] **Step 4: Build the page and register the tenant route**

Create `src/pages/MakeWithBendPage.tsx` as one page module that renders:

1. A Bend-branded hero with the approved white logo, a `Max` eyebrow, `Make with BEND` heading, `Custom pricing`, and a concise offer description.
2. A `What we can build` section with the six typed service examples and their dependency notes.
3. A `Selected work` section that maps `maxPortfolioProjects` to image-led cards. Images must use the typed fixed dimensions, `loading="lazy"`, `decoding="async"`, and `object-contain` on a neutral background.
4. A `How it works` section mapping the four process steps.
5. A final inquiry section with the exact `Tell us your idea` Gmail link and `Use another email app` fallback.
6. Plain-language permanence terms that say the custom solution does not expire like an ad placement and that the quote defines hosting, maintenance, support, third-party fees, scope, licensing, and ownership.

The final Gmail anchor uses `buildMaxGmailComposeUrl()`, `target="_blank"`, and `rel="noopener noreferrer"`. The email-app anchor uses `buildMaxMailtoUrl()`. Do not add form state, click handlers, analytics, fetches, payment controls, success messages, or timers.

Use the existing color values and responsive conventions from `AdvertisePage` and `PageLayout`. Add visible `focus-visible` ring styles. Keep all text and cards within 390px without horizontal scrolling.

Import the page in `App.tsx` and add exactly one public tenant route:

```tsx
<Route path="/make-with-bend" element={<MakeWithBendPage />} />
```

Do not modify the `isRootDomain()` branch.

- [ ] **Step 5: Run focused GREEN verification**

Run:

```bash
cd the-bend-frontend
PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/make-with-bend.spec.ts --workers=1
npx eslint src/data/maxOffering.ts src/pages/MakeWithBendPage.tsx e2e/make-with-bend.spec.ts src/App.tsx
npm run build
git diff --check
```

Expected: all focused browser cases pass, ESLint reports no diagnostics for the changed files, the production build exits zero, and `git diff --check` prints nothing.

- [ ] **Step 6: Self-review and commit Task 1**

Check every rendered portfolio record against `docs/max-portfolio-sources.md`. Confirm no page code writes data or contacts external systems on load. Confirm the root-host branch and Footer are unchanged.

Commit only Task 1 code and tests. Do not stage root's portfolio assets or source document:

```bash
git add the-bend-frontend/src/data/maxOffering.ts \
  the-bend-frontend/src/pages/MakeWithBendPage.tsx \
  the-bend-frontend/src/App.tsx \
  the-bend-frontend/e2e/make-with-bend.spec.ts
git commit -m "feat: add Make with BEND page"
```

---

### Task 2: Add the non-checkout Max entry to Advertise

**Files:**

- Modify: `the-bend-frontend/src/pages/AdvertisePage.tsx:220-347`
- Modify: `the-bend-frontend/e2e/advertise-pricing.spec.ts`
- Test: `the-bend-frontend/e2e/make-with-bend.spec.ts`

**Interfaces:**

- Consumes: tenant route `/make-with-bend` from Task 1.
- Produces: a static Max card shown only in the existing `step === 'select'` advertising selection view.
- Preserves: the existing `pricing` array, `selectedPlan`, sponsor checkout, connector checkout, and all related button behavior.

- [ ] **Step 1: Extend the advertising tests before implementation**

In `e2e/advertise-pricing.spec.ts`, add a test that stubs the existing 12 pricing records, navigates to `/advertise`, and asserts:

```ts
await expect(page.getByRole('heading', { name: 'Max', exact: true })).toBeVisible();
await expect(page.getByText('Custom pricing', { exact: true })).toBeVisible();
await expect(page.getByRole('link', { name: 'Make with BEND', exact: true })).toHaveAttribute('href', '/make-with-bend');
await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCount(12);
await expect(page.getByRole('button', { name: 'Get Started', exact: true })).toBeVisible();
```

Record Bend API POST requests, click `Make with BEND`, assert the new heading is visible, and assert no POST was issued. Keep the existing price assertions unchanged.

- [ ] **Step 2: Run the advertising tests and verify RED**

Run:

```bash
cd the-bend-frontend
PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/advertise-pricing.spec.ts --workers=1
```

Expected: the new test fails because the Max heading and Make with BEND route link are absent. Existing price tests still pass.

- [ ] **Step 3: Add the minimal Max card**

In the current `step === 'select'` view, add one static Max section after the duration-based package cards and before the existing `Premium Service` connector section. The card must show:

- Eyebrow: `Permanent custom solution`
- Heading: `Max`
- Price label: `Custom pricing`
- Link: `Make with BEND`, pointing to `/make-with-bend`
- Copy that says visitors work with the creators of The Bend on a scoped custom solution and that ongoing services are quoted separately.

Use React Router `Link`. Do not call `handleSelectPlan`, change `selectedPlan`, add a fake `AdPricing` item, display a duration, or introduce checkout language.

- [ ] **Step 4: Run focused and combined GREEN verification**

Run:

```bash
cd the-bend-frontend
PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/advertise-pricing.spec.ts e2e/make-with-bend.spec.ts --workers=1
npx eslint src/pages/AdvertisePage.tsx e2e/advertise-pricing.spec.ts
npm run build
git diff --check
```

Expected: both focused specifications pass, ESLint adds no changed-file diagnostics, the build exits zero, and `git diff --check` prints nothing.

- [ ] **Step 5: Commit Task 2**

```bash
git add the-bend-frontend/src/pages/AdvertisePage.tsx \
  the-bend-frontend/e2e/advertise-pricing.spec.ts
git commit -m "feat: add Max advertising option"
```
