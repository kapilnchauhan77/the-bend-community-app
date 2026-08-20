import { expect, test } from '@playwright/test';

const author = { id: 'u1', name: 'Alex', avatar_url: null, shop_id: null, shop_name: null };
const base = { id: 'p1', author, media_url: null, media_thumbnail_url: null, media_type: null, like_count: 0, comment_count: 0, viewer_has_liked: false, created_at: '2026-08-20T10:00:00Z' };

async function stubFeed(page: import('@playwright/test').Page, post: Record<string, unknown>) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/v1/bender/posts') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [post], next_cursor: null, has_more: false }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: null, has_more: false }) });
  });
  await page.goto('/bender');
}

test('published preview omits only its source and renders a safe card', async ({ page }) => {
  await stubFeed(page, { ...base, caption: 'Before https://example.org/event. After https://other.example/x', link_preview: { source_url: 'https://example.org/event', url: 'https://example.org/canonical', title: 'Event title', description: 'Details', site_name: 'Example' , image_url: null } });
  await expect(page.getByText('Before')).toBeVisible();
  await expect(page.getByText('After')).toBeVisible();
  await expect(page.getByRole('link', { name: /Event title Example/ })).toHaveAttribute('href', 'https://example.org/canonical');
  await expect(page.getByRole('link', { name: 'other.example/x' })).toHaveAttribute('target', '_blank');
});

test('legacy posts retain caption and render no card', async ({ page }) => {
  await stubFeed(page, { ...base, caption: 'https://example.org/a and https://example.org/b', link_preview: null });
  await expect(page.getByRole('link', { name: 'example.org/a' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'example.org/b' })).toBeVisible();
  await expect(page.locator('[data-testid="bender-link-preview"]')).toHaveCount(0);
});

test('text-only card has no image wrapper', async ({ page }) => {
  await stubFeed(page, { ...base, caption: 'https://example.org', link_preview: { source_url: 'https://example.org', url: 'https://example.org', title: 'Title', description: 'Description', site_name: 'Site', image_url: null } });
  await expect(page.getByTestId('bender-link-preview')).toContainText('Title');
  await expect(page.getByTestId('bender-link-preview').locator('img')).toHaveCount(0);
});

test('only valid local preview image is requested', async ({ page }) => {
  let imageRequests = 0;
  page.on('request', (request) => { if (request.url().includes('/uploads/link-previews/')) imageRequests += 1; });
  await stubFeed(page, { ...base, caption: 'https://example.org', link_preview: { source_url: 'https://example.org', url: 'https://example.org', title: 'Title', image_url: '/uploads/link-previews/' + 'a'.repeat(64) + '.webp' } });
  await expect(page.getByTestId('bender-link-preview').locator('img')).toHaveAttribute('src', /uploads\/link-previews/);
  expect(imageRequests).toBeGreaterThan(0);
});

test('malformed destination and image render text only', async ({ page }) => {
  await stubFeed(page, { ...base, caption: 'https://example.org', link_preview: { source_url: 'https://example.org', url: 'javascript:alert(1)', title: 'Title', image_url: 'https://evil.example/x.webp' } });
  await expect(page.getByTestId('bender-link-preview')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'example.org' })).toBeVisible();
});

test('caption URL extraction follows shared fixture punctuation rules', async ({ page }) => {
  await stubFeed(page, { ...base, caption: 'Join (https://example.org/a_(b)).', link_preview: null });
  await expect(page.getByRole('link', { name: 'example.org/a_(b)' })).toHaveAttribute('href', 'https://example.org/a_(b)');
});
