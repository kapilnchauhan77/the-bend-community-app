import { expect, test, type Page } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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

function localDateParts(date = new Date()) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
    iso: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  };
}

async function stubCalendarEvents(page: Page, calendarEvents: Array<Record<string, unknown>>) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/tenant/current')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(tenant) });
      return;
    }
    if (url.includes('/events')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: calendarEvents }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
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

test('uses the approved local logo for missing and broken event images, while retaining a usable source image', async ({ page }) => {
  const { iso } = localDateParts();
  const eventsWithImages = [
    {
      id: 'no-image', title: 'No image event', category: 'community', start_date: `${iso}T09:00:00`,
      created_at: `${iso}T08:00:00`, location: 'Library', description: 'No image.', source: 'manual', is_featured: false,
    },
    {
      id: 'broken-image', title: 'Broken image event', category: 'community', start_date: `${iso}T10:00:00`,
      created_at: `${iso}T08:00:00`, location: 'Library', description: 'Broken image.', source: 'manual', is_featured: false,
      image_url: 'https://images.example.test/broken.png',
    },
    {
      id: 'source-image', title: 'Source image event', category: 'community', start_date: `${iso}T11:00:00`,
      created_at: `${iso}T08:00:00`, location: 'Library', description: 'Source image.', source: 'manual', is_featured: false,
      image_url: 'https://images.example.test/source.png',
    },
  ];
  await page.route('https://images.example.test/broken.png', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.route('https://images.example.test/source.png', route => route.fulfill({ body: onePixelPng, contentType: 'image/png' }));
  await stubCalendarEvents(page, eventsWithImages);

  await page.goto('/events');
  await expect(page.getByRole('heading', { name: 'No image event', exact: true })).toBeVisible();
  const cards = page.locator('[id^="event-"]');
  await expect(cards.nth(0).getByRole('img', { name: 'No image event' })).toHaveAttribute('src', '/images/the-bend-community-logo-black.png');
  await expect(cards.nth(1).getByRole('img', { name: 'Broken image event' })).toHaveAttribute('src', '/images/the-bend-community-logo-black.png');
  await expect(cards.nth(2).getByRole('img', { name: 'Source image event' })).toHaveAttribute('src', 'https://images.example.test/source.png');
});

test('calendar keeps the current title aligned with its image, count, accessible date, long-title containment, and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { iso } = localDateParts();
  const longTitle = 'A very long community event title that must stay contained inside the calendar day cell';
  const calendarEvents = [
    {
      id: 'calendar-first', title: 'Morning river cleanup', category: 'community', start_date: `${iso}T09:00:00`,
      created_at: `${iso}T08:00:00`, location: 'River trail', description: 'Cleanup.', source: 'manual', is_featured: false,
      image_url: 'https://images.example.test/calendar-broken.png',
    },
    {
      id: 'calendar-second', title: longTitle, category: 'community', start_date: `${iso}T11:00:00`,
      created_at: `${iso}T08:00:00`, location: 'River trail', description: 'Talk.', source: 'manual', is_featured: false,
      image_url: 'https://images.example.test/second.png',
    },
  ];
  await page.route('https://images.example.test/calendar-broken.png', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.route('https://images.example.test/second.png', route => route.fulfill({ body: onePixelPng, contentType: 'image/png' }));
  await stubCalendarEvents(page, calendarEvents);

  await page.goto('/events');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const dateLabel = new Date(`${iso}T00:00:00`).toLocaleDateString();
  const day = page.getByRole('button', { name: new RegExp(`${dateLabel}.*2 events`) });
  await expect(day).toBeVisible();
  await expect(day).toContainText('Morning river cleanup');
  await expect(day).toContainText('2');
  await expect(day.getByRole('img')).toHaveAttribute('alt', 'Morning river cleanup');
  await expect(day.getByRole('img')).toHaveAttribute('src', '/images/the-bend-community-logo-black.png');
  const currentTitle = day.locator('[id^="calendar-day-title-"]');
  await expect(currentTitle).toHaveText('Morning river cleanup');
  await expect.poll(async () => day.getByRole('img').getAttribute('alt'), { timeout: 5000 }).toBe(longTitle);
  await expect(day.getByRole('img')).toHaveAttribute('src', 'https://images.example.test/second.png');
  await expect(currentTitle).toHaveText(longTitle);
  await expect(day).toContainText(longTitle);
  const titleBox = day.getByText(longTitle, { exact: true });
  await expect(titleBox).toBeVisible();
  await expect(titleBox).toHaveCSS('-webkit-line-clamp', '2');
  const titleBounds = await titleBox.boundingBox();
  expect(titleBounds?.width ?? 0).toBeGreaterThan(20);
  expect(titleBounds?.height ?? 0).toBeLessThanOrEqual(40);
  await expect(day.getByText('2', { exact: true })).toBeVisible();

  await page.screenshot({ path: 'output/playwright/task-5-calendar-green.png', fullPage: false });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const reducedDay = page.getByRole('button', { name: new RegExp(`${dateLabel}.*2 events`) });
  await expect(reducedDay.getByRole('img')).toHaveAttribute('alt', 'Morning river cleanup');
  await expect(reducedDay.locator('[id^="calendar-day-title-"]')).toHaveText('Morning river cleanup');
  await page.waitForTimeout(3200);
  await expect(reducedDay.getByRole('img')).toHaveAttribute('alt', 'Morning river cleanup');
});
