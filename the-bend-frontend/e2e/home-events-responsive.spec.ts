import { expect, test, type Page } from '@playwright/test';

const upcomingEvent = {
  id: 'event-1',
  title: 'Community Meetup',
  category: 'community',
  start_date: '2099-01-15 18:00:00',
  location: 'Library',
};

const rotationEvents = [
  upcomingEvent,
  { ...upcomingEvent, id: 'event-2', title: 'Farmers Market' },
  { ...upcomingEvent, id: 'event-3', title: 'Town Hall' },
];

async function stubHomeApi(page: Page, upcomingEvents = [upcomingEvent]) {
  await page.route('**/api/v1/**', async (route) => {
    const requestUrl = route.request().url();

    if (requestUrl.includes('/tenant/current')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'westmoreland',
          display_name: 'The Bend — Westmoreland',
          tagline: 'Find opportunity within your neighborhood',
          primary_color: 'hsl(160,25%,24%)',
          footer_text: 'Preserving community, one connection at a time',
        }),
      });
      return;
    }

    if (requestUrl.includes('/events/upcoming')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: upcomingEvents }),
      });
      return;
    }

    if (requestUrl.includes('/stats')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          active_shops: 0,
          active_listings: 0,
          items_shared: 0,
          active_individuals: 42,
        }),
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });
}

test('home statistics shows individuals in a responsive four-item grid', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await stubHomeApi(page);
  await page.goto('/');

  const statsHeading = page.getByRole('heading', { name: 'Our Community in Numbers' });
  const statsGrid = statsHeading.locator('xpath=../following-sibling::div[1]');
  await expect(statsGrid.getByText('Individuals', { exact: true })).toBeVisible();
  await expect(statsGrid.getByText('42', { exact: true })).toBeVisible();
  await expect(statsGrid.locator(':scope > div')).toHaveCount(4);
  expect((await statsGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length))).toBe(2);

  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await statsGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length))).toBe(4);
});

test('mobile home shows the full upcoming-events section exactly once', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await stubHomeApi(page);
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Upcoming Events', exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'All', exact: true })).toHaveCount(0);
  await expect(page.getByText('community', { exact: true })).toBeVisible();
  await expect(page.getByText('Thu, Jan 15 · Library', { exact: true })).toBeVisible();

  const mobileGrid = page.getByTestId('mobile-service-grid');
  await expect(mobileGrid.getByRole('link')).toHaveCount(9);
  await expect(mobileGrid.getByRole('link', { name: /Events/ })).toHaveAttribute('href', '/events');
  await expect(mobileGrid.getByRole('link', { name: 'Business Directory' })).toHaveAttribute('href', '/directory');
  await expect(mobileGrid.getByRole('link', { name: 'Bender' })).toHaveAttribute('href', '/bender');
  await expect(mobileGrid.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href')))).resolves.toEqual([
    '/browse?category=staff',
    '/browse?category=materials',
    '/browse?category=equipment',
    '/volunteers',
    '/opportunities',
    '/talent',
    '/events',
    '/directory',
    '/bender',
  ]);

  const frame = await mobileGrid.boundingBox();
  expect(frame).not.toBeNull();
  expect(frame!.width).toBeCloseTo(frame!.height, 0);
  const tiles = await mobileGrid.getByRole('link').evaluateAll((links) => links.map((link) => {
    const rect = link.getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y), width: rect.width, height: rect.height };
  }));
  expect(new Set(tiles.map(({ x }) => x)).size).toBe(3);
  expect(new Set(tiles.map(({ y }) => y)).size).toBe(3);
  expect(tiles.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  const tileContent = await mobileGrid.getByRole('link').evaluateAll((links) => links.map((link) => {
    const tile = link.getBoundingClientRect();
    const spans = Array.from(link.querySelectorAll('span')).map((content) => {
      const rect = content.getBoundingClientRect();
      return {
        contained: rect.left >= tile.left && rect.right <= tile.right,
        fits: content.scrollWidth <= content.clientWidth,
      };
    });
    const icon = link.querySelector('svg')?.getBoundingClientRect();
    return {
      spans,
      iconSized: Boolean(icon && icon.width >= 16 && icon.height >= 16),
      childrenContained: Array.from(link.children).every((child) => {
        const rect = child.getBoundingClientRect();
        return rect.top >= tile.top && rect.bottom <= tile.bottom;
      }),
    };
  }).flat());
  expect(tileContent.every(({ spans, iconSized, childrenContained }) => (
    spans.every(({ contained, fits }) => contained && fits) && iconSized && childrenContained
  ))).toBe(true);
  const previewMetrics = await page.getByTestId('mobile-events-preview').evaluate((preview) => {
    const styles = getComputedStyle(preview);
    const lineHeight = Number.parseFloat(styles.lineHeight);
    const fullContentHeight = preview.scrollHeight;
    return { clientHeight: preview.clientHeight, expectedHeight: Math.min(fullContentHeight, lineHeight * 2) };
  });
  expect(previewMetrics.clientHeight + 0.5).toBeGreaterThanOrEqual(previewMetrics.expectedHeight);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('mobile home decorative square remains axis-aligned', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await stubHomeApi(page);
  await page.goto('/');

  const transform = await page.locator('.home-mobile-menu__gold-square').evaluate((square) => (
    new DOMMatrix(getComputedStyle(square).transform)
  ));

  expect(Math.abs(transform.b)).toBeLessThan(0.000001);
  expect(Math.abs(transform.c)).toBeLessThan(0.000001);
});

