import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type FixtureRow = { caption: string; urls: string[] };
const sharedFixtureRows = JSON.parse(
  readFileSync(new URL('../../test-fixtures/bender-link-url-cases.json', import.meta.url), 'utf8'),
) as FixtureRow[];
const author = { id: 'u1', name: 'Alex', avatar_url: null, shop_id: null, shop_name: null };
const comment = { id: 'c1', author, content: 'A comment', created_at: '2026-08-20T10:01:00Z' };
const base = {
  id: 'p1',
  author,
  media_url: null,
  media_thumbnail_url: null,
  media_type: null,
  like_count: 0,
  comment_count: 0,
  viewer_has_liked: false,
  created_at: '2026-08-20T10:00:00Z',
};

async function stubFeed(page: Page, post: Record<string, unknown>) {
  const paths: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('refresh_token', 'test-refresh');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'Alex', email: 'alex@example.org', role: 'individual' }));
  });
  await page.unroute('**/api/v1/**');
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    paths.push(`${request.method()} ${url.pathname}`);
    if (request.method() === 'GET' && url.pathname === '/api/v1/tenant/current') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/api/v1/bender/posts') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [post], next_cursor: null, has_more: false }) });
      return;
    }
    if (request.method() === 'GET' && /\/api\/v1\/bender\/posts\/[^/]+\/comments$/.test(url.pathname)) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [comment], next_cursor: null, has_more: false }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: null, has_more: false }) });
  });
  await page.goto('/bender');
  return paths;
}

function preview(overrides: Record<string, unknown> = {}) {
  return {
    source_url: 'https://example.org',
    url: 'https://example.org/canonical',
    title: 'Title',
    description: 'Description',
    site_name: 'Site',
    image_url: null,
    ...overrides,
  };
}

test('published preview omits only its source and renders a safe card', async ({ page }) => {
  await stubFeed(page, { ...base, caption: 'Before https://example.org/event. After https://other.example/x', link_preview: preview({ source_url: 'https://example.org/event', title: 'Event title', site_name: 'Example' }) });
  await expect(page.getByTestId('bender-caption')).toHaveText('AlexBefore. After https://other.example/x');
  await expect(page.getByRole('link', { name: 'https://other.example/x' })).toHaveAttribute('href', 'https://other.example/x');
  await expect(page.getByRole('link', { name: 'Event title, Example' })).toHaveAttribute('href', 'https://example.org/canonical');
});

test('legacy posts retain caption and render no card', async ({ page }) => {
  await stubFeed(page, { ...base, media_url: '/uploads/post.jpg', comment_count: 1, caption: 'https://example.org/a and https://example.org/b', link_preview: null });
  await expect(page.getByRole('link', { name: 'https://example.org/a' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'https://example.org/b' })).toBeVisible();
  await expect(page.locator('[data-testid="bender-link-preview"]')).toHaveCount(0);
  await expect(page.getByTestId('bender-comments-link')).toHaveCount(1);
  await page.getByRole('button', { name: 'View all 1 comment' }).click();
  const order = await page.locator('[data-testid="bender-post"] > *').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')).filter(Boolean));
  expect(order).toEqual(['bender-post-header', 'bender-media', 'bender-actions', 'bender-caption', 'bender-comments-drawer']);
});

test('text-only card has no image wrapper', async ({ page }) => {
  await stubFeed(page, { ...base, caption: 'https://example.org', link_preview: preview() });
  await expect(page.getByTestId('bender-link-preview')).toContainText('Title');
  await expect(page.getByTestId('bender-link-preview').locator('img')).toHaveCount(0);
});

test('only valid local preview image requests the API asset host', async ({ page }) => {
  const imageRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/uploads/link-previews/')) imageRequests.push(request.url());
  });
  await stubFeed(page, { ...base, caption: 'https://example.org', link_preview: preview({ image_url: `/uploads/link-previews/${'a'.repeat(64)}.webp` }) });
  await expect(page.getByTestId('bender-link-preview-image')).toHaveAttribute('src', /\/uploads\/link-previews\/a{64}\.webp$/);
  expect(imageRequests.some((url) => url.startsWith('http://localhost:8000/'))).toBe(true);
});

test('malformed canonical destination suppresses card and leaves source URL visible', async ({ page }) => {
  await stubFeed(page, { ...base, caption: 'https://example.org', link_preview: preview({ url: 'javascript:alert(1)' }) });
  await expect(page.getByTestId('bender-link-preview')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'https://example.org' })).toBeVisible();
});

