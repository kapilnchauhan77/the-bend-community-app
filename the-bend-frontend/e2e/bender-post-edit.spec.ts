import { expect, test, type Page } from '@playwright/test';

const author = { id: 'u1', name: 'Alex', avatar_url: null, shop_id: null, shop_name: null };
const post = {
  id: 'p-edit', author, caption: 'Before https://example.org/old',
  media_url: '/uploads/photo.jpg', media_thumbnail_url: null, media_type: 'image',
  like_count: 3, comment_count: 1, viewer_has_liked: true,
  created_at: '2026-08-20T10:00:00Z',
  link_preview: { source_url: 'https://example.org/old', url: 'https://example.org/old', title: 'Old preview', description: null, site_name: null, image_url: null },
};

async function setup(page: Page, user: { id: string; role: string }) {
  await page.addInitScript(({ user: initialUser }) => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ ...initialUser, name: initialUser.id === 'u1' ? 'Alex' : 'Admin', email: 'test@example.org' }));
  }, { user });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/v1/tenant/current') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    } else if (request.method() === 'GET' && url.pathname === '/api/v1/bender/posts') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [post], next_cursor: null, has_more: false }) });
    } else if (request.method() === 'POST' && url.pathname === '/api/v1/bender/link-preview') {
      const sourceUrl = (request.postDataJSON() as { url: string }).url;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ preview_token: 'draft-token', preview: { source_url: sourceUrl, url: sourceUrl, title: 'New preview', description: null, site_name: null, image_url: null } }) });
    } else if (request.method() === 'PATCH' && url.pathname === '/api/v1/bender/posts/p-edit') {
      const body = request.postDataJSON() as { caption: string; preview_token: string };
      expect(body).toEqual({ caption: 'Updated https://example.org/new', preview_token: 'draft-token' });
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...post, caption: body.caption, link_preview: { ...post.link_preview, source_url: 'https://example.org/new', url: 'https://example.org/new', title: 'New preview' } }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: null, has_more: false }) });
    }
  });
  await page.goto('/bender');
}

test('author can edit, cancel, and update caption and preview in place', async ({ page }) => {
  await setup(page, { id: 'u1', role: 'individual' });
  const card = page.getByTestId('bender-post');
  await card.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(card.getByTestId('bender-post-editor')).toBeVisible();
  await card.getByRole('button', { name: 'Cancel' }).click();
  await expect(card.getByTestId('bender-caption')).toContainText('Before');
  await card.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await card.getByLabel('Edit caption').fill('Updated https://example.org/new');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByTestId('bender-caption')).toContainText('Updated');
  await expect(card.getByTestId('bender-link-preview')).toContainText('New preview');
  await expect(card.getByTestId('bender-media')).toBeVisible();
  await expect(card.getByTestId('bender-actions')).toContainText('3');
  await expect(card.getByTestId('bender-comments-link')).toContainText('1 comment');
});

test('non-author tenant admin cannot edit another author post', async ({ page }) => {
  await setup(page, { id: 'u2', role: 'community_admin' });
  const card = page.getByTestId('bender-post');
  await card.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(1);
});
