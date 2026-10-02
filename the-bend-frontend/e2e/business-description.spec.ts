import { expect, test, type Page } from '@playwright/test';

const INITIAL_DESCRIPTION =
  'A neighbor-run pantry helping Westmoreland families find clothing and household essentials.';
const UPDATED_DESCRIPTION =
  'We help Westmoreland families find affordable clothing, school supplies, and household essentials.\n\nEvery purchase supports our seasonal community drives.';
const captureArtifacts = process.env.PLAYWRIGHT_CAPTURE_ARTIFACTS === '1';

async function demoPause(page: Page, milliseconds = 900) {
  if (captureArtifacts) await page.waitForTimeout(milliseconds);
}

type JsonPayload = Record<string, unknown>;

const baseShop = {
  id: 'shop-1',
  name: 'Oak Grove Community Closet',
  business_type: 'retail',
  description: INITIAL_DESCRIPTION,
  address: '123 Main Street, Montross, VA',
  latitude: null,
  longitude: null,
  contact_phone: '+1 804 555 0100',
  whatsapp: '',
  status: 'active',
  active_listings_count: 0,
  total_fulfilled: 0,
  endorsement_count: 0,
  viewer_has_endorsed: false,
  member_since: '2026-01-15T00:00:00Z',
  avatar_url: null,
};

async function stubTenant(page: Page) {
  await page.route('**/api/v1/tenant/current', async (route) => {
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
  });
}

async function authenticateBusinessOwner(page: Page) {
  await page.addInitScript((shop) => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('refresh_token', 'test-refresh-token');
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'owner-1',
        name: 'Olivia Owner',
        email: 'owner@example.com',
        role: 'shop_admin',
        shop_id: shop.id,
      }),
    );
    localStorage.setItem('shop', JSON.stringify(shop));
  }, baseShop);
}

test('business registration submits a multiline About your business description', async ({ page }) => {
  let registrationPayload: JsonPayload | undefined;
  await stubTenant(page);
  await page.route('**/api/v1/auth/register', async (route) => {
    registrationPayload = route.request().postDataJSON() as JsonPayload;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Registration submitted for review', shop_id: 'shop-1' }),
    });
  });

  await page.goto('/register');

  const description = page.getByLabel('About your business');
  await expect(description).toBeVisible();
  await expect(description).toHaveAttribute('maxlength', '1000');
  await expect(page.getByText('0/1,000 characters')).toBeVisible();

  await page.getByLabel('Business Name *').fill(baseShop.name);
  await page.getByLabel('Business Type *').click();
  await page.getByRole('option', { name: 'Retail', exact: true }).click();
  const maximumDescription = 'A'.repeat(1000);
  await description.fill(maximumDescription);
  await expect(page.getByText('1,000/1,000 characters')).toBeVisible();
  await description.pressSequentially('B');
  await expect(description).toHaveValue(maximumDescription);
  await description.fill(UPDATED_DESCRIPTION);
  await expect(page.getByText(`${UPDATED_DESCRIPTION.length}/1,000 characters`)).toBeVisible();
  if (captureArtifacts) {
    await description.scrollIntoViewIfNeeded();
    await demoPause(page);
    await page.screenshot({
      path: 'output/playwright/business-description-registration-desktop.png',
      fullPage: false,
    });
  }
  await page.getByLabel('Your Name *').fill('Olivia Owner');
  await page.getByLabel('Email Address *').fill('owner@example.com');
  await page.getByLabel('Password *', { exact: true }).fill('Community123');
  await page.getByLabel('Confirm Password *').fill('Community123');
  await page.getByLabel(/I have read and agree/).check();
  await page.getByRole('button', { name: 'Register business', exact: true }).click();

  await expect.poll(() => registrationPayload?.description).toBe(UPDATED_DESCRIPTION);
  await expect(page.getByRole('heading', { name: 'Thank You!' })).toBeVisible();
});

