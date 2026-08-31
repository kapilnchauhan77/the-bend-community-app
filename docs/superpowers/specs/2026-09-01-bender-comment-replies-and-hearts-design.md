# Bender Comment Replies and Hearts Design

**Status:** Approved in chat, written review pending
**Date:** 2026-09-01
**Target:** Bender comments on all Bend tenants

## Summary

Bender comments will support one level of replies and a simple heart reaction. Signed-in users may heart parent comments and replies, reply directly beneath a top-level comment, and remove their own contributions under the existing moderation rules. Comment authors receive an in-app notification when another user replies to them. Hearts never create notifications.

The change extends the current Bender comment flow rather than creating a separate reply subsystem. Replies remain `BenderComment` rows with a nullable self-reference. Comment responses gain additive threading, deletion, and heart fields, preserving existing clients and top-level comment creation.

## Goals

- Let a signed-in user reply directly to a top-level Bender comment.
- Keep threads to one reply level for a clean mobile experience.
- Let a signed-in user add or remove one heart on any non-deleted comment or reply.
- Notify the parent comment author when another user replies.
- Preserve replies when their parent is deleted by showing `Comment deleted` in place of the removed text.
- Keep comment and heart counts correct under retries and concurrent requests.
- Apply the post's tenant visibility and same-post boundaries to every comment mutation.
- Keep existing Bender posts, post likes, link previews, and older API clients compatible.

## Non-goals

- Emoji reaction choices or reactions other than a heart.
- Replies to replies or arbitrarily nested threads.
- Comment editing.
- Showing a list of users who reacted.
- Notifications for hearts or self-replies.
- Push notifications, email notifications, or real-time WebSocket updates.
- Changing post reaction behavior.
- Redesigning the Bender feed or composer.
- Deployment. Release work requires a separate explicit request.

## Current state

- `bender_comments` stores only `post_id`, `user_id`, `content`, and `created_at`.
- Comments are returned as one ascending cursor-paginated list.
- `BenderCommentResponse` contains only id, author, content, and creation time.
- The frontend supports optimistic top-level comment creation and deletion.
- Posts have idempotent binary likes, but comments have no reaction records or counters.
- The notification center supports typed in-app notifications and data-driven navigation, but has no Bender reply type.

## Approved behavior

### Replying

1. A signed-in user may select Reply on a non-deleted top-level comment.
2. The UI opens one compact inline composer beneath that parent and labels it `Replying to <display name>`.
3. Send creates a normal Bender comment with `parent_comment_id` set to the selected parent. Cancel closes the composer without changing the draft elsewhere.
4. The backend accepts the reply only when the parent exists, belongs to the same post, is top-level, is not deleted, and is visible in the current tenant.
5. A reply cannot itself be a parent. Attempts to reply to a reply return `422` with code `BUSINESS_RULE_VIOLATION` and message `Replies can only target top-level comments`.
6. Parent comments appear oldest first. Replies appear directly beneath their parent, also oldest first.
7. Creating a top-level comment or reply increments the post's `comment_count` once.

### Hearts

1. Every non-deleted parent comment and reply shows a heart control and count.
2. Each user may have at most one heart per comment.
3. Heart and unheart endpoints are idempotent. Repeating the same request leaves the count unchanged.
4. The UI updates optimistically and restores the previous state if the request fails.
5. Deleted comment placeholders cannot receive hearts. Soft-deleting a parent removes its existing hearts and resets its cached heart count to zero.
6. Signed-out visitors may read heart counts but do not receive interactive heart or Reply controls.

### Deletion

Existing authorization remains: the comment author, post author, a same-tenant community admin, or a super admin may delete a comment.

- A top-level comment with no replies is deleted normally.
- A top-level comment with replies becomes a tombstone in the same transaction: its original content is erased, `deleted_at` is set, its hearts are removed, and its cached heart count becomes zero.
- The API returns the exact content `Comment deleted` with `is_deleted: true` for a tombstone. The original text is never returned.
- A tombstone keeps its stable id and position so existing replies remain grouped beneath it.
- A reply is always deleted normally because replies cannot have children.
- When deletion removes the final reply beneath a tombstone, the now-empty tombstone is also deleted.
- The post's `comment_count` counts non-deleted user-authored comments and replies, not tombstones. Each deletion decrements it exactly once.
- Repeating deletion of an existing tombstone is an authorized no-op and must not decrement the counter again.

### Reply notifications

- Creating a reply to another user's comment creates one in-app notification in the same database transaction.
- A self-reply creates no notification.
- Hearts create no notifications.
- The notification type is `BENDER_REPLY` in PostgreSQL and `bender_reply` in API responses.
- Copy:
  - Title: `<replier display name> replied to your comment`, using the same shop-name-first display rule as Bender posts and comments.
  - Body: the reply content, truncated to 240 characters.
