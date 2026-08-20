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
    if (request.method() === 'POST' && url.pathname === '/api/v1/bender/link-preview') {
      const sourceUrl = (request.postDataJSON() as { url: string }).url;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(previewResponse({ source_url: sourceUrl })) });
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

async function openComposer(page: Page) {
  await page.getByRole('button', { name: 'New post' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function mountComposerHarness(page: Page) {
  await page.evaluate(async () => {
    const { mountBenderComposerHarness } = await import('/e2e/fixtures/bender-composer-harness.tsx');
    const host = document.createElement('div');
    host.dataset.testid = 'composer-harness';
    document.body.append(host);
    const controller = mountBenderComposerHarness(host);
    (window as unknown as { __composerHarness?: typeof controller }).__composerHarness = controller;
  });
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function unmountComposerHarness(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as { __composerHarness?: { cleanup: () => void } };
    state.__composerHarness?.cleanup();
    delete state.__composerHarness;
  });
}

function previewResponse(overrides: Record<string, unknown> = {}) {
  return {
    preview_token: 'preview-token',
    preview: preview(overrides),
  };
}

function createdPost(overrides: Record<string, unknown> = {}) {
  return {
    ...base,
    id: 'created-1',
    caption: 'Read https://example.org/article',
    created_at: '2026-08-21T10:00:00Z',
    ...overrides,
  };
}

async function stubComposerPost(page: Page, response: Record<string, unknown>) {
  await page.route('**/api/v1/bender/posts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
  });
}

function expectNoPreviewMetadata(body: Record<string, unknown>) {
  for (const key of ['link_preview', 'preview', 'source_url', 'image_url', 'title', 'description']) {
    expect(body).not.toHaveProperty(key);
  }
}

test('composer debounces a link and replaces loading with a preview', async ({ page }) => {
  await page.clock.install();
  const paths = await stubFeed(page, { ...base, caption: null, link_preview: null });
  await openComposer(page);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/bender/link-preview')) requests.push(request.postData() ?? '');
  });
  await page.getByPlaceholder('Write a caption…').fill('Read https://example.org/article');
  await expect(page.getByTestId('bender-link-preview-loading')).toHaveText('Loading link preview');
  expect(requests).toEqual([]);
  await page.clock.runFor(399);
  expect(requests).toEqual([]);
  await page.clock.runFor(1);
  await expect.poll(() => requests).toEqual(['{"url":"https://example.org/article"}']);
  await expect(page.getByTestId('bender-link-preview')).toContainText('Title');
  await page.getByPlaceholder('Write a caption…').fill('Updated around https://example.org/article');
  await expect(page.getByTestId('bender-link-preview')).toContainText('Title');
  expect(requests).toHaveLength(1);
  expect(paths).toContain('POST /api/v1/bender/link-preview');
});

test('stale create success cannot prepend after the composer session closes', async ({ page }) => {
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  let releaseCreate!: () => void;
  await page.route('**/api/v1/bender/posts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise<void>((resolve) => { releaseCreate = resolve; });
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(createdPost({ id: 'stale-create', caption: 'Stale response', link_preview: null })),
    });
  });
  await mountComposerHarness(page);
  await page.getByPlaceholder('Write a caption…').fill('Stale draft');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Posting…' })).toBeDisabled();
  await page.getByTestId('composer-harness-force-close').evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/v1/bender/posts'));
  releaseCreate();
  await createResponse;
  await expect(page.getByTestId('composer-harness-state')).toContainText('"createdCount":0');
  await page.getByTestId('composer-harness-reopen').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByPlaceholder('Write a caption…')).toHaveValue('');
  await unmountComposerHarness(page);
});

