import { expect, test, type Page } from '@playwright/test';

const urgentListing = {
  id: 'urgent-listing',
  title: 'Urgent storm cleanup',
  description: 'Help needed today.',
  type: 'request',
  category: 'staff',
  shop: null,
  posted_by: { id: 'user-1', name: 'Alex', avatar_url: null },
  images: [],
  status: 'active',
  is_free: true,
  urgency: 'urgent',
  interest_count: 0,
  created_at: '2099-01-02 12:00:00',
};

const normalListing = {
  ...urgentListing,
  id: 'normal-listing',
  title: 'Neighborhood yard sale',
  description: 'Household items available this weekend.',
  urgency: 'normal',
};

async function stubHomeApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/v1/tenant/current') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'westmoreland',
          display_name: 'The Bend - Westmoreland',
          tagline: 'Find opportunity within your neighborhood',
          primary_color: 'hsl(160,25%,24%)',
        }),
      });
    }

    if (url.pathname === '/api/v1/listings') {
      let items = [];
      if (url.searchParams.get('status') !== 'fulfilled') {
        items = url.searchParams.get('urgency') === 'normal'
          ? [normalListing]
          : [urgentListing];
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items, has_more: false }),
      });
    }

    if (url.pathname === '/api/v1/stats') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          active_shops: 0,
          active_listings: 2,
          items_shared: 0,
          active_individuals: 0,
        }),
      });
    }

    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });
}

test('desktop Community Board excludes listings already shown as urgent', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await stubHomeApi(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Urgent storm cleanup' })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Neighborhood yard sale' })).toBeVisible();
});
