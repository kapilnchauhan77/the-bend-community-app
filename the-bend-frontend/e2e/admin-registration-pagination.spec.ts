import { expect, test, type Page } from '@playwright/test';

type Status = 'pending' | 'approved' | 'rejected';

const approved = Array.from({ length: 25 }, (_, index) => ({
  id: `approved-${index + 1}`,
  name: `Approved Business ${index + 1}`,
  business_type: 'Professional services',
  admin_name: `Owner ${index + 1}`,
  admin_email: `owner-${index + 1}@example.com`,
  created_at: `2026-09-10T${String(23 - Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}:00Z`,
  status: 'approved' as const,
}));

const pending = [{
  id: 'pending-1',
  name: 'Pending Business',
  business_type: 'Retail',
  admin_name: 'Pending Owner',
  admin_email: 'pending@example.com',
  created_at: '2026-09-10T10:00:00Z',
  status: 'pending' as const,
}];

async function prepareAdmin(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'admin-1', name: 'Community Admin', role: 'community_admin' }));
  });
}

async function stubAdminApi(page: Page, options: { delayPending?: boolean } = {}) {
  let releasePending: (() => void) | undefined;
  let resolvePendingResponse: (() => void) | undefined;
  const pendingHeld = options.delayPending
    ? new Promise<void>((resolve) => { releasePending = resolve; })
    : Promise.resolve();
  const pendingResponse = new Promise<void>((resolve) => { resolvePendingResponse = resolve; });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tenant/current')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ display_name: 'The Bend' }) });
      return;
    }
    if (!url.pathname.endsWith('/admin/registrations')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      return;
    }

    const status = (url.searchParams.get('status') || 'pending') as Status;
    const cursor = url.searchParams.get('cursor');
    if (status === 'pending') await pendingHeld;
    const rows = status === 'approved' ? (cursor ? approved.slice(20) : approved.slice(0, 20)) : status === 'pending' ? pending : [];
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: rows,
        next_cursor: status === 'approved' && !cursor ? 'next-approved-page' : null,
        has_more: status === 'approved' && !cursor,
        counts: { pending: 1, approved: 25, rejected: 0 },
      }),
    });
    if (status === 'pending' && options.delayPending) resolvePendingResponse?.();
  });
  return { releasePending: () => releasePending?.(), pendingResponse };
}

test('approved registrations load all pages without duplicates or status mixing', async ({ page }) => {
  await prepareAdmin(page);
  await stubAdminApi(page);
  await page.goto('/admin/registrations');
  await page.getByRole('tab', { name: /Approved 25/ }).click();
  await expect(page.getByRole('cell', { name: 'Approved Business 1', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Approved Business 20', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Load more/i })).toBeVisible();
  await page.getByRole('button', { name: /Load more/i }).click();
  await expect(page.getByRole('cell', { name: 'Approved Business 25', exact: true })).toHaveCount(1);
  await expect(page.getByText('Pending Business', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Load more/i })).toHaveCount(0);
});

test('switching tabs resets accumulated registrations to the active status', async ({ page }) => {
  await prepareAdmin(page);
  await stubAdminApi(page);
  await page.goto('/admin/registrations');
  await page.getByRole('tab', { name: /Approved 25/ }).click();
  await expect(page.getByRole('cell', { name: 'Approved Business 1', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Pending 1/ }).click();
  await expect(page.getByRole('cell', { name: 'Pending Business', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Approved Business 1', exact: true })).toHaveCount(0);
});

test('a slower prior tab response cannot overwrite the active tab', async ({ page }) => {
  await prepareAdmin(page);
  const { releasePending, pendingResponse } = await stubAdminApi(page, { delayPending: true });
  await page.goto('/admin/registrations');
  await page.getByRole('tab', { name: /^Approved/ }).click();
  await expect(page.getByRole('cell', { name: 'Approved Business 1', exact: true })).toBeVisible();
  releasePending();
  await pendingResponse;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(page.getByRole('cell', { name: 'Approved Business 1', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Approved Business 1', exact: true })).toBeVisible();
  await expect(page.getByText('Pending Business', { exact: true })).toHaveCount(0);
});
