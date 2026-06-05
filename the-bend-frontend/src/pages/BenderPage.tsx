import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Plus,
  X,
  Camera,
  Send,
  ImageIcon,
  Trash2,
  Play,
} from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { CameraCapture, type CameraResult } from '@/components/shared/CameraCapture';
import { useAuthStore } from '@/stores/authStore';
import { resolveAssetUrl } from '@/lib/constants';
import { isVideoUrl, timeAgo } from '@/lib/utils';
import { benderApi, type CreatePostPayload } from '@/services/benderApi';
import type { BenderPost, BenderComment, BenderAuthor } from '@/types';

const BRONZE = 'hsl(35, 45%, 42%)';
const PRIMARY = 'hsl(160, 25%, 24%)';
const MAX_CAPTION = 2000;

// ============================================================================
// Avatar — small reusable avatar with the same fallback rules used elsewhere
// (first letter of shop name OR display name, primary-green background).
// ============================================================================
function AuthorAvatar({
  author,
  size = 28,
}: {
  author: BenderAuthor;
  size?: number;
}) {
  const url = resolveAssetUrl(author.avatar_url || undefined);
  const display = author.shop_name || author.name;
  const initial = (display || '?').charAt(0).toUpperCase();
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center text-white font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: PRIMARY,
        fontSize: Math.max(10, Math.floor(size * 0.4)),
      }}
    >
      {url ? (
        <img src={url} alt={display} className="w-full h-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

// ============================================================================
// Inline kebab menu — used by both posts and comments to avoid duplicating the
// outside-click + open/close boilerplate.
// ============================================================================
function KebabMenu({
  items,
  iconSize = 16,
}: {
  items: { label: string; onClick: () => void; destructive?: boolean }[];
  iconSize?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1 text-[hsl(30,10%,50%)] hover:text-[hsl(30,15%,18%)] transition-colors cursor-pointer"
        aria-label="More"
      >
        <MoreHorizontal size={iconSize} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-[hsl(35,18%,84%)] shadow-lg z-20 py-1 rounded">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors cursor-pointer ${
                item.destructive
                  ? 'text-[hsl(0,55%,45%)] hover:bg-[hsl(0,50%,97%)]'
                  : 'text-[hsl(30,10%,35%)] hover:bg-[hsl(35,15%,94%)]'
              }`}
            >
              {item.destructive && <Trash2 size={13} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CommentsDrawer — inline (slides in below the post via display toggle, not a
// portal) so the post card itself grows. This avoids covering the next post.
// Comments are ASC; new optimistic appends sit at the bottom — natural.
// ============================================================================
function CommentsDrawer({
  postId,
  currentUserId,
  isCommunityAdmin,
  onCountChange,
}: {
  postId: string;
  currentUserId: string | null;
  isCommunityAdmin: boolean;
  onCountChange: (delta: number) => void;
}) {
  const [comments, setComments] = useState<BenderComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(
    async (cursor?: string) => {
      try {
        const res = await benderApi.listComments(postId, cursor);
        const items = res.data.items;
        setComments((prev) => (cursor ? [...prev, ...items] : items));
        setNextCursor(res.data.next_cursor ?? null);
        setHasMore(res.data.has_more);
      } catch {
        // Soft-fail — drawer just shows empty state.
      } finally {
        setLoading(false);
      }
    },
    [postId]
  );

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    // Optimistic insert with a transient id; replaced on server response.
    const tempId = `tmp-${Date.now()}`;
    const optimistic: BenderComment = {
      id: tempId,
      author: {
        id: currentUserId || 'self',
        name: 'You',
        avatar_url: null,
        shop_id: null,
        shop_name: null,
      },
      content,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimistic]);
    setDraft('');
    onCountChange(1);
    try {
      const res = await benderApi.createComment(postId, content);
      setComments((prev) =>
        prev.map((c) => (c.id === tempId ? res.data : c))
      );
    } catch {
      // Roll back on failure.
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      setDraft(content);
      onCountChange(-1);
    } finally {
      setSending(false);
    }
  }, [draft, sending, postId, currentUserId, onCountChange]);

  const handleDelete = useCallback(
    async (commentId: string) => {
      const previous = comments;
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onCountChange(-1);
      try {
        await benderApi.deleteComment(postId, commentId);
      } catch {
        // Restore on failure.
        setComments(previous);
        onCountChange(1);
      }
    },
    [comments, postId, onCountChange]
  );

  return (
    <div className="border-t border-[hsl(35,18%,90%)] bg-[hsl(40,20%,98%)]">
      <div className="max-h-80 overflow-y-auto px-3 py-2">
        {loading ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-2 items-start">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <p className="text-center text-xs text-[hsl(30,10%,50%)] py-4">
            No comments yet. Be the first.
          </p>
        ) : (
          <ul className="space-y-2 py-1">
            {comments.map((c) => {
              const canDelete =
                isCommunityAdmin ||
                (currentUserId !== null && c.author.id === currentUserId);
              const display = c.author.shop_name || c.author.name;
              return (
                <li key={c.id} className="flex gap-2 items-start group">
                  <AuthorAvatar author={c.author} size={24} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] leading-snug">
                      <span className="font-semibold text-[hsl(30,15%,18%)]">
                        {display}
                      </span>{' '}
                      <span className="text-[hsl(30,10%,30%)]">{c.content}</span>
                    </div>
                    <div className="text-[10px] text-[hsl(30,10%,55%)] mt-0.5">
                      {timeAgo(c.created_at)}
                    </div>
                  </div>
                  {canDelete && (
                    <KebabMenu
                      iconSize={14}
                      items={[
                        {
                          label: 'Delete',
                          onClick: () => handleDelete(c.id),
                          destructive: true,
                        },
                      ]}
                    />
                  )}
                </li>
              );
            })}
            {hasMore && (
              <li className="text-center">
                <button
                  onClick={() => load(nextCursor || undefined)}
                  className="text-[11px] text-[hsl(35,45%,42%)] hover:underline cursor-pointer"
                >
                  Load more
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      {currentUserId && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[hsl(35,18%,90%)] bg-white">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
            placeholder="Add a comment…"
            className="flex-1 h-8 text-[13px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            disabled={!draft.trim() || sending}
            onClick={handleSend}
            className="h-8 w-8 text-white"
            style={{ backgroundColor: PRIMARY }}
            aria-label="Send comment"
          >
            <Send size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BenderPostCard — single Instagram-style post.
// Like toggle is optimistic; reverts on network failure.
// ============================================================================
function BenderPostCard({
  post,
  currentUserId,
  isCommunityAdmin,
  isAuthenticated,
  onDelete,
  onPatch,
}: {
  post: BenderPost;
  currentUserId: string | null;
  isCommunityAdmin: boolean;
  isAuthenticated: boolean;
  onDelete: (id: string) => void;
  onPatch: (id: string, patch: Partial<BenderPost>) => void;
}) {
  const navigate = useNavigate();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  const display = post.author.shop_name || post.author.name;
  const canDelete =
    isCommunityAdmin ||
    (currentUserId !== null && post.author.id === currentUserId);

  // Detect video either via the explicit media_type (preferred) or by the URL
  // suffix when the backend didn't fill in media_type (older records).
  const isVideo = useMemo(() => {
    if (post.media_type === 'video') return true;
    if (post.media_type === 'image') return false;
    return isVideoUrl(post.media_url);
  }, [post.media_type, post.media_url]);

  const handleLikeToggle = useCallback(async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    const wasLiked = post.viewer_has_liked;
    // Optimistic — bump count + flip flag locally before the network round-trip.
    onPatch(post.id, {
      viewer_has_liked: !wasLiked,
      like_count: post.like_count + (wasLiked ? -1 : 1),
    });
    try {
      if (wasLiked) {
        await benderApi.unlike(post.id);
      } else {
        await benderApi.like(post.id);
      }
    } catch {
      // Revert.
      onPatch(post.id, {
        viewer_has_liked: wasLiked,
        like_count: post.like_count,
      });
    }
  }, [post, isAuthenticated, navigate, onPatch]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/bender#post-${post.id}`;
    const title = `${display} on Bender`;
    const text = post.caption || `${display} posted on Bender`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  }, [post.id, post.caption, display]);

  const handleDeletePost = useCallback(async () => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await benderApi.deletePost(post.id);
      onDelete(post.id);
    } catch {
      // Soft-fail — the post stays. UI doesn't block.
    }
  }, [post.id, onDelete]);

  const captionTooLong = (post.caption?.length ?? 0) > 140;

  return (
    <article
      id={`post-${post.id}`}
      className="bg-white border border-[hsl(35,18%,88%)] md:rounded-lg overflow-hidden mb-3"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <AuthorAvatar author={post.author} size={28} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[hsl(30,15%,18%)] truncate">
            {display}
          </p>
        </div>
        <span className="text-[11px] text-[hsl(30,10%,55%)] shrink-0">
          {timeAgo(post.created_at)}
        </span>
        {canDelete && (
          <KebabMenu
            items={[
              {
                label: 'Delete',
                onClick: handleDeletePost,
                destructive: true,
              },
            ]}
          />
        )}
      </div>

      {/* Media (1:1) */}
      {post.media_url && (
        <div className="relative w-full bg-black aspect-square overflow-hidden">
          {isVideo ? (
            <video
              controls
              preload="metadata"
              poster={resolveAssetUrl(post.media_thumbnail_url)}
              src={resolveAssetUrl(post.media_url)}
              className="w-full h-full object-cover"
              playsInline
            />
          ) : (
            <img
              src={resolveAssetUrl(post.media_url)}
              alt={post.caption || 'Post'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-3 px-3 pt-2 pb-1">
        <button
          onClick={handleLikeToggle}
          className="flex items-center gap-1 cursor-pointer transition-transform active:scale-90"
          aria-label={post.viewer_has_liked ? 'Unlike' : 'Like'}
        >
          <Heart
            size={22}
            className={
              post.viewer_has_liked
                ? 'fill-[hsl(0,75%,55%)] text-[hsl(0,75%,55%)]'
                : 'text-[hsl(30,15%,18%)]'
            }
          />
          {post.like_count > 0 && (
            <span className="text-[13px] font-medium text-[hsl(30,15%,18%)]">
              {post.like_count}
            </span>
          )}
        </button>
        <button
          onClick={() => setCommentsOpen((v) => !v)}
          className="flex items-center gap-1 cursor-pointer"
          aria-label="Comments"
        >
          <MessageCircle size={22} className="text-[hsl(30,15%,18%)]" />
          {post.comment_count > 0 && (
            <span className="text-[13px] font-medium text-[hsl(30,15%,18%)]">
              {post.comment_count}
            </span>
          )}
        </button>
        <button
          onClick={handleShare}
          className="ml-auto cursor-pointer"
          aria-label="Share"
        >
          <Share2 size={20} className="text-[hsl(30,15%,18%)]" />
        </button>
      </div>

      {/* Caption */}
      {post.caption && (
        <div className="px-3 pt-1 pb-1 text-[13px] leading-snug">
          <span className="font-semibold text-[hsl(30,15%,18%)] mr-1">
            {display}
          </span>
          <span
            className={`text-[hsl(30,10%,28%)] whitespace-pre-wrap ${
              !captionExpanded && captionTooLong ? 'line-clamp-2' : ''
            }`}
          >
            {post.caption}
          </span>
          {captionTooLong && !captionExpanded && (
            <button
              onClick={() => setCaptionExpanded(true)}
              className="text-[hsl(30,10%,55%)] text-[12px] ml-1 cursor-pointer hover:underline"
            >
              more
            </button>
          )}
        </div>
      )}

      {/* View comments link */}
      {post.comment_count > 0 && !commentsOpen && (
        <button
          onClick={() => setCommentsOpen(true)}
          className="block px-3 pb-2 pt-0.5 text-[12px] text-[hsl(30,10%,50%)] hover:text-[hsl(30,15%,18%)] cursor-pointer"
        >
          View all {post.comment_count} comment{post.comment_count === 1 ? '' : 's'}
        </button>
      )}

      {commentsOpen && (
        <CommentsDrawer
          postId={post.id}
          currentUserId={currentUserId}
          isCommunityAdmin={isCommunityAdmin}
          onCountChange={(delta) =>
            onPatch(post.id, { comment_count: Math.max(0, post.comment_count + delta) })
          }
        />
      )}
    </article>
  );
}

// ============================================================================
// BenderComposer — the floating "+" modal. Caption + optional media (camera
// capture OR file picker). Submits to benderApi.createPost and prepends the
// returned post via the supplied callback.
// ============================================================================
type PendingMedia = {
  url: string;
  thumbnail_url: string | null;
  type: 'image' | 'video';
};

function BenderComposer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (post: BenderPost) => void;
}) {
  const [caption, setCaption] = useState('');
  const [pending, setPending] = useState<PendingMedia | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autosize textarea — grows up to ~12 lines then scrolls.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [caption, open]);

  // Reset on close so the next open is clean.
  useEffect(() => {
    if (!open) {
      setCaption('');
      setPending(null);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleCameraResult = useCallback((result: CameraResult) => {
    setPending({
      url: result.url,
      thumbnail_url: result.thumbnail_url,
      type: result.type,
    });
    setCameraOpen(false);
  }, []);

  const handleFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      // Reuse /upload/media via the existing CameraCapture upload path. Since
      // the composer file picker accepts both images + videos and the camera
      // modal handles both modes, we just submit to /upload/media directly.
      const { default: api } = await import('@/services/api');
      const fd = new FormData();
      fd.append('file', file, file.name);
      try {
        const res = await api.post('/upload/media', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const data = res.data as Record<string, unknown>;
        setPending({
          url: String(data.url || ''),
          thumbnail_url: (data.thumbnail_url as string | null | undefined) ?? null,
          type: (data.type as 'image' | 'video' | undefined) ?? (file.type.startsWith('video/') ? 'video' : 'image'),
        });
      } catch {
        setError('Could not upload that file. Try a smaller one.');
      }
    },
    []
  );

  const canSubmit = (caption.trim().length > 0 || pending !== null) && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: CreatePostPayload = {};
      if (caption.trim()) payload.caption = caption.trim();
      if (pending) {
        payload.media_url = pending.url;
        if (pending.thumbnail_url) payload.media_thumbnail_url = pending.thumbnail_url;
        payload.media_type = pending.type;
      }
      const res = await benderApi.createPost(payload);
      onCreated(res.data);
      onClose();
    } catch {
      setError('Could not post. Please try again.');
      setSubmitting(false);
    }
  }, [canSubmit, caption, pending, onCreated, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center"
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <div
          className="bg-white w-full md:max-w-md md:rounded-lg shadow-2xl flex flex-col max-h-[90vh] md:max-h-[80vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(35,18%,88%)]">
            <button
              onClick={onClose}
              className="text-[hsl(30,10%,40%)] hover:text-[hsl(30,15%,18%)] cursor-pointer"
              aria-label="Cancel"
            >
              <X size={20} />
            </button>
            <h2 className="font-serif text-[16px] font-semibold text-[hsl(30,15%,18%)]">
              New post
            </h2>
            <Button
              type="button"
              size="sm"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="text-white text-[12px] tracking-wide uppercase"
              style={{ backgroundColor: BRONZE }}
            >
              {submitting ? 'Posting…' : 'Post'}
            </Button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <Textarea
              ref={textareaRef}
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))}
              placeholder="Write a caption…"
              className="resize-none border-0 shadow-none focus-visible:ring-0 text-[14px] px-0 min-h-[80px]"
              maxLength={MAX_CAPTION}
            />

            {pending && (
              <div className="relative w-full max-w-[240px] aspect-square bg-black rounded overflow-hidden">
                {pending.type === 'video' ? (
                  <>
                    {pending.thumbnail_url ? (
                      <img
                        src={resolveAssetUrl(pending.thumbnail_url)}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={resolveAssetUrl(pending.url)}
                        className="w-full h-full object-cover"
                        muted
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                        <Play size={18} className="text-white ml-0.5" fill="white" />
                      </div>
                    </div>
                  </>
                ) : (
                  <img
                    src={resolveAssetUrl(pending.url)}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                )}
                <button
                  onClick={() => setPending(null)}
                  className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer"
                  aria-label="Remove media"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {!pending && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-[hsl(30,15%,30%)] border border-[hsl(35,18%,84%)] rounded hover:bg-[hsl(35,15%,94%)] transition-colors cursor-pointer"
                >
                  <Camera size={14} />
                  Camera
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-[hsl(30,15%,30%)] border border-[hsl(35,18%,84%)] rounded hover:bg-[hsl(35,15%,94%)] transition-colors cursor-pointer"
                >
                  <ImageIcon size={14} />
                  Pick from library
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleFilePicked}
                />
              </div>
            )}

            {error && (
              <p className="text-[12px] text-[hsl(0,55%,45%)]">{error}</p>
            )}

            <p className="text-[11px] text-[hsl(30,10%,55%)] text-right">
              {caption.length}/{MAX_CAPTION}
            </p>
          </div>
        </div>
      </div>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptured={handleCameraResult}
        mode="both"
      />
    </>
  );
}