test('owner can edit a long description on mobile and the public profile shows every paragraph', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticateBusinessOwner(page);
  await stubTenant(page);

  let currentDescription = INITIAL_DESCRIPTION;
  let updatePayload: JsonPayload | undefined;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname.endsWith('/tenant/current')) {
      await route.fallback();
      return;
    }

    if (url.pathname.endsWith('/shops/shop-1') && method === 'PUT') {
      updatePayload = request.postDataJSON() as JsonPayload;
      currentDescription = String(updatePayload.description ?? '');
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...baseShop, description: currentDescription }),
      });
      return;
    }

    if (url.pathname.endsWith('/shops/shop-1') && method === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...baseShop, description: currentDescription }),
      });
      return;
    }

    if (url.pathname.endsWith('/shops/shop-1/endorsement-map')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ center: { ...baseShop, description: currentDescription }, endorsers: [] }),
      });
      return;
    }

    if (url.pathname.endsWith('/shops/shop-1/listings')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      return;
    }

    if (url.pathname.endsWith('/shops/shop-1/endorsements')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: [], count: 0 }),
      });
      return;
    }

    if (url.pathname.includes('/discount-codes')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }

    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });

  await page.goto('/settings#business');

  const description = page.getByLabel('About your business');
  await expect(description).toHaveValue(INITIAL_DESCRIPTION);
  await expect(description).toHaveAttribute('maxlength', '1000');
  await demoPause(page);
  await description.fill(UPDATED_DESCRIPTION);
  await expect(page.getByText(`${UPDATED_DESCRIPTION.length}/1,000 characters`)).toBeVisible();
  await demoPause(page);
  if (captureArtifacts) {
    await page.screenshot({
      path: 'output/playwright/business-description-settings-mobile.png',
      fullPage: false,
    });
  }

  const descriptionBox = await description.boundingBox();
  expect(descriptionBox).not.toBeNull();
  expect(descriptionBox!.width).toBeLessThanOrEqual(358);
  expect(descriptionBox!.height).toBeGreaterThanOrEqual(120);

  await page.locator('#business').getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect.poll(() => updatePayload?.description).toBe(UPDATED_DESCRIPTION);
  await expect(page.getByText('Saved!', { exact: true })).toBeVisible();
  await demoPause(page);

  await page.goto('/business/shop-1');
  const aboutSection = page.getByRole('region', { name: `About ${baseShop.name}` });
  await expect(aboutSection).toBeVisible();
  await aboutSection.scrollIntoViewIfNeeded();
  await expect(aboutSection).toContainText('We help Westmoreland families find affordable clothing');
  await expect(aboutSection).toContainText('Every purchase supports our seasonal community drives.');
  await expect(aboutSection.locator('p')).toHaveCSS('white-space', 'pre-wrap');
  if (captureArtifacts) {
    await page.evaluate(() => window.scrollBy({ top: 150, behavior: 'instant' }));
  }
  await demoPause(page, 1400);
  if (captureArtifacts) {
    await page.screenshot({
      path: 'output/playwright/business-description-profile-mobile.png',
      fullPage: false,
    });
  }
});

test('owner can clear an existing business description', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticateBusinessOwner(page);
  await stubTenant(page);

  let updatePayload: JsonPayload | undefined;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('/tenant/current')) {
      await route.fallback();
      return;
    }

    if (url.pathname.endsWith('/shops/shop-1') && request.method() === 'PUT') {
      updatePayload = request.postDataJSON() as JsonPayload;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...baseShop, description: null }),
      });
      return;
    }

    if (url.pathname.endsWith('/shops/shop-1')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...baseShop, description: updatePayload ? null : INITIAL_DESCRIPTION }),
      });
      return;
    }

    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });

  await page.goto('/settings#business');
  const description = page.getByLabel('About your business');
  await expect(description).toHaveValue(INITIAL_DESCRIPTION);
  await description.clear();
  await page.locator('#business').getByRole('button', { name: 'Save Changes', exact: true }).click();

  await expect.poll(() => updatePayload?.description).toBe(null);
  await expect(description).toHaveValue('');
});

test('public business description is readable on desktop and legacy empty profiles stay clean', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await stubTenant(page);

  let currentDescription: string | null = UPDATED_DESCRIPTION;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith('/tenant/current')) {
      await route.fallback();
      return;
    }

    if (url.pathname.endsWith('/shops/shop-1')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...baseShop, description: currentDescription }),
      });
      return;
    }

    if (url.pathname.endsWith('/shops/shop-1/endorsement-map')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ center: baseShop, endorsers: [] }),
      });
      return;
    }

    if (url.pathname.endsWith('/shops/shop-1/endorsements')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: [], count: 0 }),
      });
      return;
    }

    if (url.pathname.endsWith('/shops/shop-1/listings')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      return;
    }

    if (url.pathname.includes('/discount-codes')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }

    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });

  await page.goto('/business/shop-1');

  const aboutSection = page.getByRole('region', { name: `About ${baseShop.name}` });
  await expect(aboutSection).toBeVisible();
  await expect(aboutSection.locator('p')).toHaveCSS('white-space', 'pre-wrap');
  const proseBox = await aboutSection.locator('p').boundingBox();
  expect(proseBox).not.toBeNull();
  expect(proseBox!.width).toBeLessThan(760);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  if (captureArtifacts) {
    await page.screenshot({
      path: 'output/playwright/business-description-profile-desktop.png',
      fullPage: false,
    });
  }

  currentDescription = null;
  await page.reload();
  await expect(page.getByRole('region', { name: `About ${baseShop.name}` })).toHaveCount(0);
});