test('stale create rejection cannot show an error after close and reopen', async ({ page }) => {
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  let releaseCreate!: () => void;
  await page.route('**/api/v1/bender/posts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise<void>((resolve) => { releaseCreate = resolve; });
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await mountComposerHarness(page);
  await page.getByPlaceholder('Write a caption…').fill('Stale failure');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await page.getByTestId('composer-harness-force-close').evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByTestId('composer-harness-reopen').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/v1/bender/posts'));
  releaseCreate();
  await createResponse;
  await expect(page.getByText('Could not post. Please try again.')).toHaveCount(0);
  await unmountComposerHarness(page);
});

test('Post waits for an active preview and sends only its token', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  let releasePreview!: () => void;
  await page.route('**/api/v1/bender/link-preview', async (route) => {
    await new Promise<void>((resolve) => { releasePreview = resolve; });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(previewResponse({ source_url: 'https://example.org/article' })) });
  });
  await stubComposerPost(page, createdPost({ caption: 'Read https://example.org/article' }));
  await openComposer(page);
  const caption = page.getByPlaceholder('Write a caption…');
  await caption.fill('  Read https://example.org/article  ');
  await page.clock.runFor(400);
  await expect(page.getByTestId('bender-link-preview-loading')).toBeVisible();
  const postRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/bender/posts')) postRequests.push(request.postData() ?? '');
  });
  const postRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/bender/posts'));
  await page.getByRole('button', { name: 'Post', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Posting…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Post', exact: true })).toHaveCount(0);
  await expect(caption).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Camera' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Pick from library' })).toBeDisabled();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').click({ position: { x: 2, y: 2 } });
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(postRequests).toHaveLength(0);
  releasePreview();
  const request = await postRequest;
  const body = request.postDataJSON() as Record<string, unknown>;
  expect(body).toEqual({ caption: 'Read https://example.org/article', preview_token: 'preview-token' });
  expectNoPreviewMetadata(body);
  expect(postRequests).toHaveLength(1);
});

test('mismatched preview source cannot attach a token or card', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  await page.route('**/api/v1/bender/link-preview', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(previewResponse({ source_url: 'https://other.example/wrong', title: 'Wrong source' })),
    });
  });
  await stubComposerPost(page, createdPost({ caption: 'Read https://example.org/article', link_preview: null }));
  await openComposer(page);
  await page.getByPlaceholder('Write a caption…').fill('Read https://example.org/article');
  await page.clock.runFor(400);
  await expect(page.getByTestId('bender-link-preview')).toHaveCount(0);
  const postRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/bender/posts'));
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  const body = (await postRequest).postDataJSON() as Record<string, unknown>;
  expect(body).toEqual({ caption: 'Read https://example.org/article' });
  expectNoPreviewMetadata(body);
});

test('create failure unlocks the captured draft and controls', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  await page.route('**/api/v1/bender/link-preview', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(previewResponse({ source_url: 'https://example.org/article' })) });
  });
  let releasePost!: () => void;
  await page.route('**/api/v1/bender/posts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise<void>((resolve) => { releasePost = resolve; });
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await openComposer(page);
  const caption = page.getByPlaceholder('Write a caption…');
  await caption.fill('Keep https://example.org/article');
  await page.clock.runFor(400);
  await expect(page.getByTestId('bender-link-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByTestId('bender-link-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Remove link preview' }).click();
  await expect(page.getByTestId('bender-link-preview')).toBeVisible();
  releasePost();
  await expect(page.getByText('Could not post. Please try again.')).toBeVisible();
  await expect(caption).toHaveValue('Keep https://example.org/article');
  await expect(caption).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Camera' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Pick from library' })).toBeEnabled();
  await expect(page.getByTestId('bender-link-preview')).toBeVisible();
});

