import { expect, test, type Page } from '@playwright/test';

const tenant = {
  slug: 'westmoreland',
  display_name: 'The Bend - Westmoreland',
  tagline: 'Find opportunity within your neighborhood',
  primary_color: 'hsl(160,25%,24%)',
  footer_text: 'Preserving community, one connection at a time',
};

const events = Array.from({ length: 24 }, (_, index) => ({
  id: `calendar-event-${index + 1}`,
  title: `Community event ${index + 1}`,
  category: 'community',
  start_date: `2099-01-${String((index % 28) + 1).padStart(2, '0')} 18:00:00`,
  created_at: '2098-12-01 10:00:00',
  location: 'Westmoreland Library',
  description: 'A community gathering.',
  source: 'manual',
  is_featured: false,
}));

async function stubEventsApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/tenant/current')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(tenant) });
      return;
    }
    if (url.includes('/events')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: events }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
}

async function expectCalendarAligned(page: Page, expectedMonth: string) {
  await expect.poll(async () => page.evaluate((month) => {
    const heading = Array.from(document.querySelectorAll('h2')).find((element) => element.textContent?.trim() === month);
    const card = heading?.closest('div.rounded-2xl');
    const grid = card?.querySelectorAll('div.grid.grid-cols-7').item(1);
    const controls = document.querySelector('section.sticky');
    if (!heading || !grid || !controls) return false;
    const headingRect = heading.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();
    return window.scrollY > 0
      && headingRect.top >= controlsRect.bottom
      && gridRect.top >= controlsRect.bottom
      && gridRect.bottom <= window.innerHeight;
  }, expectedMonth), { timeout: 5000 }).toBe(true);
}

test('switching from a deep list scroll shows the calendar below its sticky controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubEventsApi(page);
  await page.goto('/events');

  await expect(page.getByRole('heading', { name: 'Community Events' })).toBeVisible();
  await page.getByRole('button', { name: 'Calendar', exact: true }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const listScrollY = await page.evaluate(() => window.scrollY);
  expect(listScrollY).toBeGreaterThanOrEqual(2 * 844);

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const expectedMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthHeading = page.getByRole('heading', { name: expectedMonth, exact: true });
  await expect(monthHeading).toBeVisible();
  await expectCalendarAligned(page, expectedMonth);
  const alignedScrollY = await page.evaluate(() => window.scrollY);
  const currentMonthDate = new Date(`${expectedMonth} 1`);
  currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
  const expectedNextMonth = currentMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('heading', { name: expectedNextMonth, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(alignedScrollY, 0);
});

test('switching while a filtered list is loading aligns after the response renders', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseFilteredResponse!: () => void;
  let filteredRequestSeen!: () => void;
  const filteredResponse = new Promise<void>((resolve) => { releaseFilteredResponse = resolve; });
  const filteredRequest = new Promise<void>((resolve) => { filteredRequestSeen = resolve; });
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/tenant/current')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(tenant) });
      return;
    }
    if (url.includes('/events')) {
      if (new URL(url).searchParams.has('category')) {
        filteredRequestSeen();
        await filteredResponse;
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: events }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/events');
  await expect(page.getByRole('heading', { name: 'Community Events' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(2 * 844);

  await page.getByLabel('Filter by category').selectOption('community');
  await filteredRequest;
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  releaseFilteredResponse();

  const expectedMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  await expect(page.getByRole('heading', { name: expectedMonth, exact: true })).toBeVisible();
  await expectCalendarAligned(page, expectedMonth);
  const alignedScrollY = await page.evaluate(() => window.scrollY);
  const nextMonthDate = new Date(`${expectedMonth} 1`);
  nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
  const expectedNextMonth = nextMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('heading', { name: expectedNextMonth, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(alignedScrollY, 0);
});
