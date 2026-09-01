import { expect, test, type Page } from '@playwright/test';

const author = (id: string, name: string) => ({ id, name, avatar_url: null, shop_id: null, shop_name: null });
const post = { id: 'post-1', author: author('u2', 'Poster'), caption: 'post', media_url: null, media_thumbnail_url: null, media_type: null, like_count: 0, comment_count: 2, viewer_has_liked: false, created_at: '2026-08-20T09:00:00Z', link_preview: null };
const parent = { id: 'parent-1', author: author('u1', 'Parent'), content: 'parent body', created_at: '2026-08-20T10:00:00Z', parent_comment_id: null, reply_count: 1, like_count: 0, viewer_has_liked: false, is_deleted: false };
const reply = { id: 'reply-1', author: author('u3', 'Reply'), content: 'reply body', created_at: '2026-08-20T10:01:00Z', parent_comment_id: 'parent-1', reply_count: 0, like_count: 0, viewer_has_liked: false, is_deleted: false };

async function setup(page: Page, options: { feedPosts?: unknown[]; comments?: unknown[]; directPost?: unknown; directComment?: unknown; directParent?: unknown; post404?: boolean; comment404?: boolean; post500?: boolean; comment500?: boolean; parent500?: boolean } = {}) {
  const paths: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'Me', role: 'individual' }));
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    paths.push(`${request.method()} ${url.pathname}`);
    if (url.pathname === '/api/v1/tenant/current') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    if (url.pathname === '/api/v1/bender/posts' && request.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: options.feedPosts ?? [post], next_cursor: null, has_more: false }) });
    if (url.pathname.match(/^\/api\/v1\/bender\/posts\/[^/]+$/) && request.method() === 'GET') {
      if (options.post404) return route.fulfill({ status: 404, body: 'missing' });
      if (options.post500) return route.fulfill({ status: 500, body: 'failed' });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(options.directPost ?? post) });
    }
    if (url.pathname.endsWith('/comments') && request.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: options.comments ?? [parent], next_cursor: null, has_more: false }) });
    if (url.pathname.match(/\/comments\/[^/]+$/) && request.method() === 'GET') {
      if (options.comment404) return route.fulfill({ status: 404, body: 'missing' });
      if (options.comment500 || (options.parent500 && url.pathname.endsWith('/comments/parent-1'))) return route.fulfill({ status: 500, body: 'failed' });
      const id = url.pathname.split('/').at(-1);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(id === 'parent-1' ? (options.directParent ?? parent) : (options.directComment ?? reply)) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
  return paths;
}

test('routes a Bender reply notification to the exact post and comment query string', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('access_token', 'test-token'); localStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'Me', role: 'individual' })); });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/tenant/current') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    if (url.pathname === '/api/v1/notifications') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'n1', type: 'bender_reply', title: 'Reply', body: 'body', data: { bender_post_id: 'post 1', bender_comment_id: 'reply/1', bender_parent_comment_id: 'ignored' }, is_read: true, created_at: '2026-08-20T10:00:00Z' }], next_cursor: null, has_more: false }) });
    if (url.pathname === '/api/v1/bender/posts') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: null, has_more: false }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
  await page.goto('/notifications');
  await page.getByText('Reply').click();
  await expect(page).toHaveURL('/bender?post=post+1&comment=reply%2F1');
});

test('loads a missing focused post once and opens its comments without looping', async ({ page }) => {
  const paths = await setup(page, { feedPosts: [] });
  await page.goto('/bender?post=post-1&comment=reply-1');
  await expect(page.getByTestId('bender-comments-drawer')).toBeVisible();
  await expect.poll(() => paths.filter((path) => path === 'GET /api/v1/bender/posts/post-1').length).toBe(1);
  await page.waitForTimeout(300);
  expect(paths.filter((path) => path === 'GET /api/v1/bender/posts/post-1')).toHaveLength(1);
});

test('direct-loads a missing reply and its absent parent, then focuses the reply', async ({ page }) => {
  const paths = await setup(page, { comments: [], directComment: reply, directParent: parent });
  await page.goto('/bender?post=post-1&comment=reply-1');
  await expect(page.getByTestId('bender-comment-focus')).toBeVisible();
  await expect(page.getByTestId('bender-comment-focus')).toHaveClass(/bg-amber-100/);
  await expect(page.getByTestId('bender-comment-focus')).toHaveClass(/ring-2/);
  await expect(page.getByTestId('bender-comment-focus')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('bender-comment-parent-1')).toBeVisible();
  await expect.poll(() => paths.filter((path) => path === 'GET /api/v1/bender/posts/post-1/comments/reply-1').length).toBe(1);
  await expect.poll(() => paths.filter((path) => path === 'GET /api/v1/bender/posts/post-1/comments/parent-1').length).toBe(1);
  await expect(page.getByTestId('bender-comment-focus')).toHaveAttribute('data-focus-active', 'true');
  await page.waitForTimeout(2200);
  await expect(page.getByTestId('bender-comment-reply-1')).toHaveAttribute('data-focus-active', 'false');
  await expect(page.getByTestId('bender-comment-reply-1')).not.toHaveClass(/bg-amber-100|ring-2/);
  await expect(page.getByTestId('bender-comment-reply-1')).not.toHaveAttribute('aria-current', 'true');
});