test('late media upload cannot mutate a closed composer', async ({ page }) => {
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  let releaseUpload!: () => void;
  await page.route('**/api/v1/upload/media', async (route) => {
    await new Promise<void>((resolve) => { releaseUpload = resolve; });
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ url: '/uploads/late-photo.jpg', thumbnail_url: null, type: 'image' }),
    });
  });
  await stubComposerPost(page, createdPost({ caption: 'Caption', link_preview: null }));
  await openComposer(page);
  const uploadRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/upload/media'));
  await page.locator('input[type="file"]').setInputFiles({
    name: 'late-photo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('fake-image'),
  });
  await uploadRequest;
  await page.getByPlaceholder('Write a caption…').fill('Caption');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const uploadResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/v1/upload/media'));
  releaseUpload();
  await uploadResponse;
  await page.getByRole('button', { name: 'New post' }).click();
  await expect(page.getByPlaceholder('Write a caption…')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Remove media' })).toHaveCount(0);
});

test('upload from a closed composer cannot attach media to a reopened session', async ({ page }) => {
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  let releaseUpload!: () => void;
  await page.route('**/api/v1/upload/media', async (route) => {
    await new Promise<void>((resolve) => { releaseUpload = resolve; });
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ url: '/uploads/session-a.jpg', thumbnail_url: null, type: 'image' }),
    });
  });
  await openComposer(page);
  const uploadRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/upload/media'));
  await page.locator('input[type="file"]').setInputFiles({ name: 'session-a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-image') });
  await uploadRequest;
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'New post' })).toBeVisible();
  await page.getByRole('button', { name: 'New post' }).click();
  const uploadResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/v1/upload/media'));
  releaseUpload();
  await uploadResponse;
  await expect(page.getByRole('button', { name: 'Remove media' })).toHaveCount(0);
});

test('rejected upload from a closed composer cannot show an error in a reopened session', async ({ page }) => {
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  let rejectUpload!: () => void;
  await page.route('**/api/v1/upload/media', async (route) => {
    await new Promise<void>((resolve) => { rejectUpload = resolve; });
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await openComposer(page);
  const uploadRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/upload/media'));
  await page.locator('input[type="file"]').setInputFiles({ name: 'session-a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-image') });
  await uploadRequest;
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'New post' }).click();
  const uploadResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/v1/upload/media'));
  rejectUpload();
  await uploadResponse;
  await expect(page.getByText('Could not upload that file. Try a smaller one.')).toHaveCount(0);
});

test('pre-submit upload rejection cannot mutate a draft after create failure unlocks it', async ({ page }) => {
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  let rejectUpload!: () => void;
  await page.route('**/api/v1/upload/media', async (route) => {
    await new Promise<void>((resolve) => { rejectUpload = resolve; });
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/v1/bender/posts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await openComposer(page);
  const uploadRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/upload/media'));
  await page.locator('input[type="file"]').setInputFiles({ name: 'pre-submit.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-image') });
  await uploadRequest;
  const caption = page.getByPlaceholder('Write a caption…');
  await caption.fill('Keep this draft');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText('Could not post. Please try again.')).toBeVisible();
  await expect(caption).toBeEnabled();
  const uploadResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/v1/upload/media'));
  rejectUpload();
  await uploadResponse;
  await expect(caption).toHaveValue('Keep this draft');
  await expect(page.getByRole('button', { name: 'Remove media' })).toHaveCount(0);
  await expect(page.getByText('Could not upload that file. Try a smaller one.')).toHaveCount(0);
});