- Notification data contains `bender_post_id`, `bender_parent_comment_id`, and `bender_comment_id`.
- Selecting the notification opens `/bender?post=<post-id>&comment=<reply-id>`.
- The Bender page loads the target post if necessary, expands its comments, scrolls the target thread into view, and briefly highlights the reply.

## Data model

### `bender_comments`

Add these columns:

| Column | Type | Contract |
| --- | --- | --- |
| `parent_comment_id` | nullable UUID foreign key to `bender_comments.id` | `NULL` for a parent, otherwise references a top-level comment on the same post |
| `like_count` | non-null integer, default `0` | cached number of comment hearts |
| `deleted_at` | nullable datetime | set only for a preserved parent tombstone |

Add an index on `(parent_comment_id, created_at)` for reply grouping. The self-reference uses `ON DELETE CASCADE`, which applies only when a parent is eventually hard-deleted. The service soft-deletes a parent while replies exist.

### `bender_comment_likes`

Create a table with:

- `id`: UUID primary key.
- `comment_id`: UUID foreign key to `bender_comments.id`, `ON DELETE CASCADE`.
- `user_id`: UUID foreign key to `users.id`, `ON DELETE CASCADE`.
- `created_at`: non-null datetime.
- A unique index on `(comment_id, user_id)`.

The unique index is the database-level idempotency boundary. The cached counter is changed only when inserting or deleting the unique row changes persistent state.

### Notification enum

Add `BENDER_REPLY` to the PostgreSQL `notification_type` enum and the Python `NotificationType` enum. Use a dedicated Alembic revision after the comment schema revision because PostgreSQL enum values have special transaction and downgrade behavior. Downgrade leaves the enum value in place, matching the repository's established enum migration pattern.

## API contracts

All routes remain under `/api/v1/bender`. Public reads resolve the current tenant. Mutations require a signed-in user belonging to that tenant. A post, comment, or parent outside the current tenant is returned as not found rather than revealing cross-tenant existence.

### Create a top-level comment or reply

`POST /posts/{post_id}/comments`

Existing top-level request remains valid:

```json
{
  "content": "Thank you for sharing this."
}
```

Reply request adds one optional field:

```json
{
  "content": "I can help with that.",
  "parent_comment_id": "2f48b390-c555-45a2-9338-1dd283c58c88"
}
```

`content` keeps the existing 1 to 1,000 character limit after trimming. `parent_comment_id` must resolve to a non-deleted top-level comment on `{post_id}`.

### List comments

`GET /posts/{post_id}/comments`

The endpoint keeps its ascending cursor pagination and flat `items` array. Every loaded reply includes `parent_comment_id`. The client groups it beneath the parent, which was created and loaded earlier. The cursor continues to cover all comment rows, including replies and tombstones, so existing pagination contracts do not change.

Each item becomes:

```json
{
  "id": "85e66e17-4705-4cdc-89ac-894ba1b67398",
  "author": {
    "id": "fd6b6c9e-6afe-46bc-b6be-2687724b4c44",
    "name": "Alex",
    "avatar_url": null,
    "shop_id": null,
    "shop_name": null
  },
  "content": "I can help with that.",
  "created_at": "2026-09-01T10:15:00Z",
  "parent_comment_id": "2f48b390-c555-45a2-9338-1dd283c58c88",
  "reply_count": 0,
  "like_count": 2,
  "viewer_has_liked": true,
  "is_deleted": false
}
```

For anonymous viewers, `viewer_has_liked` is always false. `reply_count` reports the number of non-deleted direct replies to a parent and is zero for a reply. The service resolves viewer hearts and reply counts for the returned page with bulk queries rather than one query per comment.

### Get one comment for a deep link

`GET /posts/{post_id}/comments/{comment_id}`

This endpoint returns the same `BenderCommentResponse` shape and applies the same tenant and post visibility rules. The notification flow uses it to retrieve a target reply without walking every comment page. When the target is a reply, the client also retrieves its `parent_comment_id` through this endpoint and merges both records into the open drawer.

### Heart a comment

`POST /posts/{post_id}/comments/{comment_id}/like`

Response:

```json
{
  "id": "85e66e17-4705-4cdc-89ac-894ba1b67398",
  "like_count": 3,
  "viewer_has_liked": true
}
```

### Remove a comment heart

`DELETE /posts/{post_id}/comments/{comment_id}/like`

The response has the same shape with `viewer_has_liked: false`. Both routes validate that the comment belongs to `{post_id}` and is visible in the current tenant.

### Delete a comment

`DELETE /posts/{post_id}/comments/{comment_id}` remains the deletion route. It now validates the path's post/comment relationship and applies the hard-delete or tombstone behavior described above.

## Backend design

`BenderService` remains the transaction boundary for post comments. The service will:

- Resolve a visible post using the current tenant before listing or mutating comments.
- Resolve a comment through both `comment_id` and `post_id` to prevent cross-post path mismatches.
- Validate the reply parent in the database transaction before insertion.
- Insert reply notifications through the existing notification persistence model using the same session.
- Bulk-resolve `viewer_has_liked` and `reply_count` when listing a comment page.
- Use a savepoint around unique heart insertion, matching the existing post-like idempotency pattern.
- Use atomic SQL updates for comment and post counters.
- Lock or condition deletion updates so concurrent deletion cannot decrement counts twice.