// ============================================================================
// BenderPage — main feed.
// ============================================================================
export default function BenderPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [posts, setPosts] = useState<BenderPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const feedTopRef = useRef<HTMLDivElement>(null);

  const isCommunityAdmin = user?.role === 'community_admin';

  const fetchPage = useCallback(
    async (currentCursor?: string) => {
      const isFirst = !currentCursor;
      if (isFirst) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await benderApi.listPosts(currentCursor);
        const newItems = res.data.items;
        setPosts((prev) => {
          if (isFirst) return newItems;
          // Dedupe — defensive against an optimistic insert that the server
          // later returns mid-pagination.
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...newItems.filter((p) => !seen.has(p.id))];
        });
        setCursor(res.data.next_cursor ?? null);
        setHasMore(res.data.has_more);
      } catch {
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  // Initial load.
  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  // IntersectionObserver — load next page when sentinel scrolls into view.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || loadingMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore && cursor) {
          fetchPage(cursor);
        }
      },
      { rootMargin: '320px' }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [cursor, hasMore, loading, loadingMore, fetchPage]);

  const handleComposerClick = useCallback(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setComposerOpen(true);
  }, [isAuthenticated, navigate]);

  const handleCreated = useCallback((post: BenderPost) => {
    setPosts((prev) => [post, ...prev]);
    // After prepending, scroll up so the user sees their fresh post. Otherwise
    // the new content jumps in above the viewport and feels invisible.
    requestAnimationFrame(() => {
      feedTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handlePatch = useCallback((id: string, patch: Partial<BenderPost>) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  return (
    <PageLayout showFooter={false}>
      <div ref={feedTopRef} />
      <div className="w-full max-w-md mx-auto md:py-4">
        {/* Sticky page header */}
        <div className="sticky top-14 z-30 bg-[hsl(40,20%,98%)] border-b border-[hsl(35,18%,88%)] md:rounded-t-lg md:border md:border-b-[hsl(35,18%,88%)]">
          <div className="flex items-center justify-between px-4 py-3">
            <h1
              className="font-serif text-[22px] font-semibold text-[hsl(30,15%,18%)]"
              style={{ letterSpacing: '0.01em' }}
            >
              Bender
            </h1>
            {isAuthenticated && (
              <button
                onClick={handleComposerClick}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                style={{ backgroundColor: BRONZE }}
                aria-label="New post"
              >
                <Plus size={18} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {/* Feed */}
        <div className="md:p-0 pt-2">
          {loading ? (
            <div className="space-y-3 px-0 md:px-0">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white border border-[hsl(35,18%,88%)] md:rounded-lg overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Skeleton className="h-7 w-7 rounded-full" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="w-full aspect-square rounded-none" />
                  <div className="px-3 py-2 space-y-2">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <EmptyState
              icon={<MessageCircle size={32} />}
              title="No posts yet"
              description="Bender is brand new. Share a snapshot of your day to kick things off."
              action={
                isAuthenticated
                  ? {
                      label: 'Be the first to post',
                      onClick: () => setComposerOpen(true),
                    }
                  : {
                      label: 'Sign in to post',
                      onClick: () => navigate('/login'),
                    }
              }
            />
          ) : (
            <>
              {posts.map((post) => (
                <BenderPostCard
                  key={post.id}
                  post={post}
                  currentUserId={user?.id ?? null}
                  isCommunityAdmin={isCommunityAdmin}
                  isAuthenticated={isAuthenticated}
                  onDelete={handleDelete}
                  onPatch={handlePatch}
                />
              ))}
              {hasMore && (
                <div ref={sentinelRef} className="py-6 text-center">
                  {loadingMore && (
                    <span className="text-[11px] text-[hsl(30,10%,55%)]">
                      Loading…
                    </span>
                  )}
                </div>
              )}
              {!hasMore && posts.length > 3 && (
                <p className="text-center text-[11px] text-[hsl(30,10%,55%)] py-6">
                  You're all caught up.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Floating composer button — bottom-right, above the BottomNav. */}
      {isAuthenticated && (
        <button
          onClick={handleComposerClick}
          className="md:hidden fixed bottom-24 right-4 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl z-40 cursor-pointer hover:opacity-90 transition-opacity"
          style={{ backgroundColor: BRONZE }}
          aria-label="New post"
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>
      )}

      <BenderComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={handleCreated}
      />
    </PageLayout>
  );
}