test('closing and reopening the composer resets the camera session', async ({ page }) => {
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  await openComposer(page);
  await page.getByRole('button', { name: 'Camera' }).click();
  await expect(page.getByRole('button', { name: 'Close camera' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).evaluate((button) => (button as HTMLButtonElement).click());
  await page.getByRole('button', { name: 'New post' }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByRole('button', { name: 'Close camera' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Camera' })).toBeVisible();
});

test('Post continues after the five-second preview wait expires', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  await page.route('**/api/v1/upload/media', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ url: '/uploads/actual-photo.jpg', thumbnail_url: null, type: 'image' }),
    });
  });
  let releasePreview!: () => void;
  await page.route('**/api/v1/bender/link-preview', async (route) => {
    const source = (route.request().postDataJSON() as { url: string }).url;
    await new Promise<void>((resolve) => { releasePreview = resolve; });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(previewResponse({ source_url: source })) });
  });
  await stubComposerPost(page, createdPost({ caption: 'Read https://example.org/slow', media_url: '/uploads/actual-photo.jpg', media_type: 'image' }));
  await openComposer(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'actual-photo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('fake-image'),
  });
  await expect(page.getByRole('button', { name: 'Remove media' })).toBeVisible();
  await page.getByPlaceholder('Write a caption…').fill('Read https://example.org/slow');
  await page.clock.runFor(400);
  await expect(page.getByTestId('bender-link-preview-loading')).toBeVisible();
  const postRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/bender/posts')) postRequests.push(request.postData() ?? '');
  });
  const postRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/bender/posts'));
  await page.getByRole('button', { name: 'Post', exact: true }).dispatchEvent('click');
  await page.clock.runFor(4999);
  expect(postRequests).toHaveLength(0);
  await page.clock.runFor(1);
  const request = await postRequest;
  const body = request.postDataJSON() as Record<string, unknown>;
  expect(body).toEqual({
    caption: 'Read https://example.org/slow',
    media_url: '/uploads/actual-photo.jpg',
    media_type: 'image',
  });
  expectNoPreviewMetadata(body);
  expect(postRequests).toHaveLength(1);
  releasePreview();
});

test('failed preview still creates a plain-link post', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  await page.route('**/api/v1/bender/link-preview', async (route) => {
    await route.fulfill({ status: 422, contentType: 'application/json', body: '{}' });
  });
  await stubComposerPost(page, createdPost({ caption: 'Read https://example.org/article', link_preview: null }));
  await openComposer(page);
  await page.getByPlaceholder('Write a caption…').fill('Read https://example.org/article');
  await page.clock.runFor(400);
  await expect(page.getByTestId('bender-link-preview')).toHaveCount(0);
  const postRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/bender/posts'));
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  const body = (await postRequest).postDataJSON() as Record<string, unknown>;
  expect(body).toEqual({ caption: 'Read https://example.org/article' });
  expectNoPreviewMetadata(body);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const created = page.locator('[data-testid="bender-post"]').filter({ hasText: 'Read https://example.org/article' });
  const rawLink = created.getByRole('link', { name: 'https://example.org/article' });
  await expect(rawLink).toHaveAttribute('href', 'https://example.org/article');
  await expect(rawLink).toHaveAttribute('target', '_blank');
  await expect(rawLink).toHaveAttribute('rel', /noopener/);
  await expect(rawLink).toHaveAttribute('rel', /noreferrer/);
  await expect(page.getByTestId('bender-link-preview')).toHaveCount(0);
});

test('successful create response prepends the immutable preview', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  await page.route('**/api/v1/bender/link-preview', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(previewResponse({ source_url: 'https://example.org/article', title: 'Composer preview' })),
    });
  });
  await stubComposerPost(page, createdPost({
    caption: 'Read https://example.org/article and https://other.example/x',
    link_preview: preview({ source_url: 'https://example.org/article', url: 'https://example.org/server', title: 'Server snapshot', site_name: 'Server site' }),
  }));
  await openComposer(page);
  await page.getByPlaceholder('Write a caption…').fill('Read https://example.org/article and https://other.example/x');
  await page.clock.runFor(400);
  await expect(page.getByTestId('bender-link-preview')).toBeVisible();
  const postRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/bender/posts'));
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  const body = (await postRequest).postDataJSON() as Record<string, unknown>;
  expect(body).toEqual({ caption: 'Read https://example.org/article and https://other.example/x', preview_token: 'preview-token' });
  expectNoPreviewMetadata(body);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const created = page.locator('[data-testid="bender-post"]').filter({ hasText: 'Server snapshot' });
  const card = created.getByRole('link', { name: 'Server snapshot, Server site' });
  await expect(card).toHaveAttribute('href', 'https://example.org/server');
  await expect(card).toHaveAttribute('target', '_blank');
  await expect(card).toHaveAttribute('rel', 'noopener noreferrer');
  const otherLink = created.getByRole('link', { name: 'https://other.example/x' });
  await expect(otherLink).toHaveAttribute('href', 'https://other.example/x');
  await expect(otherLink).toHaveAttribute('target', '_blank');
  await expect(otherLink).toHaveAttribute('rel', /noopener/);
  await expect(otherLink).toHaveAttribute('rel', /noreferrer/);
  await expect(created.getByRole('link', { name: 'https://example.org/article' })).toHaveCount(0);
  await expect(created).not.toContainText('Composer preview');
});