test('does not direct-fetch a target comment already present in the first page', async ({ page }) => {
  const paths = await setup(page, { comments: [parent, reply] });
  await page.goto('/bender?post=post-1&comment=reply-1');
  await expect(page.getByTestId('bender-comment-focus')).toBeVisible();
  expect(paths.filter((path) => path.endsWith('/comments/reply-1'))).toHaveLength(0);
});

test('a missing target comment still opens the regular comments list', async ({ page }) => {
  await setup(page, { comments: [parent], comment404: true });
  await page.goto('/bender?post=post-1&comment=deleted-reply');
  await expect(page.getByTestId('bender-comments-drawer')).toBeVisible();
  await expect(page.getByTestId('bender-comment-parent-1')).toBeVisible();
  await expect(page.getByTestId('bender-comment-focus')).toHaveCount(0);
});

test('a missing focused post leaves the normal feed usable', async ({ page }) => {
  await setup(page, { feedPosts: [], post404: true });
  await page.goto('/bender?post=deleted-post&comment=reply-1');
  await expect(page.getByText('No posts yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New post' })).toBeVisible();
});

test('scrolls the focused reply into view', async ({ page }) => {
  await setup(page, { comments: [parent, reply] });
  await page.addInitScript(() => { window.HTMLElement.prototype.scrollIntoView = function () { this.setAttribute('data-scrolled', 'true'); }; });
  await page.goto('/bender?post=post-1&comment=reply-1');
  await expect(page.getByTestId('bender-comment-focus')).toHaveAttribute('data-scrolled', 'true');
});

test('surfaces an unexpected focused comment failure while keeping comments usable', async ({ page }) => {
  await setup(page, { comments: [parent], comment500: true });
  await page.goto('/bender?post=post-1&comment=deleted-reply');
  await expect(page.getByTestId('bender-comments-drawer')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Could not load the linked comment');
  await expect(page.getByTestId('bender-comment-parent-1')).toBeVisible();
});

test('surfaces an unexpected focused post failure without replacing the feed', async ({ page }) => {
  await setup(page, { feedPosts: [], post500: true });
  await page.goto('/bender?post=deleted-post&comment=reply-1');
  await expect(page.getByRole('alert')).toContainText('Could not load the linked post');
  await expect(page.getByText('No posts yet')).toBeVisible();
});

test('manual close works after a forced deep-link drawer open', async ({ page }) => {
  await setup(page, { comments: [parent, reply] });
  await page.goto('/bender?post=post-1&comment=reply-1');
  await expect(page.getByTestId('bender-comments-drawer')).toBeVisible();
  await page.getByTestId('bender-post').getByRole('button', { name: 'Comments' }).click();
  await expect(page.getByTestId('bender-comments-drawer')).toHaveCount(0);
});

test('moves focus to a new target and removes the old marker', async ({ page }) => {
  await setup(page, { comments: [parent, reply] });
  await page.goto('/bender?post=post-1&comment=reply-1');
  await expect(page.getByTestId('bender-comment-focus')).toContainText('reply body');
  await expect(page.getByTestId('bender-comment-focus')).toHaveAttribute('aria-current', 'true');
  await page.goto('/bender?post=post-1&comment=parent-1');
  await expect(page.getByTestId('bender-comment-focus')).toContainText('parent body');
  await expect(page.getByTestId('bender-comment-focus')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('bender-comment-reply-1')).toHaveAttribute('data-focus-active', 'false');
  await expect(page.getByTestId('bender-comment-reply-1')).not.toHaveClass(/bg-amber-100|ring-2/);
  await expect(page.getByTestId('bender-comment-reply-1')).not.toHaveAttribute('aria-current', 'true');
});

test('surfaces an unexpected parent failure while keeping the target drawer usable', async ({ page }) => {
  await setup(page, { comments: [], parent500: true });
  await page.goto('/bender?post=post-1&comment=reply-1');
  await expect(page.getByRole('alert')).toContainText('Could not load the linked comment thread');
  await expect(page.getByTestId('bender-comments-drawer')).toBeVisible();
});