The API layer supplies the current tenant and optional viewer for reads, and the current tenant plus authenticated user for mutations. Response construction belongs in one service helper so list and create responses apply identical tombstone and reaction rules.

## Frontend design

Move the current comment drawer logic from `BenderPage.tsx` into a focused component under `src/components/features/bender/`. The component owns comment loading, grouping, reply selection, drafts, optimistic updates, and rollback. `BenderPage.tsx` continues to own post state and receives comment-count deltas.

### Comment thread presentation

- Parent comments retain the existing avatar and author presentation.
- Replies use a modest left indent and a subtle thread guide without shrinking the content into an unreadable mobile column.
- The action row shows time, a heart control and count, and Reply for an eligible parent.
- Only one reply composer may be open at a time.
- A deleted parent renders a muted `Comment deleted` placeholder, without heart or Reply controls.
- Comment text and controls use `min-width: 0`, wrapping, and responsive action layout so long names or content cannot overflow the drawer.

### Optimistic state

- Top-level comments and replies receive transient ids and are replaced by the server response.
- Creating a reply immediately inserts it beneath its parent and increments the post count. Failure removes it, restores the draft, and restores the count.
- Heart toggles update `viewer_has_liked` and `like_count` immediately. Failure restores both values.
- Delete removes a normal comment optimistically. A parent whose `reply_count` is greater than zero becomes a local tombstone. Failure restores the complete prior comment collection and post count.

### Deep links

`BenderPage` reads both `post` and `comment` query parameters. When `comment` is present for the targeted post, the post card opens its comments automatically. The drawer retrieves the target comment directly and, for a reply, retrieves its parent before merging them into the current collection. It then scrolls the element carrying that comment id into view and applies a temporary accessible highlight. If the comment no longer exists, the post and comments still open without an error page.

`NotificationsPage` recognizes `bender_post_id` and builds the Bender deep link before applying its generic notification fallbacks.

## Error handling

- A missing, cross-post, cross-tenant, or otherwise invisible parent returns `404` with code `NOT_FOUND` without creating a reply or notification.
- A deleted parent returns `409` with code `CONFLICT` and message `Cannot reply to a deleted comment`.
- A reply-to-reply attempt returns the documented `422` business-rule response and does not create any row.
- A heart on a deleted comment returns `409` with code `CONFLICT`. A heart on an invisible comment returns `404` with code `NOT_FOUND`. Neither changes a counter.
- Duplicate heart and duplicate unheart requests succeed as no-ops.
- Optimistic frontend operations roll back to the exact previous collection or count on request failure.
- A missing deep-linked comment does not block opening the post.

## Testing

### Backend

- Migration structure, indexes, foreign keys, defaults, and notification enum value.
- Existing top-level comment request compatibility.
- Valid one-level reply creation and same-post grouping fields.
- Rejection of replies to replies, deleted parents, another post's comment, and another tenant's comment.
- Reply notification creation for another user, notification data, and self-reply suppression.
- Direct comment retrieval for a valid deep link and rejection across post or tenant boundaries.
- Idempotent comment heart and unheart behavior with atomic counts.
- Bulk viewer-heart resolution for list responses.
- Hard deletion without replies.
- Tombstone deletion with replies, erased content, cleared hearts, preserved replies, and exact counter behavior.
- Final-reply cleanup of an empty tombstone.
- Existing author, post-owner, community-admin, and super-admin deletion permissions.

### Frontend

Add focused Playwright coverage with mocked Bender routes for:

- Creating and cancelling an inline reply.
- Preventing a Reply action on replies and deleted parents.
- Hearting and unhearting a parent and a reply.
- Optimistic rollback for reply, heart, and deletion failures.
- Rendering and preserving replies beneath `Comment deleted`.
- Opening and highlighting a reply from a notification deep link.
- Signed-out read-only behavior.
- Desktop and narrow-mobile containment, keyboard submission, focus labels, and accessible button names.

### Verification commands

- Full backend test suite.
- Focused Bender backend tests.
- Frontend production build.
- Focused Bender Playwright suite in desktop and mobile viewports.
- Existing Bender link-preview Playwright suite to prove the feed card remains compatible.

## Compatibility and rollout

- Database changes are additive for existing comment rows: `parent_comment_id` and `deleted_at` are null, and `like_count` is zero.
- `parent_comment_id` is optional in create requests.
- Comment response fields are additive.
- Existing flat comment pagination and oldest-first reads remain intact.
- Post `comment_count` continues to include top-level comments and now also includes replies.
- No data backfill is needed beyond database defaults.
- The migration must run before the backend version that writes replies or comment hearts.
- Frontend and backend should be released together because the new UI depends on the additive response fields and endpoints.