test('composer shows a text-only preview', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  await openComposer(page);
  await page.getByPlaceholder('Write a caption…').fill('https://example.org/text');
  await page.clock.runFor(400);
  await expect(page.getByTestId('bender-link-preview')).toBeVisible();
  await expect(page.getByTestId('bender-link-preview').locator('img')).toHaveCount(0);
});

test('removing a preview keeps it dismissed until the first URL changes', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  await openComposer(page);
  const caption = page.getByPlaceholder('Write a caption…');
  await caption.fill('https://example.org/one');
  await page.clock.runFor(400);
  const card = page.getByTestId('bender-link-preview');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Remove link preview' }).click();
  await caption.fill('Caption changed https://example.org/one');
  await page.clock.runFor(400);
  await expect(page.getByTestId('bender-link-preview')).toHaveCount(0);
  await caption.fill('https://example.org/two');
  await page.clock.runFor(400);
  await expect(page.getByTestId('bender-link-preview')).toBeVisible();
});

test('failed preview leaves Post usable', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  await page.route('**/api/v1/bender/link-preview', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await openComposer(page);
  await page.getByPlaceholder('Write a caption…').fill('https://example.org/fails');
  await page.clock.runFor(400);
  await expect(page.getByRole('button', { name: 'Post', exact: true })).toBeEnabled();
  await expect(page.getByPlaceholder('Write a caption…')).toHaveValue('https://example.org/fails');
  await expect(page.getByText('Could not load link preview')).toHaveCount(0);
});

test('stale response cannot replace the current URL preview', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  await page.unroute('**/api/v1/**');
  const requests: string[] = [];
  const releases = new Map<string, () => void>();
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/tenant/current') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
      return;
    }
    if (url.pathname === '/api/v1/bender/posts') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [base], next_cursor: null, has_more: false }) });
      return;
    }
    if (url.pathname === '/api/v1/bender/link-preview') {
      const source = (route.request().postDataJSON() as { url: string }).url;
      requests.push(source);
      await new Promise<void>((resolve) => releases.set(source, resolve));
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(previewResponse({ source_url: source, title: source.endsWith('/a') ? 'A' : 'B' })) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: null, has_more: false }) });
  });
  await openComposer(page);
  const caption = page.getByPlaceholder('Write a caption…');
  await caption.fill('https://example.org/a');
  await page.clock.runFor(400);
  await caption.fill('https://example.org/b');
  await page.clock.runFor(400);
  await expect.poll(() => requests).toEqual(['https://example.org/a', 'https://example.org/b']);
  releases.get('https://example.org/b')?.();
  await expect(page.getByTestId('bender-link-preview')).toContainText('B');
  releases.get('https://example.org/a')?.();
  await expect(page.getByTestId('bender-link-preview')).toContainText('B');
  expect(await page.getByTestId('bender-link-preview').textContent()).not.toContain('A');
});

