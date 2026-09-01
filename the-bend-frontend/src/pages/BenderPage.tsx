import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { CameraCapture, type CameraResult } from '@/components/shared/CameraCapture';
import { BenderLogo } from '@/components/shared/BenderLogo';
import { ShareToMessageButton } from '@/components/features/messages/ShareToMessageButton';
import { useAuthStore } from '@/stores/authStore';
import { resolveAssetUrl } from '@/lib/constants';
import { extractFirstHttpUrl, isSafeHttpUrl } from '@/lib/benderLinks';
import { isVideoUrl, timeAgo } from '@/lib/utils';
import { BenderCaption } from '@/components/features/bender/BenderCaption';
import { BenderLinkPreviewCard } from '@/components/features/bender/BenderLinkPreviewCard';
import { BenderCommentsDrawer } from '@/components/features/bender/BenderCommentsDrawer';
import { benderApi, type CreatePostPayload } from '@/services/benderApi';
import { useBenderLinkPreview } from '@/hooks/useBenderLinkPreview';
import type { BenderPost, BenderAuthor } from '@/types';

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
// BenderPostCard — single Instagram-style post.
// Like toggle is optimistic; reverts on network failure.
// ============================================================================
function BenderPostCard({
  post,
  currentUserId,
  isCommunityAdmin,
  isAuthenticated,
  isHighlighted,
  forceCommentsOpen,
  focusCommentId,
  onDelete,
  onPatch,
  onCountChange,
}: {
  post: BenderPost;
  currentUserId: string | null;
  isCommunityAdmin: boolean;
  isAuthenticated: boolean;
  isHighlighted?: boolean;
  forceCommentsOpen?: boolean;
  focusCommentId?: string | null;
  onDelete: (id: string) => void;
  onPatch: (id: string, patch: Partial<BenderPost>) => void;
  onCountChange: (id: string, delta: number) => void;
}) {
  const navigate = useNavigate();
  const [commentsOpen, setCommentsOpen] = useState(false);
  useEffect(() => {
    if (forceCommentsOpen) setCommentsOpen(true);
  }, [forceCommentsOpen]);

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

  const visiblePreview = post.link_preview && isSafeHttpUrl(post.link_preview.url) ? post.link_preview : null;
  const captionBlock = post.caption ? (
    <BenderCaption
      caption={post.caption}
      authorName={display}
      omittedSourceUrl={visiblePreview?.source_url}
    />
  ) : null;

  return (
    <article
      id={`post-${post.id}`}
      data-testid="bender-post"
      className={`bg-white border border-[hsl(35,18%,88%)] md:rounded-lg overflow-hidden mb-3 transition-shadow duration-300 ${
        isHighlighted
          ? 'ring-2 ring-offset-2 ring-[hsl(35,45%,42%)]'
          : ''
      }`}
    >
      {/* Header row */}
      <div data-testid="bender-post-header" className="flex items-center gap-2 px-3 py-2">
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

      {visiblePreview && captionBlock}
      {visiblePreview && (
        <div data-testid="bender-preview-slot" className="px-3 pb-1 min-w-0">
          <BenderLinkPreviewCard mode="feed" state="ready" preview={visiblePreview} />
        </div>
      )}

      {/* Media (1:1) */}
      {post.media_url && (
        <div data-testid="bender-media" className="relative w-full bg-black aspect-square overflow-hidden">
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
      <div data-testid="bender-actions" className="flex items-center gap-3 px-3 pt-2 pb-1">
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
        {isAuthenticated && (
          <ShareToMessageButton
            refType="bender"
            refId={post.id}
            iconOnly
            iconSize={20}
            variant="ghost"
            className="ml-auto h-auto w-auto p-0 text-[hsl(30,15%,18%)] hover:bg-transparent hover:text-[hsl(160,25%,24%)]"
            label="Send in a message"
          />
        )}
        <button
          onClick={handleShare}
          className={isAuthenticated ? 'cursor-pointer' : 'ml-auto cursor-pointer'}
          aria-label="Share"
        >
          <Share2 size={20} className="text-[hsl(30,15%,18%)]" />
        </button>
      </div>

      {!visiblePreview && captionBlock}

      {/* View comments link */}
      {post.comment_count > 0 && !commentsOpen && (
        <button
          data-testid="bender-comments-link"
          onClick={() => setCommentsOpen(true)}
          className="block px-3 pb-2 pt-0.5 text-[12px] text-[hsl(30,10%,50%)] hover:text-[hsl(30,15%,18%)] cursor-pointer"
        >
          View all {post.comment_count} comment{post.comment_count === 1 ? '' : 's'}
        </button>
      )}

      {commentsOpen && (
        <BenderCommentsDrawer
          postId={post.id}
          currentUserId={currentUserId}
          isCommunityAdmin={isCommunityAdmin}
          onCountChange={(delta) =>
            onCountChange(post.id, delta)
          }
          focusCommentId={focusCommentId}
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

export function BenderComposer({
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
  const submittingRef = useRef(false);
  const [sessionId, setSessionId] = useState(0);
  const sessionRef = useRef(0);
  const composerOpenRef = useRef(open);
  composerOpenRef.current = open;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const linkPreview = useBenderLinkPreview(caption, open);
  const { reset: resetLinkPreview, waitForPreviewToken } = linkPreview;

  // Autosize textarea — grows up to ~12 lines then scrolls.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [caption, open]);

  const advanceSession = useCallback(() => {
    const nextSession = sessionRef.current + 1;
    sessionRef.current = nextSession;
    setSessionId(nextSession);
    return nextSession;
  }, []);

  const isCurrentSession = useCallback((session: number) => (
    sessionRef.current === session && composerOpenRef.current && !submittingRef.current
  ), []);
  const cameraSession = sessionId;

  const closeComposer = useCallback(() => {
    composerOpenRef.current = false;
    advanceSession();
    setCameraOpen(false);
    onClose();
  }, [advanceSession, onClose]);

  // Reset on close so the next open is clean and cannot inherit async work.
  useEffect(() => {
    composerOpenRef.current = open;
    advanceSession();
    if (!open) {
      resetLinkPreview();
      setCaption('');
      setPending(null);
      setError(null);
      setSubmitting(false);
      setCameraOpen(false);
      submittingRef.current = false;
    }
  }, [advanceSession, open, resetLinkPreview]);

  const handleCameraResult = useCallback((result: CameraResult) => {
    if (!isCurrentSession(cameraSession)) return;
    setPending({
      url: result.url,
      thumbnail_url: result.thumbnail_url,
      type: result.type,
    });
    setCameraOpen(false);
  }, [cameraSession, isCurrentSession]);

  const handleCameraClose = useCallback(() => {
    if (!isCurrentSession(cameraSession)) return;
    setCameraOpen(false);
  }, [cameraSession, isCurrentSession]);

  const handleFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const operationSession = sessionRef.current;
      if (!isCurrentSession(operationSession)) return;
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      // Reuse /upload/media via the existing CameraCapture upload path. Since
      // the composer file picker accepts both images + videos and the camera
      // modal handles both modes, we just submit to /upload/media directly.
      const fd = new FormData();
      fd.append('file', file, file.name);
      try {
        const { default: api } = await import('@/services/api');
        if (!isCurrentSession(operationSession)) return;
        const res = await api.post('/upload/media', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (!isCurrentSession(operationSession)) return;
        const data = res.data as Record<string, unknown>;
        setPending({
          url: String(data.url || ''),
          thumbnail_url: (data.thumbnail_url as string | null | undefined) ?? null,
          type: (data.type as 'image' | 'video' | undefined) ?? (file.type.startsWith('video/') ? 'video' : 'image'),
        });
      } catch {
        if (!isCurrentSession(operationSession)) return;
        setError('Could not upload that file. Try a smaller one.');
      }
    },
    [isCurrentSession]
  );

  const canSubmit = (caption.trim().length > 0 || pending !== null) && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submittingRef.current || !composerOpenRef.current) return;
    submittingRef.current = true;
    const submissionSession = advanceSession();
    setSubmitting(true);
    setError(null);
    try {
      const submittedCaption = caption.trim();
      const submittedSourceUrl = extractFirstHttpUrl(submittedCaption);
      const previewToken = await waitForPreviewToken(submittedSourceUrl, 5000);
      if (sessionRef.current !== submissionSession || !composerOpenRef.current) return;
      const payload: CreatePostPayload = {};
      if (submittedCaption) payload.caption = submittedCaption;
      if (previewToken) payload.preview_token = previewToken;
      if (pending) {
        payload.media_url = pending.url;
        if (pending.thumbnail_url) payload.media_thumbnail_url = pending.thumbnail_url;
        payload.media_type = pending.type;
      }
      const res = await benderApi.createPost(payload);
      if (sessionRef.current !== submissionSession || !composerOpenRef.current) return;
      onCreated(res.data);
      submittingRef.current = false;
      resetLinkPreview();
      closeComposer();
    } catch {
      if (sessionRef.current !== submissionSession || !composerOpenRef.current) return;
      setError('Could not post. Please try again.');
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [advanceSession, canSubmit, caption, closeComposer, onCreated, pending, resetLinkPreview, waitForPreviewToken]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center"
        role="dialog"
        aria-modal="true"
        onClick={() => { if (!submitting) closeComposer(); }}
      >
        <div
          className="bg-white w-full md:max-w-md md:rounded-lg shadow-2xl flex flex-col max-h-[90vh] md:max-h-[80vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(35,18%,88%)]">
            <button
              onClick={() => { if (!submitting) closeComposer(); }}
              disabled={submitting}
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
              disabled={submitting}
              placeholder="Write a caption…"
              className="resize-none border-0 shadow-none focus-visible:ring-0 text-[14px] px-0 min-h-[80px]"
              maxLength={MAX_CAPTION}
            />

            {linkPreview.status === 'loading' && (
              <BenderLinkPreviewCard mode="composer" state="loading" />
            )}
            {linkPreview.status === 'success' && linkPreview.preview && (
              <BenderLinkPreviewCard
                mode="composer"
                state="ready"
                preview={linkPreview.preview}
                onRemove={() => { if (!submitting) linkPreview.dismiss(); }}
              />
            )}

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
                  onClick={() => { if (!submitting) setPending(null); }}
                  disabled={submitting}
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
                  onClick={() => { if (!submitting) setCameraOpen(true); }}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-[hsl(30,15%,30%)] border border-[hsl(35,18%,84%)] rounded hover:bg-[hsl(35,15%,94%)] transition-colors cursor-pointer"
                >
                  <Camera size={14} />
                  Camera
                </button>
                <button
                  type="button"
                  onClick={() => { if (!submitting) fileInputRef.current?.click(); }}
                  disabled={submitting}
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
                  disabled={submitting}
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
        key={`bender-camera-${cameraSession}`}
        open={open && cameraOpen && !submitting && sessionRef.current === cameraSession}
        onClose={handleCameraClose}
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
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuthStore();
  const [posts, setPosts] = useState<BenderPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const feedTopRef = useRef<HTMLDivElement>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which `?post=` id we've already scrolled to, so re-renders (e.g.
  // more pages loading) don't keep re-scrolling once the target was found.
  const focusedPostRef = useRef<string | null>(null);
  const attemptedPostIdsRef = useRef(new Set<string>());

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

  // Deep-link focus — a bender reference card in a message links to
  // `/bender?post={id}`. Once the feed has loaded and the target post is
  // actually in the DOM, scroll it into view and briefly ring-highlight it.
  // If the id isn't in the loaded set (later page, or deleted), no-op — we
  // don't force-paginate to find it.
  const focusPostId = searchParams.get('post');
  const focusCommentId = searchParams.get('comment');
  useEffect(() => {
    if (!focusPostId || loading || posts.some((post) => post.id === focusPostId) || attemptedPostIdsRef.current.has(focusPostId)) return;
    attemptedPostIdsRef.current.add(focusPostId);
    benderApi.getPost(focusPostId).then((response) => {
      setPosts((previous) => previous.some((post) => post.id === response.data.id) ? previous : [...previous, response.data]);
    }).catch(() => {
      // A deleted or invisible deep-linked post must not replace the feed.
    });
  }, [focusPostId, loading, posts]);
  useEffect(() => {
    if (!focusPostId || loading) return;
    if (focusedPostRef.current === focusPostId) return;
    const el = document.getElementById(`post-${focusPostId}`);
    if (!el) return;
    focusedPostRef.current = focusPostId;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedPostId(focusPostId);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedPostId(null);
    }, 2000);
  }, [focusPostId, posts, loading]);

  // Clear any pending highlight timeout on unmount.
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

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

  const handleCountChange = useCallback((id: string, delta: number) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, comment_count: Math.max(0, p.comment_count + delta) } : p)));
  }, []);

  return (
    <PageLayout showFooter={false}>
      <div ref={feedTopRef} />
      <div className="w-full max-w-md mx-auto md:py-4">
        {/* Sticky page header */}
        <div className="sticky top-14 z-30 bg-[hsl(40,20%,98%)] border-b border-[hsl(35,18%,88%)] md:rounded-t-lg md:border md:border-b-[hsl(35,18%,88%)]">
          <div className="flex items-center justify-between px-4 py-3">
            <h1 aria-label="Bender" style={{ color: BRONZE }}>
              <BenderLogo className="h-7 w-auto" />
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
                  isHighlighted={post.id === highlightedPostId}
                  forceCommentsOpen={post.id === focusPostId && Boolean(focusCommentId)}
                  focusCommentId={post.id === focusPostId ? focusCommentId : null}
                  onDelete={handleDelete}
                  onPatch={handlePatch}
                  onCountChange={handleCountChange}
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
