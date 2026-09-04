import { expect, test, type Page } from '@playwright/test';

function shop(id: string, name: string, status = 'active') {
  return {
    id,
    name,
    business_type: 'Professional_services',
    address: 'Westmoreland County',
    avatar_url: null,
    contact_phone: null,
    active_listings_count: 0,
    endorsement_count: 0,
    admin_name: 'Business Owner',
    admin_email: 'owner@example.com',
    status,
    listing_count: 0,
    created_at: '2026-09-01T10:00:00Z',
  };
}

async function stubTenant(page: Page) {
  await page.route('**/api/v1/tenant/current', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend Westmoreland' }),
    }),
  );
}

test('business directory requests and renders every page', async ({ page }) => {
  await stubTenant(page);
  const cursors: Array<string | null> = [];
  await page.route('**/api/v1/shops**', (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get('cursor');
    cursors.push(cursor);
    const data = cursor === '2'
      ? { items: [shop('shop-3', 'Third Page Business')], next_cursor: null, has_more: false }
      : { items: [shop('shop-1', 'First Page Business'), shop('shop-2', 'Second Page Business')], next_cursor: '2', has_more: true };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });

  await page.goto('/directory');

  await expect(page.getByText('First Page Business')).toBeVisible();
  await expect(page.getByText('Third Page Business')).toBeVisible();
  expect(new Set(cursors)).toEqual(new Set([null, '2']));
});

test('admin businesses requests and renders every page including rejected records', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'admin-1',
        name: 'Community Admin',
        email: 'admin@example.com',
        role: 'community_admin',
      }),
    );
  });
  await stubTenant(page);
  const cursors: Array<string | null> = [];
  await page.route('**/api/v1/admin/shops**', (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get('cursor');
    cursors.push(cursor);
    const data = cursor === '2'
      ? { items: [shop('shop-3', 'Rejected Page Business', 'rejected')], next_cursor: null, has_more: false }
      : { items: [shop('shop-1', 'First Admin Business'), shop('shop-2', 'Second Admin Business')], next_cursor: '2', has_more: true };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });

  await page.goto('/admin/shops');

  const table = page.locator('table');
  await expect(table.getByText('First Admin Business')).toBeVisible();
  const rejectedRow = table.getByRole('row').filter({ hasText: 'Rejected Page Business' });
  await expect(rejectedRow).toBeVisible();
  await expect(rejectedRow.getByText('Rejected', { exact: true })).toBeVisible();
  expect(new Set(cursors)).toEqual(new Set([null, '2']));
});
