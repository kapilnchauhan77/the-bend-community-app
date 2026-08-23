import { expect, test, type Page } from '@playwright/test';

const existingCode = {
  id: 'code-existing',
  owner_shop_id: null,
  owner_user_id: null,
  code: 'WELCOME20',
  name: 'Welcome Event Discount',
  description: 'Twenty percent off an event placement.',
  discount_type: 'percentage',
  discount_value: 20,
  expiry_date: null,
  max_uses: 10,
  usage_count: 2,
  is_active: true,
  coupon_type: 'event',
  created_at: '2026-08-20T12:00:00Z',
};

const createdCode = {
  ...existingCode,
  id: 'code-created',
  code: 'CHURCHFREEEVENT',
  name: 'Free Nonprofit Church Event',
  description: 'One free event placement for a nonprofit church.',
  discount_value: 100,
  max_uses: 1,
  usage_count: 0,
  created_at: '2026-08-24T12:00:00Z',
};

type JsonPayload = Record<string, unknown>;

interface DiscountApiCapture {
  collectionGets: number;
  legacyMineGets: number;
  createPayload?: JsonPayload;
}

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

async function stubDiscountApi(
  page: Page,
  initialCodes: Array<typeof existingCode>,
): Promise<DiscountApiCapture> {
  const capture: DiscountApiCapture = { collectionGets: 0, legacyMineGets: 0 };
  let codes = [...initialCodes];

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname.endsWith('/tenant/current')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'westmoreland',
          display_name: 'The Bend - Westmoreland',
          primary_color: 'hsl(160,25%,24%)',
        }),
      });
      return;
    }

    if (url.pathname.endsWith('/discount-codes/mine') && method === 'GET') {
      capture.legacyMineGets += 1;
      await route.fulfill({
        status: 405,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Method Not Allowed' }),
      });
      return;
    }

    if (url.pathname.endsWith('/discount-codes') && method === 'GET') {
      capture.collectionGets += 1;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(codes),
      });
      return;
    }

    if (url.pathname.endsWith('/discount-codes') && method === 'POST') {
      capture.createPayload = request.postDataJSON() as JsonPayload;
      codes = [createdCode, ...codes];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(createdCode),
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  return capture;
}

test('loads owned discount codes from the backend collection route', async ({ page }) => {
  await authenticateAdmin(page);
  const capture = await stubDiscountApi(page, [existingCode]);

  await page.goto('/my-discount-codes');

  await expect(page.getByText('WELCOME20', { exact: true })).toBeVisible();
  expect(capture.collectionGets).toBeGreaterThan(0);
  expect(capture.legacyMineGets).toBe(0);
});

test('refreshes the discount-code list after creating a free event coupon', async ({ page }) => {
  await authenticateAdmin(page);
  const capture = await stubDiscountApi(page, []);
  await page.goto('/my-discount-codes');

  await page.getByRole('button', { name: 'New Code', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Discount Code' });
  await dialog.getByRole('button', { name: 'Event coupon', exact: true }).click();
  await dialog.getByLabel('Code', { exact: true }).fill('CHURCHFREEEVENT');
  await dialog.getByLabel('Name', { exact: true }).fill('Free Nonprofit Church Event');
  await dialog
    .getByLabel('Description (optional)', { exact: true })
    .fill('One free event placement for a nonprofit church.');
  await dialog.getByLabel('Discount value', { exact: true }).fill('100');
  await dialog.getByLabel('Max uses (optional)', { exact: true }).fill('1');
  await dialog.getByRole('button', { name: 'Create code', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('CHURCHFREEEVENT', { exact: true })).toBeVisible();
  expect(capture.createPayload).toEqual({
    code: 'CHURCHFREEEVENT',
    name: 'Free Nonprofit Church Event',
    description: 'One free event placement for a nonprofit church.',
    discount_type: 'percentage',
    discount_value: 100,
    expiry_date: null,
    max_uses: 1,
    coupon_type: 'event',
  });
  expect(capture.collectionGets).toBeGreaterThanOrEqual(2);
  expect(capture.legacyMineGets).toBe(0);
});
