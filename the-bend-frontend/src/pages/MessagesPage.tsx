import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Send, MessageCircle, Tag, Camera, Paperclip, X, Play, Mic, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { messageApi } from '@/services/messageApi';
import { uploadApi } from '@/services/uploadApi';
import { parseServerDate } from '@/lib/utils';
import { resolveAssetUrl } from '@/lib/constants';
import { useAuthStore } from '@/stores/authStore';
import { useMessageStore } from '@/stores/messageStore';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/shared/EmptyState';
import { CameraCapture, type CameraResult } from '@/components/shared/CameraCapture';
import {
  VoiceNoteRecorder,
  type VoiceNoteResult,
} from '@/components/shared/VoiceNoteRecorder';
import { MessageReferenceCard } from '@/components/features/messages/MessageReferenceCard';
import { ReferencePickerModal } from '@/components/features/messages/ReferencePickerModal';
import type { MessageThread, Message, ReferenceCard } from '@/types';

// Local payload type for a media attachment held in composer state before send.
// 'audio' covers in-app voice notes recorded via VoiceNoteRecorder.
type PendingAttachment = {
  url: string;
  thumbnail_url: string | null;
  type: 'image' | 'video' | 'audio';
  duration_ms?: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const date = parseServerDate(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateLabel(dateStr: string): string {
  const date = parseServerDate(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function groupMessagesByDate(messages: Message[]): Array<{ label: string; messages: Message[] }> {
  const groups: Record<string, Message[]> = {};
  const order: string[] = [];

  for (const msg of messages) {
    const day = parseServerDate(msg.created_at).toDateString();
    if (!groups[day]) {
      groups[day] = [];
      order.push(day);
    }
    groups[day].push(msg);
  }

  return order.map((day) => ({
    label: formatDateLabel(groups[day][0].created_at),
    messages: groups[day],
  }));
}

// ─── Thread List Item ─────────────────────────────────────────────────────────

function ThreadListItem({
  thread,
  isActive,
  currentUserId,
  onClick,
}: {
  thread: MessageThread;
  isActive: boolean;
  currentUserId: string;
  onClick: () => void;
}) {
  const initials = getInitials(thread.other_party.shop_name || thread.other_party.name);
  const lastMsg = thread.last_message;
  const isOwnLastMsg = lastMsg?.sender_id === currentUserId;
  // Phase 2: when the last message is media-only, fall back to a placeholder
  // so the thread list still shows something meaningful.
  const lastPreview = (() => {
    if (!lastMsg) return null;
    const text = lastMsg.content?.trim();
    if (text) return text;
    if (lastMsg.attachment_url) {
      if (lastMsg.attachment_type === 'image') return '📷 Photo';
      if (lastMsg.attachment_type === 'audio') return '🎤 Voice note';
      return '🎥 Video';
    }
    return '';
  })();

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all border-b border-gray-100 hover:bg-gray-50 focus:outline-none ${
        isActive ? 'bg-[hsl(35,15%,94%)] border-l-[3px] border-l-[hsl(35,45%,42%)]' : ''
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar className="w-11 h-11">
          <AvatarFallback
            className="text-sm font-semibold text-white"
            style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
        {thread.unread_count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-500 border-2 border-white" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span
            className={`text-sm font-semibold truncate pr-2 ${
              thread.unread_count > 0 ? 'text-gray-900' : 'text-gray-700'
            }`}
          >
            {thread.other_party.shop_name || thread.other_party.name}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {thread.last_message_at ? formatTimeAgo(thread.last_message_at) : ''}
          </span>
        </div>

        {thread.listing && (
          <div className="flex items-center gap-1 mb-1">
            <Tag size={10} className="text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-400 truncate">{thread.listing.title}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p
            className={`text-xs truncate ${
              thread.unread_count > 0 ? 'font-medium text-gray-700' : 'text-gray-400'
            }`}
          >
            {lastPreview !== null
              ? `${isOwnLastMsg ? 'You: ' : ''}${lastPreview}`
              : 'No messages yet'}
          </p>
          {thread.unread_count > 0 && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-500 hover:bg-blue-500 flex-shrink-0">
              {thread.unread_count > 9 ? '9+' : thread.unread_count}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const time = parseServerDate(message.created_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const hasAttachment = !!message.attachment_url;
  const hasText = !!message.content && message.content.trim().length > 0;
  const resolvedSrc = hasAttachment ? resolveAssetUrl(message.attachment_url) : undefined;
  const resolvedPoster = message.attachment_thumbnail_url
    ? resolveAssetUrl(message.attachment_thumbnail_url)
    : undefined;

  return (
    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} mb-1.5`}>
      {/* Attachment block — sits ABOVE the text bubble (or alone, when text is empty). */}
      {hasAttachment && resolvedSrc && (
        <div className={`mb-1 ${hasText ? '' : ''}`}>
          {message.attachment_type === 'image' ? (
            <img
              src={resolvedSrc}
              alt="Attached photo"
              className="max-w-[240px] max-h-[300px] rounded-lg cursor-pointer object-cover shadow-sm"
              onClick={() => window.open(resolvedSrc, '_blank', 'noopener,noreferrer')}
            />
          ) : message.attachment_type === 'audio' ? (
            <audio
              controls
              preload="metadata"
              src={resolvedSrc}
              className="max-w-[280px]"
            />
          ) : (
            <video
              controls
              preload="metadata"
              playsInline
              poster={resolvedPoster}
              src={resolvedSrc}
              className="max-w-[280px] max-h-[320px] rounded-lg bg-black shadow-sm"
            />
          )}
        </div>
      )}

      {/* Reference card — links back to a listing/shop/bender/user shared in this message. */}
      {message.reference && (
        <div className="mb-1 max-w-[240px]">
          <MessageReferenceCard card={message.reference} />
        </div>
      )}

      {/* Text bubble — render only when there's text. The timestamp lives here. */}
      {hasText && (
        <div
          className={`max-w-[72%] px-3.5 py-2.5 rounded-2xl shadow-sm ${
            isOwn
              ? 'text-white rounded-br-sm'
              : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
          }`}
          style={isOwn ? { backgroundColor: 'hsl(160, 25%, 24%)' } : {}}
        >
          <p className="text-sm leading-relaxed break-words">{message.content}</p>
          <p
            className={`text-[10px] mt-1 ${
              isOwn ? 'text-[hsl(35,15%,90%)] text-right' : 'text-gray-400'
            }`}
          >
            {time}
          </p>
        </div>
      )}

      {/* Media-only message: show the timestamp underneath the attachment so
          the reader still has chronological context. */}
      {hasAttachment && !hasText && (
        <p className={`text-[10px] mt-0.5 ${isOwn ? 'text-gray-400 text-right' : 'text-gray-400'}`}>
          {time}
        </p>
      )}
    </div>
  );
}

// ─── Chat View ────────────────────────────────────────────────────────────────

function ChatView({
  thread,
  messages,
  currentUserId,
  onBack,
  onSend,
  loading,
  initialPendingReference,
  initialPendingMessage,
  onInitialReferenceConsumed,
}: {
  thread: MessageThread;
  messages: Message[];
  currentUserId: string;
  onBack: () => void;
  onSend: (payload: {
    content?: string;
    attachment?: PendingAttachment | null;
    reference?: ReferenceCard | null;
  }) => Promise<void>;
  loading: boolean;
  // A reference pre-attached via navigation state (e.g. from a "Send in a
  // message" button on an entity page). Applied by the dedicated effect
  // below whenever this becomes a new non-null value, then reported back as
  // consumed so the parent clears it and it doesn't reapply later.
  initialPendingReference?: ReferenceCard | null;
  initialPendingMessage?: string;
  onInitialReferenceConsumed?: () => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [pendingReference, setPendingReference] = useState<ReferenceCard | null>(null);
  const [referenceModalOpen, setReferenceModalOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const grouped = groupMessagesByDate(messages);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    input.style.overflowY = input.scrollHeight > 160 ? 'auto' : 'hidden';
  }, [inputValue]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [thread.id]);

  // Reset composer state when switching threads.
  useEffect(() => {
    setPendingAttachment(null);
    setPendingReference(null);
    setAttachmentError(null);
    setInputValue('');
  }, [thread.id]);

  // Apply a reference handed in via navigation state (e.g. a "Send in a
  // message" button on an entity page) whenever the parent supplies one.
  // This is intentionally a SEPARATE effect from the thread-reset effect
  // above, keyed on `initialPendingReference` itself rather than `thread.id`:
  // when the target thread is already the active thread (the Zustand
  // `activeThread` persists across route changes), `thread.id` never changes
  // across this mount at all, so an effect keyed only on `thread.id` would
  // never see the reference the parent supplies a beat later. Keying on the
  // value itself means it's applied the moment it arrives, regardless of
  // whether the thread was already active or just became active.
  //
  // Clearing any pending media attachment mirrors the mutual exclusion the
  // reference-picker modal's own select handler already enforces. This
  // applies once per non-null value — the parent nulls it out afterward via
  // `onInitialReferenceConsumed`, at which point this effect re-runs (because
  // its dependency changed) but no-ops on the null guard, so there's no
  // re-apply loop.
  useEffect(() => {
    if (!initialPendingReference) return;
    setPendingReference(initialPendingReference);
    setInputValue(initialPendingMessage ?? '');
    setPendingAttachment(null);
    setAttachmentError(null);
    inputRef.current?.focus();
    onInitialReferenceConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPendingReference]);

  async function handleSend() {
    const content = inputValue;
    const hasText = content.trim().length > 0;
    const hasAttachment = !!pendingAttachment;
    const hasReference = !!pendingReference;
    if ((!hasText && !hasAttachment && !hasReference) || sending) return;
    setInputValue('');
    const attachmentToSend = pendingAttachment;
    const referenceToSend = pendingReference;
    setPendingAttachment(null);
    setPendingReference(null);
    setSending(true);
    try {
      await onSend({
        content: hasText ? content : undefined,
        attachment: attachmentToSend,
        reference: referenceToSend,
      });
    } catch {
      // On failure, restore the composer state so the user can retry.
      setInputValue(content);
      setPendingAttachment(attachmentToSend);
      setPendingReference(referenceToSend);
    } finally {
      setSending(false);
    }
  }

  // Reference picker: on select, store the card as the pending reference and
  // clear any pending media attachment — the backend rejects sending both.
  function handleReferenceSelected(card: ReferenceCard) {
    setPendingReference(card);
    setPendingAttachment(null);
    setAttachmentError(null);
  }

  const handleCameraCaptured = useCallback((result: CameraResult) => {
    setPendingAttachment({
      url: result.url,
      thumbnail_url: result.thumbnail_url,
      type: result.type,
      duration_ms: result.duration_ms,
    });
    setPendingReference(null);
    setAttachmentError(null);
    setCameraOpen(false);
  }, []);

  const handleVoiceCaptured = useCallback((result: VoiceNoteResult) => {
    setPendingAttachment({
      url: result.url,
      thumbnail_url: null,
      type: 'audio',
      duration_ms: result.duration_ms,
    });
    setPendingReference(null);
    setAttachmentError(null);
    setVoiceOpen(false);
  }, []);

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setAttachmentError(null);
    setAttachmentUploading(true);
    try {
      const { data } = await uploadApi.uploadMedia(file);
      setPendingAttachment({
        url: data.url,
        thumbnail_url: data.thumbnail_url,
        type: data.type,
        duration_ms: data.duration_ms,
      });
      setPendingReference(null);
    } catch (err) {
      console.error('Attachment upload failed:', err);
      setAttachmentError('Upload failed. Try a smaller file (max 25 MB, 10 s for video).');
    } finally {
      setAttachmentUploading(false);
    }
  };

  const sendEnabled =
    (inputValue.trim().length > 0 || !!pendingAttachment || !!pendingReference) && !sending;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b shadow-sm flex-shrink-0">
        <button
          onClick={onBack}
          className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <Avatar className="w-9 h-9 flex-shrink-0">
          <AvatarFallback
            className="text-xs font-semibold text-white"
            style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}
          >
            {getInitials(thread.other_party.shop_name || thread.other_party.name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate">
            {thread.other_party.shop_name || thread.other_party.name}
          </p>
          {thread.listing && (
            <p className="text-xs text-gray-400 truncate flex items-center gap-1">
              <Tag size={10} />
              {thread.listing.title}
            </p>
          )}
        </div>
      </div>

      {/* Listing reference card */}
      {thread.listing && (
        <div className="mx-4 mt-3 flex-shrink-0">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs bg-[hsl(35,15%,93%)] border-[hsl(35,25%,70%)]"
          >
            <Tag size={12} style={{ color: 'hsl(160, 25%, 24%)' }} />
            <span className="text-gray-600">Re:</span>
            <span className="font-medium text-gray-800 truncate">{thread.listing.title}</span>
            {thread.listing.urgency !== 'normal' && (
              <span
                className={`ml-auto flex-shrink-0 px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide ${
                  thread.listing.urgency === 'urgent'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {thread.listing.urgency}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Messages scroll area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0" ref={scrollRef}>
        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`h-10 rounded-2xl animate-pulse bg-gray-200 ${
                    i % 2 === 0 ? 'w-48' : 'w-36'
                  }`}
                />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
              style={{ backgroundColor: 'hsl(35, 15%, 93%)' }}
            >
              <MessageCircle size={22} style={{ color: 'hsl(160, 25%, 24%)' }} />
            </div>
            <p className="text-sm font-medium text-gray-700">Start the conversation</p>
            <p className="text-xs text-gray-400 mt-1 max-w-[200px]">
              Send a message to get things rolling.
            </p>
          </div>
        ) : (
          <>
            {grouped.map((group) => (
              <div key={group.label}>
                {/* Date separator */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px] font-medium text-gray-400 px-1">{group.label}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                {group.messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwn={msg.sender_id === currentUserId}
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 bg-white border-t px-4 py-3">
        {/* Pending attachment pill — only shown when something's queued. */}
        {pendingAttachment && (
          <div className="mb-2 flex items-center gap-2">
            <div className="relative inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 pr-7 shadow-sm">
              <div className="relative w-12 h-12 rounded-md overflow-hidden bg-black flex-shrink-0">
                {pendingAttachment.type === 'audio' ? (
                  <div className="w-full h-full flex items-center justify-center bg-[hsl(0,84%,60%)]/15 text-red-400">
                    <Mic size={18} />
                  </div>
                ) : pendingAttachment.thumbnail_url ||
                  pendingAttachment.type === 'image' ? (
                  <img
                    src={
                      resolveAssetUrl(
                        pendingAttachment.thumbnail_url || pendingAttachment.url
                      ) || ''
                    }
                    alt="Attachment preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white text-[10px]">
                    Video
                  </div>
                )}
                {pendingAttachment.type === 'video' && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play size={16} className="text-white drop-shadow" />
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-600">
                {pendingAttachment.type === 'image'
                  ? 'Photo'
                  : pendingAttachment.type === 'audio'
                    ? `Voice note${
                        typeof pendingAttachment.duration_ms === 'number'
                          ? ` (${(pendingAttachment.duration_ms / 1000).toFixed(1)}s)`
                          : ''
                      }`
                    : 'Video'}
              </span>
              <button
                type="button"
                onClick={() => setPendingAttachment(null)}
                aria-label="Remove attachment"
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-gray-700/80 hover:bg-gray-900 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Pending reference chip — only shown when a reference is queued.
            Mutually exclusive with the media attachment pill above: the
            backend rejects sending both, so selecting a reference clears any
            pending attachment (and vice versa). */}
        {pendingReference && (
          <div className="mb-2 flex items-center gap-2">
            <div className="relative inline-flex max-w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-3 pr-7 shadow-sm">
              <Tag size={14} className="flex-shrink-0 text-gray-400" />
              <span className="truncate text-xs text-gray-600">
                {pendingReference.title || 'Reference'}
              </span>
              <button
                type="button"
                onClick={() => setPendingReference(null)}
                aria-label="Remove reference"
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-gray-700/80 hover:bg-gray-900 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {attachmentError && (
          <p className="mb-2 text-xs text-red-500">{attachmentError}</p>
        )}

        <div className="mb-2 w-full">
          <Textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              attachmentUploading ? 'Uploading attachment…' : 'Type a message...'
            }
            rows={1}
            className="w-full min-h-[40px] max-h-40 resize-none rounded-xl bg-gray-50 border-gray-200 focus-visible:ring-1 focus-visible:ring-[hsl(35,45%,42%)] text-sm"
            disabled={sending}
          />
        </div>

        <div className="flex w-full items-center gap-2">
          {/* Reference button — opens the search modal. Disabled while a
              media attachment is pending (mutual exclusion). */}
          <button
            type="button"
            onClick={() => setReferenceModalOpen(true)}
            disabled={sending || attachmentUploading || !!pendingAttachment}
            aria-label="Attach reference"
            className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-gray-500 hover:text-[hsl(160,25%,24%)] hover:bg-gray-100 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Plus size={18} />
          </button>

          {/* Camera button — opens the in-app capture modal. Disabled while
              a reference is pending (mutual exclusion). */}
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            disabled={sending || attachmentUploading || !!pendingReference}
            aria-label="Open camera"
            className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-gray-500 hover:text-[hsl(160,25%,24%)] hover:bg-gray-100 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Camera size={18} />
          </button>

          {/* Mic button — opens the voice-note recorder modal. Disabled
              while a reference is pending (mutual exclusion). */}
          <button
            type="button"
            onClick={() => setVoiceOpen(true)}
            disabled={sending || attachmentUploading || !!pendingReference}
            aria-label="Record voice note"
            className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-gray-500 hover:text-[hsl(160,25%,24%)] hover:bg-gray-100 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Mic size={18} />
          </button>

          {/* Paperclip button — triggers the hidden file picker. Disabled
              while a reference is pending (mutual exclusion). */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || attachmentUploading || !!pendingReference}
            aria-label="Attach file"
            className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-gray-500 hover:text-[hsl(160,25%,24%)] hover:bg-gray-100 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Paperclip size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*"
            className="hidden"
            onChange={handlePickFile}
          />

          <Button
            type="button"
            onClick={handleSend}
            disabled={!sendEnabled}
            className="h-10 px-4 flex-shrink-0 transition-all"
            aria-label="Send"
            style={{
              backgroundColor: sendEnabled
                ? 'hsl(160, 25%, 24%)'
                : 'hsl(35, 25%, 70%)',
            }}
          >
            <Send size={16} />
            <span>Send</span>
          </Button>
        </div>
      </div>

      {/* In-app camera modal. Mounted in the tree so its lifecycle is tied
          to the chat view (closing the chat tears it down). */}
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptured={handleCameraCaptured}
        mode="both"
      />

      {/* In-app voice-note recorder. Same lifecycle as CameraCapture. */}
      <VoiceNoteRecorder
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onCaptured={handleVoiceCaptured}
      />

      {/* Reference search modal — same lifecycle as the media pickers. */}
      <ReferencePickerModal
        open={referenceModalOpen}
        onOpenChange={setReferenceModalOpen}
        onSelect={handleReferenceSelected}
      />
    </div>
  );
}

// ─── Thread List Panel ────────────────────────────────────────────────────────

function ThreadListPanel({
  threads,
  activeThreadId,
  currentUserId,
  loading,
  onSelectThread,
}: {
  threads: MessageThread[];
  activeThreadId: string | null;
  currentUserId: string;
  loading: boolean;
  onSelectThread: (thread: MessageThread) => void;
}) {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Panel header */}
      <div className="px-4 py-4 border-b flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-900">Messages</h1>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex flex-col">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5 border-b border-gray-100">
                <div className="w-11 h-11 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3.5 bg-gray-200 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-5/6" />
                </div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <EmptyState
            icon={<MessageCircle size={28} />}
            title="No conversations yet"
            description="When you or a business contacts you about a listing, conversations will appear here."
          />
        ) : (
          threads.map((thread) => (
            <ThreadListItem
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              currentUserId={currentUserId}
              onClick={() => onSelectThread(thread)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { threadId: urlThreadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();

  // A reference pre-attached via a "Send in a message" button on an entity
  // page, carried here as `location.state.pendingReference` ({type, id}) with
  // an editable default message for the composer.
  // We only have the type+id (not a full card), so a minimal ReferenceCard is
  // built — the chip renders from title||type, and the full card comes back
  // from the server after send. Consumed once by ChatView, then cleared here.
  const [navPendingReference, setNavPendingReference] = useState<ReferenceCard | null>(null);
  const [navPendingMessage, setNavPendingMessage] = useState('');

  useEffect(() => {
    const navState = location.state as {
      pendingReference?: { type: string; id: string };
      pendingMessage?: string;
    } | null;
    const pending = navState?.pendingReference;
    if (pending?.type && pending?.id) {
      setNavPendingReference({ type: pending.type as ReferenceCard['type'], id: pending.id });
      setNavPendingMessage(navState?.pendingMessage?.trim() ?? '');
      // Clear the nav state so a refresh or re-navigation to this URL doesn't
      // re-attach the reference.
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    threads,
    activeThread,
    messages,
    setThreads,
    setActiveThread,
    setMessages,
    addMessage,
  } = useMessageStore();

  const [threadsLoading, setThreadsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // On mobile, show chat panel only when a thread is selected
  const [showChat, setShowChat] = useState(false);

  // Fetch threads on mount
  useEffect(() => {
    async function loadThreads() {
      setThreadsLoading(true);
      try {
        const { data } = await messageApi.getThreads();
        const items: MessageThread[] = Array.isArray(data) ? data : (data as { items: MessageThread[] }).items ?? [];
        setThreads(items);

        // If URL has threadId, open that thread
        if (urlThreadId) {
          const found = items.find((t) => t.id === urlThreadId);
          if (found) {
            openThread(found, items);
          }
        }
      } catch (err) {
        console.error('Failed to load threads:', err);
      } finally {
        setThreadsLoading(false);
      }
    }
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openThread = useCallback(
    async (thread: MessageThread, currentThreads?: MessageThread[]) => {
      setActiveThread(thread);
      setShowChat(true);
      navigate(`/messages/${thread.id}`, { replace: true });

      // Update unread count optimistically
      const list = currentThreads ?? threads;
      setThreads(list.map((t) => (t.id === thread.id ? { ...t, unread_count: 0 } : t)));

      setMessagesLoading(true);
      setMessages([]);
      try {
        const { data } = await messageApi.getThreadMessages(thread.id);
        const msgs: Message[] = Array.isArray(data) ? data : (data as { items: Message[] }).items ?? [];
        // The API returns newest-first (created_at DESC for cursor paging);
        // reverse to chronological order so the oldest sits at the top and the
        // newest at the bottom — matching optimistic sends, which append.
        setMessages([...msgs].reverse());
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        setMessagesLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threads]
  );

  const handleSend = useCallback(
    async (payload: {
      content?: string;
      attachment?: PendingAttachment | null;
      reference?: ReferenceCard | null;
    }) => {
      if (!activeThread || !user) return;
      const { content, attachment, reference } = payload;
      const hasText = !!content && content.trim().length > 0;
      const hasAttachment = !!attachment;
      const hasReference = !!reference;
      if (!hasText && !hasAttachment && !hasReference) return;

      // Optimistic message — include attachment/reference fields so the
      // bubble renders immediately even before the server round-trip
      // completes.
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        thread_id: activeThread.id,
        sender_id: user.id,
        content: hasText ? content! : '',
        created_at: new Date().toISOString(),
        attachment_url: attachment?.url ?? null,
        attachment_type: attachment?.type ?? null,
        attachment_thumbnail_url: attachment?.thumbnail_url ?? null,
        reference: reference ?? null,
      };
      addMessage(optimistic);

      // Update thread preview — show a placeholder for media-only/reference-only sends.
      const previewText = hasText
        ? content!.trim()
        : hasAttachment
          ? attachment!.type === 'image'
            ? '📷 Photo'
            : attachment!.type === 'audio'
              ? '🎤 Voice note'
              : '🎥 Video'
          : hasReference
            ? reference!.title || 'Shared a reference'
            : '';
      setThreads(
        threads.map((t) =>
          t.id === activeThread.id
            ? {
                ...t,
                last_message: {
                  content: previewText,
                  sender_id: user.id,
                  created_at: new Date().toISOString(),
                  attachment_url: attachment?.url ?? null,
                  attachment_type: attachment?.type ?? null,
                  attachment_thumbnail_url: attachment?.thumbnail_url ?? null,
                },
                last_message_at: new Date().toISOString(),
              }
            : t
        )
      );

      try {
        const { data } = await messageApi.sendMessage(activeThread.id, {
          content: hasText ? content.trim() : undefined,
          attachment_url: attachment?.url ?? null,
          attachment_type: attachment?.type ?? null,
          attachment_thumbnail_url: attachment?.thumbnail_url ?? null,
          ...(hasReference
            ? { reference_type: reference!.type, reference_id: reference!.id }
            : {}),
        });
        const real = data as Message;
        // Replace optimistic with real using current store state (not stale closure)
        const current = useMessageStore.getState().messages;
        setMessages(
          current
            .filter((m) => m.id !== optimistic.id)
            .concat(real)
        );
      } catch (err) {
        console.error('Failed to send message:', err);
        // Revert on failure using current store state
        const current = useMessageStore.getState().messages;
        setMessages(current.filter((m) => m.id !== optimistic.id));
        // Re-throw so ChatView can restore its composer state.
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeThread, user, messages, threads]
  );

  function handleBack() {
    setShowChat(false);
    navigate('/messages', { replace: true });
  }

  const currentUserId = user?.id ?? '';

  return (
    <PageLayout showFooter={false}>
      <div className="max-w-7xl mx-auto h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
        {/* ── Desktop: side-by-side ──────────────────────────────────────────── */}
        <div className="hidden md:flex h-full border-x border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Left: thread list (1/3) */}
          <div className="w-1/3 border-r border-gray-200 flex flex-col h-full">
            <ThreadListPanel
              threads={threads}
              activeThreadId={activeThread?.id ?? null}
              currentUserId={currentUserId}
              loading={threadsLoading}
              onSelectThread={(t) => openThread(t)}
            />
          </div>

          {/* Right: chat (2/3) */}
          <div className="flex-1 flex flex-col h-full">
            {activeThread ? (
              <ChatView
                thread={activeThread}
                messages={messages}
                currentUserId={currentUserId}
                onBack={handleBack}
                onSend={handleSend}
                loading={messagesLoading}
                initialPendingReference={navPendingReference}
                initialPendingMessage={navPendingMessage}
                onInitialReferenceConsumed={() => {
                  setNavPendingReference(null);
                  setNavPendingMessage('');
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full bg-gray-50">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'hsl(35, 15%, 93%)' }}
                >
                  <MessageCircle size={30} style={{ color: 'hsl(160, 25%, 24%)' }} />
                </div>
                <p className="text-base font-semibold text-gray-700">Select a conversation</p>
                <p className="text-sm text-gray-400 mt-1">
                  Choose from your threads on the left
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Mobile: single panel ───────────────────────────────────────────── */}
        <div className="md:hidden flex flex-col h-full overflow-hidden">
          {!showChat ? (
            <ThreadListPanel
              threads={threads}
              activeThreadId={activeThread?.id ?? null}
              currentUserId={currentUserId}
              loading={threadsLoading}
              onSelectThread={(t) => openThread(t)}
            />
          ) : activeThread ? (
            <ChatView
              thread={activeThread}
              messages={messages}
              currentUserId={currentUserId}
              onBack={handleBack}
              onSend={handleSend}
              loading={messagesLoading}
              initialPendingReference={navPendingReference}
              initialPendingMessage={navPendingMessage}
              onInitialReferenceConsumed={() => {
                setNavPendingReference(null);
                setNavPendingMessage('');
              }}
            />
          ) : null}
        </div>
      </div>
    </PageLayout>
  );
}
