import { expect, test, type Page } from '@playwright/test';

const thread = {
  id: 'thread-1',
  other_party: { id: 'u2', name: 'Alex', avatar_url: null, shop_id: null, shop_name: null },
  listing: null,
  unread_count: 0,
  last_message_at: '2026-09-05T08:00:00Z',
  last_message: null,
};

async function openMessages(page: Page, sendFails = false) {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'Me', role: 'individual' }));
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/tenant/current') {
      return route.fulfill({ json: { slug: 'westmoreland', display_name: 'The Bend' } });
    }
    if (url.pathname === '/api/v1/messages/threads' && request.method() === 'GET') {
      return route.fulfill({ json: { items: [thread], next_cursor: null, has_more: false } });
    }
    if (url.pathname === '/api/v1/messages/threads/thread-1' && request.method() === 'GET') {
      return route.fulfill({ json: { items: [], next_cursor: null, has_more: false } });
    }
    if (url.pathname === '/api/v1/messages/threads/thread-1' && request.method() === 'POST') {
      if (sendFails) return route.fulfill({ status: 500, body: 'send failed' });
      const body = request.postDataJSON() as { content?: string };
      return route.fulfill({ json: { id: 'message-1', thread_id: 'thread-1', sender_id: 'u1', content: body.content ?? '', created_at: '2026-09-05T08:01:00Z', attachment_url: null, attachment_type: null, attachment_thumbnail_url: null, reference: null } });
    }
    if (url.pathname === '/api/v1/messages/unread-count') return route.fulfill({ json: { unread_count: 0 } });
    return route.fulfill({ json: {} });
  });

  await page.goto('/messages/thread-1');
  await expect(page.locator('[placeholder="Type a message..."]:visible')).toBeVisible();
}

test('mobile composer clears the header and fixed bottom navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMessages(page);

  const bottomNav = page.locator('nav').filter({ hasText: 'Messages' });
  const bounds = await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll('[placeholder="Type a message..."]')).find((element) => (element as HTMLElement).offsetParent !== null)!.getBoundingClientRect();
    const nav = document.querySelector('nav.fixed')!.getBoundingClientRect();
    const header = document.querySelector('main')!.previousElementSibling!.getBoundingClientRect();
    const composerShell = input.parentElement?.parentElement?.getBoundingClientRect();
    return { inputBottom: input.bottom, composerBottom: composerShell?.bottom ?? input.bottom, navTop: nav.top, headerBottom: header.bottom, viewport: window.innerHeight };
  });
  expect(bounds.composerBottom).toBeLessThanOrEqual(bounds.navTop + 1);
  expect(bounds.headerBottom).toBeLessThanOrEqual(bounds.inputBottom);
  await expect(bottomNav.getByRole('button', { name: 'Messages' })).toBeVisible();
  const usableWidth = await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll('[placeholder="Type a message..."]')).find((element) => (element as HTMLElement).offsetParent !== null)!;
    const shell = input.parentElement?.parentElement?.getBoundingClientRect();
    return { input: input.getBoundingClientRect().width, shell: shell?.width ?? 0 };
  });
  expect(usableWidth.input).toBeGreaterThanOrEqual(usableWidth.shell * 0.8);
});

test('textarea grows for multiline drafts and Enter inserts a newline without sending', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMessages(page);
  const composer = page.locator('[placeholder="Type a message..."]:visible');
  const sends: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/messages/threads/thread-1') && request.method() === 'POST') sends.push(request.postDataJSON().content);
  });
  await composer.fill('line one');
  const oneLineHeight = await composer.evaluate((element) => element.getBoundingClientRect().height);
  await composer.press('Enter');
  await expect(composer).toHaveValue('line one\n');
  await composer.fill('line one\nline two\nline three');
  const multilineHeight = await composer.evaluate((element) => element.getBoundingClientRect().height);
  expect(multilineHeight).toBeGreaterThan(oneLineHeight);
  expect(multilineHeight).toBeLessThanOrEqual(160);
  expect(sends).toEqual([]);
});

test('explicit Send sends one request with multiline content and preserves controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMessages(page);
  const composer = page.locator('[placeholder="Type a message..."]:visible');
  const sends: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/messages/threads/thread-1') && request.method() === 'POST') sends.push(request.postDataJSON().content);
  });
  await composer.fill('line one\nline two');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => sends).toEqual(['line one\nline two']);
  await expect(page.getByRole('paragraph').filter({ hasText: 'line one line two' }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach reference' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open camera' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record voice note' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach reference' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Open camera' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Record voice note' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Attach file' })).toBeEnabled();
});

test('failed send restores the exact multiline draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMessages(page, true);
  const composer = page.locator('[placeholder="Type a message..."]:visible');
  await composer.fill('keep line one\nkeep line two');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(composer).toHaveValue('keep line one\nkeep line two');
});

test('desktop keeps a side-by-side chat and sends with the labelled action', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openMessages(page);
  await expect(page.getByText('Messages').first()).toBeVisible();
  await expect(page.locator('[placeholder="Type a message..."]:visible')).toBeVisible();
  await page.locator('[placeholder="Type a message..."]:visible').fill('desktop message');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('desktop message', { exact: true }).first()).toBeVisible();
});
