import { expect, test, type Locator, type Page } from '@playwright/test';

const BUY_SELL_RENT = 'Buy, Sell, and Rent';
const FREE_TRADE_BORROW = 'Free, Trade, and Borrow';
const MATERIALS_GUIDANCE = 'Retail products and surplus goods available to buy, sell, or rent.';
const EQUIPMENT_GUIDANCE = 'Tools and equipment offered free, for trade, or to borrow.';

const tenantFixture = {
  slug: 'westmoreland',
  display_name: 'The Bend — Westmoreland',
  tagline: 'Find opportunity within your neighborhood',
  primary_color: 'hsl(160,25%,24%)',
  footer_text: 'Preserving community, one connection at a time',
};

const browseListingsFixture = [
  {
    id: 'listing-materials',
    shop: {
      id: 'shop-101',
      name: 'Westmoreland Bakery',
      business_type: 'bakeries',
    },
    posted_by: null,
    type: 'offer',
    category: 'materials',
    title: 'Surplus flour and sugar',
    description: 'Shortfall prevention ingredients for bakeries and kitchens.',
    is_free: false,
    urgency: 'normal',
    status: 'active',
    interest_count: 3,
    images: [{ url: '/images/surface.png' }],
    created_at: '2099-01-02 09:00:00',
  },
  {
    id: 'listing-equipment',
    shop: {
      id: 'shop-102',
      name: 'Corner Hardware',
      business_type: 'retail',
    },
    posted_by: null,
    type: 'request',
    category: 'equipment',
    title: 'Borrow a dough mixer',
    description: 'Need a stand mixer for one day while we host a pop-up.',
    is_free: false,
    urgency: 'normal',
    status: 'active',
    interest_count: 1,
    images: [{ url: '/images/mixer.png' }],
    created_at: '2099-01-03 08:00:00',
  },
];

const listingDetailFixture = {
  id: 'listing-materials',
  shop: null,
  posted_by: {
    id: 'member-1',
    name: 'Morgan',
    avatar_url: null,
  },
  type: 'offer',
  category: 'materials',
  title: 'Surplus flour and sugar',
  description: 'Bulk surplus for community kitchens.',
  quantity: '15',
  unit: 'lbs',
  expiry_date: '2099-01-10 12:00:00',
  pricing_type: 'fixed',
  price: 18,
  is_free: false,
  urgency: 'normal',
  status: 'active',
  interest_count: 3,
  images: [{ url: '/images/surface.png' }],
  created_at: '2099-01-02 09:00:00',
  viewer_has_interest: false,
  viewer_has_saved: false,
  views_count: 24,
};

const tileFixture = {
  upcomingEvents: [
    {
      id: 'event-home',
      title: 'Saturday Market Open House',
      category: 'market',
      start_date: '2099-02-01 11:00:00',
      location: 'Community Hall',
    },
  ],
};

const MOBILE_VIEWPORT = { width: 390, height: 844 };

function isWithinViewport(box: { x: number; y: number; width: number; height: number }, viewportWidth: number, tolerance = 1) {
  return box.x >= -tolerance && box.x + box.width <= viewportWidth + tolerance;
}

async function assertNoHorizontalOverflow(page: Page, viewportWidth = MOBILE_VIEWPORT.width) {
  const overflow = await page.evaluate((expectedWidth: number) => {
    return {
      docWidth: Math.ceil(document.documentElement.scrollWidth),
      bodyWidth: Math.ceil(document.body.scrollWidth),
      expectedWidth,
      windowWidth: Math.ceil(window.innerWidth),
    };
  }, viewportWidth);

  expect(overflow.windowWidth).toBeLessThanOrEqual(overflow.expectedWidth);
  expect(overflow.docWidth).toBeLessThanOrEqual(overflow.expectedWidth);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.expectedWidth);
}

async function assertLocatorInViewport(locator: Locator, viewportWidth = MOBILE_VIEWPORT.width) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(isWithinViewport(box as { x: number; y: number; width: number; height: number }, viewportWidth)).toBe(true);
}

const fixedPricingMode = (page: Page) => page.getByRole('button', { name: /Fixed/ });

async function stubMarketplaceCategoryEndpoints(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const requestUrl = new URL(route.request().url());

    if (requestUrl.pathname === '/api/v1/tenant/current') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(tenantFixture),
      });
      return;
    }

    if (requestUrl.pathname === '/api/v1/events/upcoming') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: tileFixture.upcomingEvents }),
      });
      return;
    }

    if (requestUrl.pathname === '/api/v1/listings') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: browseListingsFixture,
          has_more: false,
        }),
      });
      return;
    }

    if (requestUrl.pathname === '/api/v1/listings/listing-materials') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(listingDetailFixture),
      });
      return;
    }

    if (requestUrl.pathname === '/api/v1/sponsors') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    if (requestUrl.pathname === '/api/v1/stats') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          active_shops: 4,
          active_listings: 14,
          items_shared: 48,
        }),
      });
      return;
    }

    if (requestUrl.pathname === '/api/v1/stories') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    if (requestUrl.pathname === '/api/v1/volunteers' || requestUrl.pathname === '/api/v1/talent') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });
}

