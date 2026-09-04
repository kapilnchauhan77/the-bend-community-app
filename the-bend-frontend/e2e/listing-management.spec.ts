import { expect, test, type Page } from '@playwright/test';

type Persona = 'individual' | 'shop_admin' | 'community_admin' | 'super_admin' | 'other';

async function listingScenario(page: Page, persona: Persona, canManage = persona !== 'other') {
  const business = persona !== 'individual';
  const owner = persona === 'individual' || persona === 'shop_admin';
  const user = { id: owner ? 'owner-1' : 'viewer-1', name: 'Test User', email: 'test@example.com', role: persona === 'other' ? 'individual' : persona };
  const shop = { id: 'shop-1', name: 'Test Business', business_type: 'retail', status: 'active' };
  await page.addInitScript(({ user, ownShop }) => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('user', JSON.stringify(user));
    if (ownShop) localStorage.setItem('shop', JSON.stringify(ownShop));
    else localStorage.removeItem('shop');
  }, { user, ownShop: persona === 'shop_admin' ? shop : null });
  const listing = {
    id: 'listing-1', title: 'Community garden supplies', description: 'Spare supplies available for our community garden.',
    type: 'offer', category: 'materials', urgency: 'urgent', status: 'active',
    pricing_type: 'free', is_free: true, images: [], interest_count: 0,
    created_at: '2026-09-01T10:00:00Z', shop: business ? shop : null,
    posted_by: { id: 'owner-1', name: 'Original Owner' },
    viewer_has_interest: false, viewer_has_saved: false, views_count: 1,
    viewer_can_manage: canManage, viewer_can_fulfill: owner,
  };
  const state = { updates: [] as Record<string, unknown>[], deleteAttempts: 0, deleted: false, failDelete: false };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let body: unknown = { items: [] };
    if (path.endsWith('/tenant/current')) body = { slug: 'westmoreland', display_name: 'The Bend Westmoreland' };
    else if (path.endsWith('/listings/listing-1')) {
      if (method === 'PUT') {
        const update = route.request().postDataJSON();
        state.updates.push(update);
        Object.assign(listing, update);
        body = { id: listing.id, status: 'updated' };
      } else if (method === 'DELETE') {
        state.deleteAttempts++;
        if (state.failDelete) {
          await route.fulfill({ status: 500, json: { detail: 'Unable to delete listing' } });
          return;
        }
        state.deleted = true;
        body = { status: 'deleted' };
      } else body = listing;
    } else if (path.endsWith('/listings/mine') || path.endsWith('/shops/shop-1/listings')) {
      body = { items: state.deleted ? [] : [listing], next_cursor: null, has_more: false };
    } else if (path.endsWith('/admin/listings')) {
      body = { items: [{ ...listing, shop_name: shop.name }], next_cursor: null, has_more: false };
    }
    await route.fulfill({ json: body });
  });
  return state;
}

for (const width of [390, 1280]) {
  test.describe(`${width}px listing management`, () => {
    test.beforeEach(async ({ page }) => page.setViewportSize({ width, height: 844 }));

    for (const persona of ['individual', 'shop_admin', 'community_admin', 'super_admin'] as const) {
      test(`${persona} can change urgent to normal and reload it`, async ({ page }, testInfo) => {
        const state = await listingScenario(page, persona);
        if (persona === 'individual' || persona === 'shop_admin') {
          await page.goto('/my-listings');
          await expect(page.getByRole('link', { name: /^Edit/ })).toBeVisible();
          if (persona === 'individual') await page.screenshot({ path: testInfo.outputPath('my-listings.png'), fullPage: true });
          await page.getByRole('link', { name: /^Edit/ }).click();
        } else {
          await page.goto('/admin/listings');
          await page.getByRole('link', { name: /^Edit/ }).filter({ visible: true }).click();
        }
        await expect(page.getByRole('heading', { name: 'Edit Listing' })).toBeVisible();
        if (persona === 'community_admin') await page.screenshot({ path: testInfo.outputPath('admin-edit.png'), fullPage: true });
        await page.getByRole('button', { name: 'Normal No rush', exact: true }).click();
        await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
        await expect(page).toHaveURL(/\/listing\/listing-1$/);
        await expect(page.getByText('Normal Priority', { exact: true })).toBeVisible();
        await page.reload();
        await expect(page.getByText('Normal Priority', { exact: true })).toBeVisible();
        expect(state.updates).toHaveLength(1);
        expect(state.updates[0].urgency).toBe('normal');
        expect(state.updates[0]).not.toHaveProperty('shop_id');
        expect(state.updates[0]).not.toHaveProperty('posted_by_user_id');
      });
    }

    test('individual deletion requires confirmation and removes the card', async ({ page }) => {
      const state = await listingScenario(page, 'individual');
      await page.goto('/my-listings');
      await page.getByRole('button', { name: /^Delete/ }).click();
      const confirmation = page.getByRole('alertdialog');
      await expect(confirmation).toBeVisible();
      expect(state.deleteAttempts).toBe(0);
      await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(state.deleteAttempts).toBe(0);
      await page.getByRole('button', { name: /^Delete/ }).click();
      await confirmation.getByRole('button', { name: /^(Yes, )?Delete$/ }).click();
      await expect(page.getByText('No listings yet', { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText('No listings yet', { exact: true })).toBeVisible();
      expect(state.deleteAttempts).toBe(1);
    });

    test('admin can delete on behalf without seeing owner-only fulfillment', async ({ page }) => {
      const state = await listingScenario(page, 'community_admin');
      await page.goto('/listing/listing-1');
      await expect(page.getByRole('button', { name: 'Edit Listing', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mark as Fulfilled', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Yes, Delete', exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/listings$/);
      expect(state.deleted).toBe(true);
    });
  });
}

test('failed deletion retains the listing and displays a retryable error', async ({ page }) => {
  const state = await listingScenario(page, 'individual');
  state.failDelete = true;
  await page.goto('/my-listings');
  await page.getByRole('button', { name: /^Delete/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /^(Yes, )?Delete$/ }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Community garden supplies' })).toBeVisible();
  expect(state.deleted).toBe(false);
});

test('an unrelated edit preserves urgent priority', async ({ page }) => {
  const state = await listingScenario(page, 'individual');
  await page.goto('/listing/listing-1/edit');
  await page.getByLabel('Title', { exact: false }).fill('Updated community garden supplies');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page).toHaveURL(/\/listing\/listing-1$/);
  await expect(page.getByText('Urgent Priority', { exact: true })).toBeVisible();
  expect(state.updates[0].urgency).toBe('urgent');
});

test('failed detail deletion keeps the detail and allows retry', async ({ page }) => {
  const state = await listingScenario(page, 'community_admin');
  state.failDelete = true;
  await page.goto('/listing/listing-1');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Yes, Delete', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Community garden supplies' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
  state.failDelete = false;
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Yes, Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/listings$/);
  expect(state.deleteAttempts).toBe(2);
});

for (const persona of ['other', 'community_admin'] as const) {
  test(`${persona} with denied capabilities cannot access edit or delete`, async ({ page }) => {
    const state = await listingScenario(page, persona, false);
    await page.goto('/listing/listing-1');
    await expect(page.getByRole('heading', { name: 'Community garden supplies' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Listing', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await page.goto('/listing/listing-1/edit');
    await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toHaveCount(0);
    expect(state.updates).toHaveLength(0);
  });
}