test('closing the composer cancels and resets preview state', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  const requests: string[] = [];
  const releases: Array<() => void> = [];
  let failed = false;
  page.on('requestfailed', (request) => {
    if (request.url().endsWith('/api/v1/bender/link-preview')) failed = true;
  });
  await page.route('**/api/v1/bender/link-preview', async (route) => {
    requests.push(route.request().url());
    const source = (route.request().postDataJSON() as { url: string }).url;
    await new Promise<void>((resolve) => releases.push(resolve));
    try {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(previewResponse({ source_url: source, title: 'Old response' })) });
    } catch {
      failed = true;
    }
  });
  await openComposer(page);
  const caption = page.getByPlaceholder('Write a caption…');
  await caption.fill('https://example.org/reopen');
  await page.clock.runFor(400);
  await expect.poll(() => requests).toHaveLength(1);
  const waiter = page.getByTestId('bender-link-preview-loading');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => failed).toBe(true);
  releases.shift()?.();
  await expect(page.getByTestId('bender-link-preview')).toHaveCount(0);
  await openComposer(page);
  await expect(caption).toHaveValue('');
  await caption.fill('https://example.org/reopen');
  await page.clock.runFor(400);
  await expect.poll(() => requests).toHaveLength(2);
  releases.shift()?.();
  await expect(page.getByTestId('bender-link-preview')).toBeVisible();
  await expect(waiter).toHaveCount(0);
});

test('hook waitForPreviewToken covers debounce, readiness, timeout, failure, reset, and URL changes', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  const requests: string[] = [];
  const releases = new Map<string, () => void>();
  await page.route('**/api/v1/bender/link-preview', async (route) => {
    const source = (route.request().postDataJSON() as { url: string }).url;
    requests.push(source);
    if (source.endsWith('/failure')) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    await new Promise<void>((resolve) => releases.set(source, resolve));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(previewResponse({ source_url: source, title: source })) });
  });

  await page.evaluate(async () => {
    const { mountBenderLinkPreviewHookHarness } = await import('/e2e/fixtures/bender-link-preview-hook-harness.tsx');
    const host = document.createElement('div');
    host.dataset.testid = 'hook-harness';
    document.body.append(host);
    const controller = mountBenderLinkPreviewHookHarness(host);
    (window as unknown as { __hookHarness?: typeof controller }).__hookHarness = controller;
  });

  const caption = page.getByTestId('hook-caption');
  const source = page.getByTestId('hook-source');
  const timeout = page.getByTestId('hook-timeout');
  const state = page.getByTestId('hook-state');
  const wait = page.getByTestId('hook-wait');
  const reset = page.getByTestId('hook-reset');
  const close = page.getByTestId('hook-close');
  const url = 'https://example.org/debounce';
  await caption.fill(url);
  await source.fill(url);
  await expect(state).toContainText('"status":"loading"');
  await wait.click();
  await expect(state).toContainText('"waitResult":""');
  await page.clock.runFor(350);
  await page.clock.runFor(50);
  await expect.poll(() => requests).toEqual([url]);
  releases.get(url)?.();
  await expect(state).toContainText('"waitResult":"preview-token"');
  await wait.click();
  await expect(state).toContainText('"waitResult":"preview-token"');

  await source.fill('https://example.org/mismatch');
  await wait.click();
  await expect(state).toContainText('"waitResult":"null"');
  await caption.fill('');
  await source.fill('');
  await wait.click();
  await expect(state).toContainText('"waitResult":"null"');

  const timeoutUrl = 'https://example.org/timeout';
  await caption.fill(timeoutUrl);
  await source.fill(timeoutUrl);
  await timeout.fill('0');
  await wait.click();
  await expect(state).toContainText('"waitResult":"null"');
  await timeout.fill('20');
  await wait.click();
  await page.clock.runFor(20);
  await expect(state).toContainText('"waitResult":"null"');
  await expect.poll(() => requests).toContain(timeoutUrl);
  releases.get(timeoutUrl)?.();
  await expect(state).toContainText('"status":"success"');
  await wait.click();
  await expect(state).toContainText('"waitResult":"preview-token"');

  const failureUrl = 'https://example.org/failure';
  await caption.fill(failureUrl);
  await source.fill(failureUrl);
  await page.clock.runFor(400);
  await expect(state).toContainText('"status":"unavailable"');
  await wait.click();
  await expect(state).toContainText('"waitResult":"null"');

  const resetUrl = 'https://example.org/reset';
  await caption.fill(resetUrl);
  await source.fill(resetUrl);
  await page.clock.runFor(400);
  await expect.poll(() => requests).toContain(resetUrl);
  await wait.click();
  await reset.click();
  await expect(state).toContainText('"status":"idle"');
  await expect(state).toContainText('"waitResult":"null"');
  releases.get(resetUrl)?.();

  const firstUrl = 'https://example.org/first';
  const secondUrl = 'https://example.org/second';
  await caption.fill(firstUrl);
  await source.fill(firstUrl);
  await page.clock.runFor(400);
  await expect.poll(() => requests).toContain(firstUrl);
  await wait.click();
  await caption.fill(secondUrl);
  await source.fill(secondUrl);
  await page.clock.runFor(400);
  await expect.poll(() => requests).toContain(secondUrl);
  await expect(state).toContainText('"waitResult":"null"');
  releases.get(firstUrl)?.();
  releases.get(secondUrl)?.();
  await expect(state).toContainText('"status":"success"');
  const closeUrl = 'https://example.org/close';
  await caption.fill(closeUrl);
  await source.fill(closeUrl);
  await page.clock.runFor(400);
  await expect.poll(() => requests).toContain(closeUrl);
  await wait.click();
  await close.click();
  await expect(state).toContainText('"status":"idle"');
  await expect(state).toContainText('"waitResult":"null"');
  releases.get(closeUrl)?.();
  await page.evaluate(() => {
    const state = window as unknown as { __hookHarness?: { cleanup: () => void } };
    state.__hookHarness?.cleanup();
    delete state.__hookHarness;
  });
});

