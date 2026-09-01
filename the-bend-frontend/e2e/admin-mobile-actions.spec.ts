import { expect, test, type Page } from '@playwright/test';

async function authenticateAdmin(page: Page) {
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
}

async function stubAdminApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith('/tenant/current')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'westmoreland',
          display_name: 'The Bend Westmoreland',
          primary_color: 'hsl(160,25%,24%)',
        }),
      });
      return;
    }

    if (url.pathname.endsWith('/admin/dashboard')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          pending_registrations: 2,
          active_shops: 8,
          active_listings: 12,
          recent_registrations: [],
          recent_listings: [],
        }),
      });
      return;
    }

    if (url.pathname.endsWith('/admin/registrations') && route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'registration-1',
              name: 'Mobile Community Church',
              business_type: 'community_faith',
              admin_name: 'Robin Admin',
              admin_email: 'robin@example.com',
              created_at: '2026-09-01T10:00:00Z',
              status: 'pending',
            },
          ],
          counts: { pending: 1, approved: 0, rejected: 0 },
        }),
      });
      return;
    }

    if (url.pathname.endsWith('/admin/shops') && route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'shop-1',
              name: 'Mobile Market',
              business_type: 'retail',
              admin_name: 'Taylor Owner',
              admin_email: 'taylor@example.com',
              status: 'active',
              listing_count: 4,
              created_at: '2026-08-20T10:00:00Z',
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname.endsWith('/admin/listings') && route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'listing-1',
              title: 'Community hall tables',
              shop_name: 'Mobile Community Church',
              category: 'equipment',
              urgency: 'normal',
              status: 'active',
              created_at: '2026-08-25T10:00:00Z',
            },
          ],
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

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticateAdmin(page);
  await stubAdminApi(page);
});

test('mobile admin dashboard exposes section navigation and actionable totals', async ({ page }) => {
  await page.goto('/admin');

  const section = page.getByLabel('Admin section');
  await expect(section).toBeVisible();
  await expect(page.getByRole('link', { name: /Pending Registrations/i })).toHaveAttribute(
    'href',
    '/admin/registrations',
  );
  await expect(page.getByRole('link', { name: /Active Businesses/i })).toHaveAttribute(
    'href',
    '/admin/shops',
  );
  await expect(page.getByRole('link', { name: /Active Listings/i })).toHaveAttribute(
    'href',
    '/admin/listings',
  );

  for (const path of ['/admin/registrations', '/admin/shops', '/admin/listings']) {
    await page.goto('/admin');
    await page.getByLabel('Admin section').selectOption(path);
    await expect(page).toHaveURL(path);
  }
});

test('mobile registration actions stay in view and submit approve and reject requests', async ({
  page,
}) => {
  await page.goto('/admin/registrations');

  const view = page.getByRole('button', { name: 'View' });
  const approve = page.getByRole('button', { name: 'Approve' });
  const reject = page.getByRole('button', { name: 'Reject' });
  await expect(view).toBeInViewport({ ratio: 1 });
  await expect(approve).toBeInViewport({ ratio: 1 });
  await expect(reject).toBeInViewport({ ratio: 1 });

  await reject.click();
  await page.getByLabel('Reason').fill('Incomplete information');
  const rejectRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().endsWith('/admin/registrations/registration-1/reject'),
  );
  await page.getByRole('button', { name: 'Confirm Rejection' }).click();
  await rejectRequest;

  const approveRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().endsWith('/admin/registrations/registration-1/approve'),
  );
  await approve.click();
  await approveRequest;
});

test('mobile business actions stay in view and submit suspension', async ({ page }) => {
  await page.goto('/admin/shops');

  const view = page.getByRole('button', { name: 'View' });
  const suspend = page.getByRole('button', { name: 'Suspend' });
  await expect(view).toBeInViewport({ ratio: 1 });
  await expect(suspend).toBeInViewport({ ratio: 1 });

  await view.click();
  await expect(page.getByRole('dialog', { name: 'Mobile Market' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();

  await suspend.click();
  await page.getByLabel('Reason').fill('Temporary moderation review');
  const suspendRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/admin/shops/shop-1/suspend'),
  );
  await page.getByRole('button', { name: 'Confirm Suspension' }).click();
  await suspendRequest;
});

test('mobile listing action stays in view and submits removal', async ({ page }) => {
  await page.goto('/admin/listings');

  const remove = page.getByRole('button', { name: 'Remove' });
  await expect(remove).toBeInViewport({ ratio: 1 });

  await remove.click();
  await page.getByLabel('Reason').fill('Duplicate listing');
  const removeRequest = page.waitForRequest(
    (request) =>
      request.method() === 'DELETE' && request.url().endsWith('/admin/listings/listing-1'),
  );
  await page.getByRole('button', { name: 'Confirm Removal' }).click();
  await removeRequest;
});
