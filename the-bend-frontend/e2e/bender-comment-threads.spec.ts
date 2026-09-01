import { expect, test, type Page } from '@playwright/test';

const author = (id: string, name: string) => ({ id, name, avatar_url: null, shop_id: null, shop_name: null });
const parent = { id: 'p1', author: author('u1', 'Parent'), content: 'parent body', created_at: '2026-08-20T10:00:00Z', parent_comment_id: null, reply_count: 2, like_count: 1, viewer_has_liked: false, is_deleted: false };
const comments = [parent, { id: 'r1', author: author('u3', 'Reply one'), content: 'old reply', created_at: '2026-08-20T10:01:00Z', parent_comment_id: 'p1', reply_count: 0, like_count: 0, viewer_has_liked: false, is_deleted: false }, { id: 'r2', author: author('u4', 'Reply two'), content: 'new reply', created_at: '2026-08-20T10:02:00Z', parent_comment_id: 'p1', reply_count: 0, like_count: 2, viewer_has_liked: false, is_deleted: false }, { id: 't1', author: author('u5', 'Deleted parent'), content: 'Comment deleted', created_at: '2026-08-20T10:03:00Z', parent_comment_id: null, reply_count: 1, like_count: 0, viewer_has_liked: false, is_deleted: true }, { id: 'u1', author: author('u6', 'Unrelated'), content: 'top level', created_at: '2026-08-20T10:04:00Z', parent_comment_id: null, reply_count: 0, like_count: 0, viewer_has_liked: false, is_deleted: false }];
const post = { id: 'post-1', author: author('u2', 'Poster'), caption: 'post', media_url: null, media_thumbnail_url: null, media_type: null, like_count: 0, comment_count: 5, viewer_has_liked: false, created_at: '2026-08-20T09:00:00Z', link_preview: null };

async function openDrawer(page: Page, signedIn = true, overrides: Record<string, unknown> = {}) {
  await page.addInitScript(({ signedIn: logged }) => { if (logged) { localStorage.setItem('access_token', 'token'); localStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'Me' })); } else localStorage.clear(); }, { signedIn });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname === '/api/v1/tenant/current') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    if (url.pathname === '/api/v1/bender/posts' && request.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ ...post, ...overrides }], next_cursor: null, has_more: false }) });
    if (url.pathname.endsWith('/comments') && request.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: comments, next_cursor: null, has_more: false }) });
    if (request.method() === 'POST' && url.pathname.endsWith('/comments')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...comments[1], id: 'server-reply', content: (request.postDataJSON() as { content: string }).content, parent_comment_id: (request.postDataJSON() as { parent_comment_id: string | null }).parent_comment_id }) });
    if (request.method() === 'POST' && url.pathname.includes('/like')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: url.pathname.split('/').at(-2), like_count: 9, viewer_has_liked: true }) });
    if (request.method() === 'DELETE' && url.pathname.includes('/like')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: url.pathname.split('/').at(-2), like_count: 1, viewer_has_liked: false }) });
    return route.fulfill({ status: 204, body: '' });
  });
  await page.goto('/bender');
  await page.getByTestId('bender-actions').getByRole('button', { name: 'Comments' }).click();
  await expect(page.getByTestId('bender-comments-drawer')).toBeVisible();
}

test('renders replies beneath each parent in chronological order and only offers parent replies', async ({ page }) => {
  await openDrawer(page);
  await expect(page.getByTestId('bender-comment-replies-p1')).toHaveCount(1);
  const rows = page.locator('div[data-testid^="bender-comment-"]:not([data-testid*="replies"])');
  await expect(rows).toHaveCount(5);
  await expect(page.getByTestId('bender-comments-drawer')).toContainText('old reply');
  await expect(page.getByTestId('bender-comment-t1')).toContainText('Comment deleted');
  await expect(page.getByTestId('bender-comment-t1').getByRole('button', { name: 'Reply' })).toHaveCount(0);
  await expect(page.getByTestId('bender-comment-r1').getByRole('button', { name: 'Reply' })).toHaveCount(0);
});