test('hook stale response guard survives an abort-ignoring A request', async ({ page }) => {
  await page.clock.install();
  await stubFeed(page, { ...base, caption: null, link_preview: null });
  await page.evaluate(async () => {
    const { mountBenderLinkPreviewHookHarness } = await import('/e2e/fixtures/bender-link-preview-hook-harness.tsx');
    const host = document.createElement('div');
    document.body.append(host);
    const controller = mountBenderLinkPreviewHookHarness(host, { ignoreAbort: true });
    (window as unknown as { __hookHarness?: typeof controller }).__hookHarness = controller;
  });

  const caption = page.getByTestId('hook-caption');
  const state = page.getByTestId('hook-state');
  const requests = () =>
    page.evaluate(() => {
      const harness = (window as unknown as { __hookHarness?: { requests: () => string[] } }).__hookHarness;
      return harness?.requests() ?? [];
    });
  const resolve = (sourceUrl: string) =>
    page.evaluate((url) => {
      const harness = (window as unknown as { __hookHarness?: { resolve: (source: string) => void } }).__hookHarness;
      harness?.resolve(url);
    }, sourceUrl);
  const cleanup = () =>
    page.evaluate(() => {
      const state = window as unknown as { __hookHarness?: { cleanup: () => void } };
      state.__hookHarness?.cleanup();
      delete state.__hookHarness;
    });

  const urlA = 'https://example.org/a';
  const urlB = 'https://example.org/b';
  await caption.fill(urlA);
  await page.clock.runFor(400);
  await expect.poll(requests).toEqual([urlA]);
  await caption.fill(urlB);
  await page.clock.runFor(400);
  await expect.poll(requests).toEqual([urlA, urlB]);
  await resolve(urlB);
  await expect(state).toContainText('"previewTitle":"B"');
  await expect(state).toContainText('"detectedUrl":"https://example.org/b"');
  await resolve(urlA);
  await expect(state).toContainText('"previewTitle":"B"');
  await expect(state).toContainText('"detectedUrl":"https://example.org/b"');
  await cleanup();
});
