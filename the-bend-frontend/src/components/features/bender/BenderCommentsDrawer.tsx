import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MoreHorizontal, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveAssetUrl } from '@/lib/constants';
import { timeAgo } from '@/lib/utils';
import { benderApi } from '@/services/benderApi';
import type { BenderAuthor, BenderComment } from '@/types';

const PRIMARY = 'hsl(160, 25%, 24%)';

function AuthorAvatar({ author, size = 24 }: { author: BenderAuthor; size?: number }) {
  const url = resolveAssetUrl(author.avatar_url || undefined);
  const display = author.shop_name || author.name;
  return <div className="rounded-full overflow-hidden flex items-center justify-center text-white font-semibold shrink-0" style={{ width: size, height: size, backgroundColor: PRIMARY, fontSize: Math.max(10, Math.floor(size * 0.4)) }}>{url ? <img src={url} alt={display} className="w-full h-full object-cover" /> : <span>{(display || '?').charAt(0).toUpperCase()}</span>}</div>;
}

function KebabMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  return <div ref={ref} className="relative"><button type="button" onClick={() => setOpen((value) => !value)} className="p-1 text-[hsl(30,10%,50%)] cursor-pointer" aria-label="More"><MoreHorizontal size={14} /></button>{open && <div className="absolute right-0 top-full mt-1 w-28 bg-white border border-[hsl(35,18%,84%)] shadow-lg z-20 py-1 rounded"><button type="button" onClick={() => { setOpen(false); onDelete(); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left text-[hsl(0,55%,45%)] cursor-pointer"><Trash2 size={13} />Delete</button></div>}</div>;
}

export interface BenderCommentsDrawerProps {
  postId: string;
  currentUserId: string | null;
  isCommunityAdmin: boolean;
  onCountChange: (delta: number) => void;
  focusCommentId?: string | null;
}

const normalize = (comment: BenderComment): BenderComment => ({ parent_comment_id: null, reply_count: 0, like_count: 0, viewer_has_liked: false, is_deleted: false, ...comment });

export function BenderCommentsDrawer({ postId, currentUserId, isCommunityAdmin, onCountChange }: BenderCommentsDrawerProps) {
  const [comments, setComments] = useState<BenderComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async (cursor?: string) => {
    try { const response = await benderApi.listComments(postId, cursor); setComments((previous) => cursor ? [...previous, ...response.data.items.map(normalize)] : response.data.items.map(normalize)); setNextCursor(response.data.next_cursor ?? null); setHasMore(response.data.has_more); } catch { /* keep the drawer usable on a soft read failure */ } finally { setLoading(false); }
  }, [postId]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const parents = useMemo(() => comments.filter((comment) => comment.parent_comment_id === null), [comments]);
  const repliesByParent = useMemo(() => comments.reduce<Record<string, BenderComment[]>>((groups, comment) => { if (comment.parent_comment_id) (groups[comment.parent_comment_id] ??= []).push(comment); return groups; }, {}), [comments]);

  const send = useCallback(async (parentCommentId: string | null) => {
    const value = (parentCommentId ? replyDraft : draft).trim();
    if (!value || sending) return;
    const snapshot = comments;
    const tempId = `tmp-${Date.now()}`;
    const parent = parentCommentId ? comments.find((comment) => comment.id === parentCommentId) : null;
    const optimistic: BenderComment = { id: tempId, author: { id: currentUserId || 'self', name: 'You', avatar_url: null, shop_id: null, shop_name: null }, content: value, created_at: new Date().toISOString(), parent_comment_id: parentCommentId, reply_count: 0, like_count: 0, viewer_has_liked: false, is_deleted: false };
    setSending(true); setComments([...comments, optimistic]);
    if (parentCommentId && parent) setComments((rows) => rows.map((row) => row.id === parentCommentId ? { ...row, reply_count: row.reply_count + 1 } : row));
    if (parentCommentId) setReplyDraft(''); else setDraft('');
    onCountChange(1);
    try { const response = await benderApi.createComment(postId, value, parentCommentId || undefined); setComments((rows) => rows.map((row) => row.id === tempId ? normalize(response.data) : row)); setReplyingToId(null); } catch { setComments(snapshot); if (parentCommentId) setReplyDraft(value); else setDraft(value); onCountChange(-1); } finally { setSending(false); }
  }, [comments, currentUserId, draft, onCountChange, postId, replyDraft, sending]);

  const toggleHeart = useCallback(async (comment: BenderComment) => {
    const wasLiked = comment.viewer_has_liked;
    setComments((rows) => rows.map((row) => row.id === comment.id ? { ...row, viewer_has_liked: !wasLiked, like_count: row.like_count + (wasLiked ? -1 : 1) } : row));
    try { const response = wasLiked ? await benderApi.unlikeComment(postId, comment.id) : await benderApi.likeComment(postId, comment.id); setComments((rows) => rows.map((row) => row.id === comment.id ? { ...row, ...response.data } : row)); } catch { setComments((rows) => rows.map((row) => row.id === comment.id ? { ...row, viewer_has_liked: wasLiked, like_count: comment.like_count } : row)); }
  }, [postId]);

  const deleteComment = useCallback(async (comment: BenderComment) => {
    const snapshot = comments;
    const next = comment.reply_count > 0 ? comments.map((row) => row.id === comment.id ? { ...row, content: 'Comment deleted', like_count: 0, viewer_has_liked: false, is_deleted: true } : row) : comments.filter((row) => row.id !== comment.id);
    setComments(next); onCountChange(-1);
    try { await benderApi.deleteComment(postId, comment.id); } catch { setComments(snapshot); onCountChange(1); }
  }, [comments, onCountChange, postId]);

  const renderComment = (comment: BenderComment, reply = false) => {
    const display = comment.author.shop_name || comment.author.name;
    const canDelete = isCommunityAdmin || (currentUserId !== null && comment.author.id === currentUserId);
    return <li data-testid={`bender-comment-${comment.id}`} className={`flex gap-2 items-start min-w-0 ${reply ? 'ml-6 border-l border-[hsl(35,18%,84%)] pl-3' : ''}`}><AuthorAvatar author={comment.author} /><div className="flex-1 min-w-0"><div className="text-[13px] leading-snug break-words"><span className="font-semibold text-[hsl(30,15%,18%)] break-words">{display}</span>{' '}<span className={comment.is_deleted ? 'text-[hsl(30,10%,55%)] italic' : 'text-[hsl(30,10%,30%)]'}>{comment.content}</span></div><div className="flex flex-wrap items-center gap-3 text-[10px] text-[hsl(30,10%,55%)] mt-1"><span>{timeAgo(comment.created_at)}</span>{currentUserId && !comment.is_deleted && <><button type="button" onClick={() => toggleHeart(comment)} className="flex items-center gap-1 cursor-pointer" aria-label={comment.viewer_has_liked ? 'Unlike comment' : 'Like comment'}><Heart size={13} className={comment.viewer_has_liked ? 'fill-[hsl(0,75%,55%)] text-[hsl(0,75%,55%)]' : ''} />{comment.like_count > 0 && <span>{comment.like_count}</span>}</button>{!reply && <button type="button" onClick={() => { setReplyingToId(comment.id); setReplyDraft(''); }} className="cursor-pointer">Reply</button>}</>}</div></div>{canDelete && !comment.is_deleted && <KebabMenu onDelete={() => deleteComment(comment)} />}</li>;
  };

  return <div data-testid="bender-comments-drawer" className="border-t border-[hsl(35,18%,90%)] bg-[hsl(40,20%,98%)] min-w-0"><div className="max-h-80 overflow-y-auto px-3 py-2 min-w-0">{loading ? <div className="space-y-2 py-2">{[0, 1, 2].map((i) => <div key={i} className="flex gap-2"><Skeleton className="h-6 w-6 rounded-full" /><Skeleton className="h-4 flex-1" /></div>)}</div> : comments.length === 0 ? <p className="text-center text-xs text-[hsl(30,10%,50%)] py-4">No comments yet. Be the first.</p> : <ul className="space-y-3 py-1 min-w-0">{parents.map((parent) => <li key={parent.id} className="space-y-2 min-w-0">{renderComment(parent)}{!parent.is_deleted && replyingToId === parent.id && currentUserId && <div data-testid={`bender-reply-composer-${parent.id}`} className="ml-6 pl-3 flex flex-wrap items-end gap-2 min-w-0"><div className="text-xs text-[hsl(30,10%,50%)] w-full">Replying to {parent.author.shop_name || parent.author.name}</div><Textarea value={replyDraft} onChange={(event) => setReplyDraft(event.target.value.slice(0, 1000))} placeholder="Write a reply…" className="min-w-0 flex-1 min-h-8 h-8 text-[13px]" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(parent.id); } }} /><Button type="button" disabled={!replyDraft.trim() || sending} onClick={() => send(parent.id)} className="h-8 text-white" style={{ backgroundColor: PRIMARY }}> <Send size={14} /> Send Reply</Button><Button type="button" variant="ghost" onClick={() => { setReplyingToId(null); setReplyDraft(''); }} className="h-8">Cancel</Button></div>}{(repliesByParent[parent.id] ?? []).map((reply) => renderComment(reply, true))}</li>)}{hasMore && <li className="text-center"><button type="button" onClick={() => load(nextCursor || undefined)} className="text-[11px] text-[hsl(35,45%,42%)] cursor-pointer">Load more</button></li>}</ul>}</div>{currentUserId && <div className="flex flex-wrap items-end gap-2 px-3 py-2 border-t border-[hsl(35,18%,90%)] bg-white min-w-0"><Textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 1000))} placeholder="Add a comment…" className="min-w-0 flex-1 min-h-8 h-8 text-[13px]" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(null); } }} /><Button type="button" disabled={!draft.trim() || sending} onClick={() => send(null)} className="h-8 w-8 text-white" style={{ backgroundColor: PRIMARY }} aria-label="Send comment"><Send size={14} /></Button></div>}</div>;
}
