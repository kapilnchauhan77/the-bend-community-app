import { expect, test, type Page } from '@playwright/test';

const upcomingEvent = {
  id: 'event-1',
  title: 'Community Meetup',
  category: 'community',
  start_date: '2099-01-15 18:00:00',
  location: 'Library',
};

async function stubHomeApi(page: Page) {
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
        body: JSON.stringify({ items: [upcomingEvent] }),
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

test('mobile home shows the full upcoming-events section exactly once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubHomeApi(page);
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Upcoming Events', exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'All', exact: true })).toHaveCount(0);
  await expect(page.getByText('community', { exact: true })).toBeVisible();
  await expect(page.getByText('Thu, Jan 15 · Library', { exact: true })).toBeVisible();
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
});