function seedAuth(page: Page) {
  return page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('refresh_token', 'test-refresh');
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'user-1',
        name: 'Jordan Doe',
        email: 'jordan@example.com',
        role: 'individual',
      }),
    );
  });
}

async function tileFitsText(tileLabel: string, page: Page) {
  const tile = page.getByTestId('mobile-service-grid').getByRole('link', { name: tileLabel, exact: true });
  const result = await tile.evaluate((element) => {
    const tileRect = element.getBoundingClientRect();
    const labels = Array.from(element.querySelectorAll('span'));
    return labels.every((labelEl) => {
      const labelRect = labelEl.getBoundingClientRect();
      return (
        labelRect.left >= tileRect.left - 1 &&
        labelRect.right <= tileRect.right + 1 &&
        labelRect.top >= tileRect.top - 1 &&
        labelRect.bottom <= tileRect.bottom + 1
      );
    });
  });
  expect(result).toBe(true);
}

test('homepage shows updated category labels and keeps long mobile tile labels inside square tiles', async ({ page }) => {
  await stubMarketplaceCategoryEndpoints(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const desktopServiceGrid = page.getByTestId('desktop-service-grid');
  await expect(desktopServiceGrid).toBeVisible();
  await expect(desktopServiceGrid.getByText(BUY_SELL_RENT, { exact: true })).toBeVisible();
  await expect(desktopServiceGrid.getByText(FREE_TRADE_BORROW, { exact: true })).toBeVisible();
  await expect(desktopServiceGrid.getByText('Materials', { exact: true })).toHaveCount(0);
  await expect(desktopServiceGrid.getByText('Equipment', { exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const mobileGrid = page.getByTestId('mobile-service-grid');
  await expect(mobileGrid).toBeVisible();

  const mobileGridBox = await mobileGrid.boundingBox();
  expect(mobileGridBox).not.toBeNull();
  expect(mobileGridBox!.width).toBeCloseTo(mobileGridBox!.height, 1);

  await expect(mobileGrid.getByRole('link', { name: BUY_SELL_RENT, exact: true })).toBeVisible();
  await expect(mobileGrid.getByRole('link', { name: FREE_TRADE_BORROW, exact: true })).toBeVisible();
  await expect(mobileGrid.getByRole('link', { name: 'Materials', exact: true })).toHaveCount(0);
  await expect(mobileGrid.getByRole('link', { name: 'Equipment', exact: true })).toHaveCount(0);

  await tileFitsText(BUY_SELL_RENT, page);
  await tileFitsText(FREE_TRADE_BORROW, page);
});

function cardByTitle(page: Page, title: string) {
  return page.locator('div.cursor-pointer').filter({ has: page.getByRole('heading', { name: title }) }).first();
}

test('browse tabs and listing cards show new marketplace wording', async ({ page }) => {
  await stubMarketplaceCategoryEndpoints(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/browse');

  await expect(page.getByRole('button', { name: BUY_SELL_RENT, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: FREE_TRADE_BORROW, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Materials', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Equipment', exact: true })).toHaveCount(0);

  const materialsCard = cardByTitle(page, 'Surplus flour and sugar');
  const equipmentCard = cardByTitle(page, 'Borrow a dough mixer');
  await expect(materialsCard).toBeVisible();
  await expect(equipmentCard).toBeVisible();

  await expect(materialsCard.getByText(BUY_SELL_RENT, { exact: true })).toBeVisible();
  await expect(equipmentCard.getByText(FREE_TRADE_BORROW, { exact: true })).toBeVisible();
});

test('listing detail and create-listing paths expose the new category labels', async ({ page }) => {
  await stubMarketplaceCategoryEndpoints(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/listing/listing-materials');

  await expect(page.getByRole('heading', { name: listingDetailFixture.title, exact: true })).toBeVisible();
  await expect(page.getByText(BUY_SELL_RENT, { exact: true })).toBeVisible();
  await expect(page.getByText('Materials', { exact: true })).toHaveCount(0);

  await seedAuth(page);

  await page.goto('/create?category=materials');
  await page.getByRole('combobox').first().click();
  await page
    .getByRole('listbox')
    .getByRole('option', { name: BUY_SELL_RENT, exact: true })
    .click();
  await expect(page.getByText(MATERIALS_GUIDANCE, { exact: true })).toBeVisible();
  await fixedPricingMode(page).click();
  await expect(page.getByText(MATERIALS_GUIDANCE, { exact: true })).toBeVisible();

  await page.getByRole('combobox').first().click();
  await page
    .getByRole('listbox')
    .getByRole('option', { name: FREE_TRADE_BORROW, exact: true })
    .click();
  await expect(page.getByText(EQUIPMENT_GUIDANCE, { exact: true })).toBeVisible();
  await fixedPricingMode(page).click();
  await expect(page.getByText(EQUIPMENT_GUIDANCE, { exact: true })).toBeVisible();
});

test('about, footer links, and settings notifications use the updated category words', async ({ page }) => {
  await stubMarketplaceCategoryEndpoints(page);
  await seedAuth(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/about');

  await expect(page.getByText(BUY_SELL_RENT, { exact: true })).toBeVisible();
  await expect(page.getByText(FREE_TRADE_BORROW, { exact: true })).toBeVisible();

  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: `Browse ${BUY_SELL_RENT}`, exact: true })).toBeVisible();
  await expect(footer.getByRole('link', { name: `Browse ${FREE_TRADE_BORROW}`, exact: true })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Browse Gigs', exact: true })).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Category Alerts', exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: BUY_SELL_RENT, exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: FREE_TRADE_BORROW, exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Materials', exact: true })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Equipment', exact: true })).toHaveCount(0);
});

test('mobile 390px seam audit keeps category labels visible inside viewport', async ({ page }) => {
  await stubMarketplaceCategoryEndpoints(page);
  await seedAuth(page);
  await page.setViewportSize(MOBILE_VIEWPORT);

  await page.goto('/browse');
  await expect(page.getByRole('button', { name: BUY_SELL_RENT, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: FREE_TRADE_BORROW, exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertLocatorInViewport(page.getByText(BUY_SELL_RENT, { exact: true }).first(), MOBILE_VIEWPORT.width);
  await assertLocatorInViewport(page.getByText(FREE_TRADE_BORROW, { exact: true }).first(), MOBILE_VIEWPORT.width);

  const materialsCard = cardByTitle(page, 'Surplus flour and sugar');
  const equipmentCard = cardByTitle(page, 'Borrow a dough mixer');
  await expect(materialsCard).toBeVisible();
  await expect(equipmentCard).toBeVisible();
  await expect(materialsCard.getByText(BUY_SELL_RENT, { exact: true })).toBeVisible();
  await expect(equipmentCard.getByText(FREE_TRADE_BORROW, { exact: true })).toBeVisible();

  await page.goto('/listing/listing-materials');
  await expect(page.getByRole('heading', { name: listingDetailFixture.title, exact: true })).toBeVisible();
  await assertLocatorInViewport(page.getByRole('heading', { name: listingDetailFixture.title, exact: true }), MOBILE_VIEWPORT.width);
  await expect(page.getByText(BUY_SELL_RENT, { exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertLocatorInViewport(page.getByText(BUY_SELL_RENT, { exact: true }), MOBILE_VIEWPORT.width);

  await page.goto('/create?category=materials');
  const categoryTrigger = page.getByRole('combobox').first();
  await categoryTrigger.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox.getByRole('option', { name: BUY_SELL_RENT, exact: true })).toBeVisible();
  await listbox.getByRole('option', { name: BUY_SELL_RENT, exact: true }).click();
  await expect(page.getByText(MATERIALS_GUIDANCE, { exact: true })).toBeVisible();
  await fixedPricingMode(page).click();
  await expect(page.getByText(MATERIALS_GUIDANCE, { exact: true })).toBeVisible();
  await assertLocatorInViewport(page.getByText(MATERIALS_GUIDANCE, { exact: true }), MOBILE_VIEWPORT.width);
  await expect(categoryTrigger).toContainText(BUY_SELL_RENT);
  await assertLocatorInViewport(categoryTrigger, MOBILE_VIEWPORT.width);

  await categoryTrigger.click();
  await listbox.getByRole('option', { name: FREE_TRADE_BORROW, exact: true }).click();
  await expect(page.getByText(EQUIPMENT_GUIDANCE, { exact: true })).toBeVisible();
  await fixedPricingMode(page).click();
  await expect(page.getByText(EQUIPMENT_GUIDANCE, { exact: true })).toBeVisible();
  await assertLocatorInViewport(page.getByText(EQUIPMENT_GUIDANCE, { exact: true }), MOBILE_VIEWPORT.width);
  await expect(categoryTrigger).toContainText(FREE_TRADE_BORROW);
  await assertLocatorInViewport(categoryTrigger, MOBILE_VIEWPORT.width);
  await assertNoHorizontalOverflow(page);

  await page.goto('/about');
  await expect(page.getByText(BUY_SELL_RENT, { exact: true })).toBeVisible();
  await expect(page.getByText(FREE_TRADE_BORROW, { exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);

  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: `Browse ${BUY_SELL_RENT}`, exact: true })).toBeVisible();
  await expect(footer.getByRole('link', { name: `Browse ${FREE_TRADE_BORROW}`, exact: true })).toBeVisible();
  await assertLocatorInViewport(footer.getByRole('link', { name: `Browse ${BUY_SELL_RENT}`, exact: true }), MOBILE_VIEWPORT.width);
  await assertLocatorInViewport(footer.getByRole('link', { name: `Browse ${FREE_TRADE_BORROW}`, exact: true }), MOBILE_VIEWPORT.width);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Category Alerts', exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: BUY_SELL_RENT, exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: FREE_TRADE_BORROW, exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertLocatorInViewport(page.getByRole('switch', { name: BUY_SELL_RENT, exact: true }), MOBILE_VIEWPORT.width);
  await assertLocatorInViewport(page.getByRole('switch', { name: FREE_TRADE_BORROW, exact: true }), MOBILE_VIEWPORT.width);
});