test('invalid image values stay text-only and never request a remote image', async ({ page }) => {
  for (const image_url of [
    'https://cdn.example/image.webp',
    '//cdn.example/image.webp',
    '/uploads/link-previews/not-a-hash.webp',
    `/uploads/link-previews/${'A'.repeat(64)}.webp`,
    `/uploads/link-previews/${'a'.repeat(64)}.png`,
  ]) {
    const remoteRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('cdn.example') || request.url().includes('/uploads/link-previews/')) remoteRequests.push(request.url());
    });
    await stubFeed(page, { ...base, id: `p-${image_url}`, caption: 'https://example.org', link_preview: preview({ image_url }) });
    await expect(page.getByTestId('bender-link-preview')).toBeVisible();
    await expect(page.getByTestId('bender-link-preview').locator('img')).toHaveCount(0);
    expect(remoteRequests.filter((url) => !url.includes('localhost:8000')).length).toBe(0);
  }
});

test('shared fixture rows render exactly the accepted URLs', async ({ page }) => {
  for (const [index, row] of sharedFixtureRows.entries()) {
    await stubFeed(page, { ...base, id: `fixture-${index}`, caption: row.caption, link_preview: null });
    const links = await page.getByTestId('bender-caption').locator('a').evaluateAll((anchors) => anchors.map((anchor) => ({ text: anchor.textContent, href: anchor.getAttribute('href') })));
    expect(links).toEqual(row.urls.map((url) => ({ text: url, href: url })));
  }
});

test('mixed-case HTTP(S), queries, fragments, and multiple links preserve exact text', async ({ page }) => {
  const caption = 'HTTP://Example.ORG/a?q=Town#Results then https://second.example/x';
  await stubFeed(page, { ...base, caption, link_preview: null });
  await expect(page.getByRole('link', { name: 'HTTP://Example.ORG/a?q=Town#Results' })).toHaveAttribute('href', 'HTTP://Example.ORG/a?q=Town#Results');
  await expect(page.getByRole('link', { name: 'https://second.example/x' })).toHaveAttribute('href', 'https://second.example/x');
});

test('invalid HTTP-looking candidates remain text', async ({ page }) => {
  await stubFeed(page, { ...base, caption: 'Bad https:// and malformed https://example.org/%zz plus https://valid.example/x', link_preview: null });
  await expect(page.getByTestId('bender-caption').locator('a')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'https://valid.example/x' })).toBeVisible();
  await expect(page.getByTestId('bender-caption')).toContainText('Bad https:// and malformed https://example.org/%zz');
});

test('source omission handles same-line spaces, punctuation, and newlines', async ({ page }) => {
  await stubFeed(page, { ...base, caption: 'Join https://example.org today', link_preview: preview({ source_url: 'https://example.org' }) });
  await expect(page.getByTestId('bender-caption')).toHaveText('AlexJoin today');
  await stubFeed(page, { ...base, id: 'p2', caption: 'Before https://example.org. After', link_preview: preview({ source_url: 'https://example.org' }) });
  await expect(page.getByTestId('bender-caption')).toHaveText('AlexBefore. After');
  await stubFeed(page, { ...base, id: 'p3', caption: 'Before\nhttps://example.org\nAfter', link_preview: preview({ source_url: 'https://example.org' }) });
  await expect(page.getByTestId('bender-caption')).toHaveText('AlexBefore\nAfter');
  await stubFeed(page, { ...base, id: 'p4', caption: 'https://example.org today', link_preview: preview({ source_url: 'https://example.org' }) });
  await expect(page.getByTestId('bender-caption')).toHaveText('Alextoday');
  await stubFeed(page, { ...base, id: 'p5', caption: 'today https://example.org ', link_preview: preview({ source_url: 'https://example.org' }) });
  await expect(page.getByTestId('bender-caption')).toHaveText('Alextoday');
  await stubFeed(page, { ...base, id: 'p6', caption: 'https://example.org and https://example.org', link_preview: preview({ source_url: 'https://example.org' }) });
  await expect(page.getByRole('link', { name: 'https://example.org' })).toHaveCount(1);
  await stubFeed(page, { ...base, id: 'p7', caption: '\nhttps://example.org\nAfter', link_preview: preview({ source_url: 'https://example.org' }) });
  await expect(page.getByTestId('bender-caption')).toHaveText('AlexAfter');
  await stubFeed(page, { ...base, id: 'p8', caption: 'Before\nhttps://example.org\n', link_preview: preview({ source_url: 'https://example.org' }) });
  await expect(page.getByTestId('bender-caption')).toHaveText('AlexBefore');
  await stubFeed(page, { ...base, id: 'p9', caption: 'Before\n\nhttps://example.org\nAfter', link_preview: preview({ source_url: 'https://example.org' }) });
  await expect(page.getByTestId('bender-caption')).toHaveText('AlexBefore\n\nAfter');
});