test('desktop home shows the compact upcoming-events sidebar exactly once', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await stubHomeApi(page);
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Upcoming Events', exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'All', exact: true })).toBeVisible();
  await expect(page.getByText('JAN', { exact: true })).toBeVisible();
  await expect(page.getByText('Thu, Jan 15 · Library', { exact: true })).toBeHidden();
  await expect(page.getByTestId('desktop-service-grid').getByRole('link')).toHaveCount(6);
  await expect(page.getByTestId('mobile-service-grid')).toBeHidden();
});

test('mobile Events tile rotates through upcoming event titles every five seconds', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await stubHomeApi(page, rotationEvents);
  await page.clock.install();
  await page.goto('/');

  const preview = page.getByTestId('mobile-events-preview');
  await expect(preview).toHaveText('Community Meetup');
  await page.clock.fastForward(5000);
  await expect(preview).toHaveText('Farmers Market');
});

test('mobile Events tile does not rotate when reduced motion is enabled', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubHomeApi(page, rotationEvents);
  await page.clock.install();
  await page.goto('/');

  const preview = page.getByTestId('mobile-events-preview');
  await expect(preview).toHaveText('Community Meetup');
  await page.clock.fastForward(15000);
  await expect(preview).toHaveText('Community Meetup');
});

test('mobile Events rotation stops when reduced motion changes at runtime', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await stubHomeApi(page, rotationEvents);
  await page.clock.install();
  await page.goto('/');

  const preview = page.getByTestId('mobile-events-preview');
  await expect(preview).toHaveText('Community Meetup');
  await page.clock.fastForward(5000);
  await expect(preview).toHaveText('Farmers Market');
  const titleBeforeReducedMotion = await preview.textContent();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.clock.fastForward(10000);
  await expect(preview).toHaveText(titleBeforeReducedMotion ?? '');
});

test('desktop hidden Events preview does not advance its rotation index', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await stubHomeApi(page, rotationEvents);
  await page.clock.install();
  await page.goto('/');

  const preview = page.getByTestId('mobile-events-preview');
  await expect(preview).toHaveText('Community Meetup');
  await page.clock.fastForward(10000);
  await expect(preview).toHaveText('Community Meetup');
});

test('mobile Events tile remains static for one event', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await stubHomeApi(page, [upcomingEvent]);
  await page.clock.install();
  await page.goto('/');

  const preview = page.getByTestId('mobile-events-preview');
  await expect(preview).toHaveText('Community Meetup');
  await page.clock.fastForward(15000);
  await expect(preview).toHaveText('Community Meetup');
});

test('mobile Events tile shows a fallback when no events are available', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await stubHomeApi(page, []);
  await page.goto('/');
  const preview = page.getByTestId('mobile-events-preview');
  await expect(preview).toHaveText('See what’s happening');
});
