import { expect, test, type Locator, type Page } from '@playwright/test';

const portraitListingTitle = 'Portrait desk lamp';
const videoListingTitle = 'Promo reel listing';

const portraitListingImage =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="500"%3E%3Crect width="300" height="500" fill="teal"/%3E%3C/svg%3E';
const portraitListingImageTwo =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="350"%3E%3Crect width="200" height="350" fill="tomato"/%3E%3C/svg%3E';
const videoPosterImage =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="360"%3E%3Crect width="640" height="360" fill="gold"/%3E%3C/svg%3E';

const listingCardsFixture = [
  {
    id: 'listing-portrait',
    title: portraitListingTitle,
    description: 'A portrait-style example image for fit regression coverage.',
    type: 'offer',
    category: 'materials',
    shop: {
      id: 'shop-1',
      name: 'Demo Workshop',
      business_type: 'artisan_shop',
    },
    posted_by: null,
    images: [
      { url: portraitListingImage },
      { url: portraitListingImageTwo },
    ],
    status: 'active',
    is_free: false,
    urgency: 'normal',
    interest_count: 0,
    created_at: '2099-01-02 12:00:00',
  },
  {
    id: 'listing-video',
    title: videoListingTitle,
    description: 'A video poster listing for poster-mode assertions.',
    type: 'request',
    category: 'equipment',
    shop: {
      id: 'shop-2',
      name: 'Demo Depot',
      business_type: 'tool_rental',
    },
    posted_by: null,
    images: [
      {
        url: '/uploads/example-video.mp4',
        thumbnail_url: videoPosterImage,
      },
    ],
    status: 'active',
    is_free: true,
    urgency: 'normal',
    interest_count: 0,
    created_at: '2099-01-02 12:00:00',
  },
];

async function stubBrowseApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const requestUrl = new URL(route.request().url());

    if (requestUrl.pathname === '/api/v1/tenant/current') {
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

    if (requestUrl.pathname === '/api/v1/listings') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: listingCardsFixture,
          has_more: false,
        }),
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

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });
}

function cardByTitle(page: Page, title: string): Locator {
  return page.locator('div.cursor-pointer').filter({ has: page.getByRole('heading', { name: title }) }).first();
}

async function expect16By9(mediaWrapper: Locator) {
  const frame = await mediaWrapper.boundingBox();
  expect(frame).not.toBeNull();
  expect(frame!.width / frame!.height).toBeGreaterThan(16 / 9 - 0.02);
  expect(frame!.width / frame!.height).toBeLessThan(16 / 9 + 0.02);
}

test('browse listing cards keep 16:9 media framing and fit styling on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await stubBrowseApi(page);
  await page.goto('/browse');

  const portraitCard = cardByTitle(page, portraitListingTitle);
  const mediaWrapper = portraitCard.locator('[class*="aspect-[16/9]"]');
  await expect16By9(mediaWrapper);

  const portraitImage = portraitCard.getByRole('img', { name: portraitListingTitle });
  await expect(portraitImage).toHaveCSS('object-fit', 'contain');
  await portraitCard.hover();
  const portraitTransform = await portraitImage.evaluate((el) => getComputedStyle(el).transform);
  expect(portraitTransform).toBe('none');
  await expect(portraitCard.getByText('+1')).toBeVisible();
});

test('browse listing cards keep 16:9 media framing and fit styling on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubBrowseApi(page);
  await page.goto('/browse');

  const portraitCard = cardByTitle(page, portraitListingTitle);
  const mediaWrapper = portraitCard.locator('[class*="aspect-[16/9]"]');
  await expect16By9(mediaWrapper);

  const portraitImage = portraitCard.getByRole('img', { name: portraitListingTitle });
  await expect(portraitImage).toHaveCSS('object-fit', 'contain');
});

test('video listing posters stay object-cover with play overlay', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await stubBrowseApi(page);
  await page.goto('/browse');

  const videoCard = cardByTitle(page, videoListingTitle);
  const videoImage = videoCard.getByRole('img', { name: videoListingTitle });
  await expect(videoImage).toHaveCSS('object-fit', 'cover');
  await expect(videoCard.locator('[class*="aspect-[16/9]"] .rounded-full').first()).toBeVisible();
});