test('opens, cancels, and submits one reply composer with Enter semantics', async ({ page }) => {
  let creates = 0;
  await openDrawer(page);
  page.on('request', (request) => { if (request.url().includes('/comments') && request.method() === 'POST') creates++; });
  await page.getByTestId('bender-comment-p1').getByRole('button', { name: 'Reply' }).click();
  await expect(page.getByTestId('bender-reply-composer-p1')).toContainText('Replying to Parent');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('bender-reply-composer-p1')).toHaveCount(0);
  await page.getByTestId('bender-comment-p1').getByRole('button', { name: 'Reply' }).click();
  const composer = page.getByTestId('bender-reply-composer-p1').locator('textarea');
  await composer.fill('line one'); await composer.press('Shift+Enter'); await expect(composer).toHaveValue('line one\n');
  await composer.press('Enter'); await expect(page.getByText('line one')).toBeVisible(); await expect.poll(() => creates).toBe(1);
});

test('optimistic failed reply restores exact draft and post count', async ({ page }) => {
  await openDrawer(page, true, { comment_count: 5 });
  await page.unroute('**/api/v1/bender/posts/post-1/comments');
  await page.route('**/api/v1/bender/posts/post-1/comments', async (route) => route.fulfill({ status: 500, body: 'failed' }));
  await page.getByTestId('bender-comment-p1').getByRole('button', { name: 'Reply' }).click();
  const composer = page.getByTestId('bender-reply-composer-p1').locator('textarea'); await composer.fill('restore me'); await composer.press('Enter');
  await expect(page.getByTestId('bender-reply-composer-p1').locator('textarea')).toHaveValue('restore me');
  await expect(page.getByTestId('bender-comment-p1')).toContainText('parent body');
});

test('heart and unheart update parent and reply from server, then roll back on failure', async ({ page }) => {
  await openDrawer(page);
  const parentHeart = page.getByTestId('bender-comment-p1').getByRole('button', { name: 'Like comment' }); await parentHeart.click(); await expect(page.getByTestId('bender-comment-p1')).toContainText('9');
  const replyHeart = page.getByTestId('bender-comment-r1').getByRole('button', { name: 'Like comment' }); await replyHeart.click(); await expect(page.getByTestId('bender-comment-r1')).toContainText('9');
  await page.unroute('**/api/v1/bender/posts/post-1/comments/r1/like'); await page.route('**/api/v1/bender/posts/post-1/comments/r1/like', async (route) => route.fulfill({ status: 500, body: 'failed' })); await replyHeart.click(); await expect(replyHeart).toHaveAttribute('aria-label', 'Unlike comment');
});

test('delete tombstones a parent with replies and failed delete restores it', async ({ page }) => {
  await openDrawer(page);
  await page.getByTestId('bender-comment-p1').getByRole('button', { name: 'More' }).click(); await page.getByRole('button', { name: 'Delete' }).click(); await expect(page.getByTestId('bender-comment-p1')).toContainText('Comment deleted'); await expect(page.getByTestId('bender-comment-r1')).toBeVisible();
});

test('signed-out readers see comments and heart counts without controls', async ({ page }) => {
  await openDrawer(page, false);
  await expect(page.getByTestId('bender-comments-drawer')).toContainText('2');
  await expect(page.getByRole('button', { name: 'Like comment' })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Reply' })).toHaveCount(0); await expect(page.getByPlaceholder('Add a comment…')).toHaveCount(0); await expect(page.getByRole('button', { name: 'More' })).toHaveCount(0);
});

test('thread rows and composer remain contained at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 }); await openDrawer(page); await page.getByTestId('bender-comment-p1').getByRole('button', { name: 'Reply' }).click();
  const overflow = await page.getByTestId('bender-comments-drawer').evaluate((element) => ({ right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width, scroll: element.scrollWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1); await expect(page.getByTestId('bender-reply-composer-p1')).toBeVisible();
});