test('valid preview order is caption, card, media, actions', async ({ page }) => {
  await stubFeed(page, { ...base, media_url: '/uploads/post.jpg', comment_count: 1, caption: 'Before https://example.org', link_preview: preview() });
  await expect(page.getByTestId('bender-comments-link')).toHaveCount(1);
  await page.getByRole('button', { name: 'View all 1 comment' }).click();
  const order = await page.locator('[data-testid="bender-post"] > *').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')).filter(Boolean));
  expect(order).toEqual(['bender-post-header', 'bender-caption', 'bender-preview-slot', 'bender-media', 'bender-actions', 'bender-comments-drawer']);
});

test('long metadata stays contained and image ratio is close to 1.91:1', async ({ page }) => {
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await stubFeed(page, { ...base, id: `wide-${width}`, caption: 'https://example.org', link_preview: preview({ title: 'T'.repeat(180), description: 'D'.repeat(300), site_name: 'S'.repeat(80), image_url: `/uploads/link-previews/${'b'.repeat(64)}.webp` }) });
    const metrics = await page.getByTestId('bender-link-preview').evaluate((card) => {
      const cardRect = card.getBoundingClientRect();
      const visibleChildren = [...card.querySelectorAll('*')].filter((child) => {
        const style = window.getComputedStyle(child);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      return {
        cardWidth: card.clientWidth,
        scrollWidth: card.scrollWidth,
        childrenInside: visibleChildren.every((child) => {
          const rect = child.getBoundingClientRect();
          return rect.left >= cardRect.left - 0.5 && rect.right <= cardRect.right + 0.5 && rect.top >= cardRect.top - 0.5 && rect.bottom <= cardRect.bottom + 0.5;
        }),
      };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.cardWidth);
    expect(metrics.childrenInside).toBe(true);
    const box = await page.getByTestId('bender-link-preview-image-wrapper').boundingBox();
    expect(box).not.toBeNull();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(1.91, 1);
  }
});

test('card is a single keyboard-focusable safe anchor and tenant route is explicit', async ({ page }) => {
  const paths = await stubFeed(page, { ...base, caption: 'https://example.org', link_preview: preview() });
  await expect(page.getByTestId('bender-link-preview')).toBeVisible();
  await expect.poll(() => paths.includes('GET /api/v1/tenant/current')).toBe(true);
  expect(paths).toContain('GET /api/v1/tenant/current');
  const card = page.getByTestId('bender-link-preview');
  await page.getByRole('button', { name: 'More' }).first().focus();
  await page.keyboard.press('Tab');
  await expect(card).toBeFocused();
  await expect(card.locator('a')).toHaveCount(0);
  await expect(card).toHaveAttribute('rel', 'noopener noreferrer');
});

test('composer loading and ready modes expose the approved markup and controls', async ({ page }) => {
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  const result = await page.evaluate(async () => {
    const ReactModule = await import('/node_modules/.vite/deps/react.js');
    const React = ReactModule.default ?? ReactModule;
    const ReactDOMModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const ReactDOM = ReactDOMModule.default ?? ReactDOMModule;
    const { BenderLinkPreviewCard } = await import('/src/components/features/bender/BenderLinkPreviewCard.tsx');
    const host = document.createElement('div');
    document.body.append(host);
    const root = ReactDOM.createRoot(host);
    const waitForRender = () => new Promise((resolve) => setTimeout(resolve, 50));
    root.render(React.createElement(BenderLinkPreviewCard, { mode: 'composer', state: 'loading' }));
    await waitForRender();
    const loading = { role: host.querySelector('[role="status"]')?.getAttribute('role'), text: host.textContent };
    let removed = false;
    root.render(React.createElement(BenderLinkPreviewCard, { mode: 'composer', state: 'ready', preview: { source_url: 'https://example.org', url: 'https://example.org/canonical', title: 'Title', description: null, site_name: null, image_url: null }, onRemove: () => { removed = true; } }));
    await waitForRender();
    const ready = { anchorCount: host.querySelectorAll('a').length, removeLabel: host.querySelector('button')?.getAttribute('aria-label') };
    host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    root.unmount();
    host.remove();
    return { loading, ready, removed };
  });
  expect(result.loading).toEqual({ role: 'status', text: 'Loading link preview' });
  expect(result.ready).toEqual({ anchorCount: 0, removeLabel: 'Remove link preview' });
  expect(result.removed).toBe(true);
});
