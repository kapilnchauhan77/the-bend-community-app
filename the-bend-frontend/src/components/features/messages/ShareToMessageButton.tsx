import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { messageApi } from '@/services/messageApi';
import type { MessageThread, ReferenceCard } from '@/types';

const DEBOUNCE_MS = 250;

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface ShareToMessageButtonProps {
  refType: ReferenceCard['type'];
  refId: string;
  /** Optional styling passthrough so callers can match each page's action row. */
  className?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  label?: string;
  /** Render as a bare icon (no text), for icon-only action rows like BenderPage's post actions. */
  iconOnly?: boolean;
  iconSize?: number;
}

// Row for an existing thread in the picker — same info density as the
// MessagesPage thread list, but tapping it selects the thread instead of
// navigating there directly (navigation happens after selection, carrying
// the pending reference).
function ThreadPickRow({
  thread,
  onClick,
}: {
  thread: MessageThread;
  onClick: () => void;
}) {
  const name = thread.other_party.shop_name || thread.other_party.name;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-2.5 text-left transition-colors hover:bg-gray-50"
    >
      <Avatar className="h-9 w-9 flex-shrink-0">
        <AvatarFallback
          className="text-xs font-semibold text-white"
          style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}
        >
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{name}</div>
        {thread.listing && (
          <div className="truncate text-xs text-gray-500">Re: {thread.listing.title}</div>
        )}
      </div>
    </button>
  );
}

// Row for a person found via the "start new" search below.
function PersonResultRow({
  card,
  busy,
  onClick,
}: {
  card: ReferenceCard;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-2.5 text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
    >
      <Avatar className="h-9 w-9 flex-shrink-0">
        <AvatarFallback
          className="text-xs font-semibold text-white"
          style={{ backgroundColor: 'hsl(35, 45%, 42%)' }}
        >
          {getInitials(card.title || '?')}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{card.title}</div>
        {card.subtitle && <div className="truncate text-xs text-gray-500">{card.subtitle}</div>}
      </div>
      {busy && <span className="flex-shrink-0 text-xs text-gray-400">Starting…</span>}
    </button>
  );
}

/**
 * "Send in a message" entry point placed on entity pages (listing / shop /
 * bender post / user). Opens a dialog to pick an existing conversation to
 * share the entity into; selecting one navigates to that thread with the
 * reference pre-attached via navigation state (consumed by MessagesPage).
 *
 * Scoping note: the primary, fully-supported path is picking an EXISTING
 * thread. "Start a new conversation" is intentionally minimal — it reuses
 * the app's person-search endpoint (`messageApi.referenceSearch(q, 'user')`)
 * plus `messageApi.createDirectThread`, rather than building a full
 * recipient-picker UI, which would be significant scope beyond this task.
 */
export function ShareToMessageButton({
  refType,
  refId,
  className,
  variant = 'outline',
  size,
  label = 'Send in a message',
  iconOnly = false,
  iconSize,
}: ShareToMessageButtonProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState<string | null>(null);

  const [newQuery, setNewQuery] = useState('');
  const [newResults, setNewResults] = useState<ReferenceCard[]>([]);
  const [newSearching, setNewSearching] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // Load the viewer's existing threads whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setThreadsLoading(true);
    setThreadsError(null);
    messageApi
      .getThreads()
      .then(({ data }) => {
        const items: MessageThread[] = Array.isArray(data)
          ? data
          : (data as { items: MessageThread[] }).items ?? [];
        setThreads(items);
      })
      .catch((err) => {
        console.error('Failed to load threads:', err);
        setThreadsError('Could not load your conversations.');
      })
      .finally(() => setThreadsLoading(false));
  }, [open]);

  // Reset "start new" search state whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setNewQuery('');
      setNewResults([]);
      setStartingId(null);
    }
  }, [open]);

  // Debounced person search for "start new" — guarded against out-of-order
  // responses the same way ReferencePickerModal guards its search.
  useEffect(() => {
    if (!open) return;
    const q = newQuery.trim();
    if (!q) {
      requestIdRef.current += 1;
      setNewResults([]);
      setNewSearching(false);
      return;
    }
    setNewSearching(true);
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const { data } = await messageApi.referenceSearch(q, 'user');
        if (requestIdRef.current !== requestId) return;
        setNewResults(data.items ?? []);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        console.error('Person search failed:', err);
      } finally {
        if (requestIdRef.current === requestId) setNewSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [newQuery, open]);

  function goToThread(threadId: string) {
    setOpen(false);
    navigate(`/messages/${threadId}`, {
      state: { pendingReference: { type: refType, id: refId } },
    });
  }

  async function handleStartNew(card: ReferenceCard) {
    if (startingId) return;
    setStartingId(card.id);
    try {
      const { data } = await messageApi.createDirectThread(card.id);
      goToThread(data.id);
    } catch (err) {
      console.error('Failed to start thread:', err);
      setStartingId(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size ?? (iconOnly ? 'icon' : 'default')}
        className={className}
        onClick={() => setOpen(true)}
        aria-label={iconOnly ? label : undefined}
      >
        <MessageCircle size={iconOnly ? iconSize ?? 18 : 16} className={iconOnly ? undefined : 'mr-1.5'} />
        {!iconOnly && label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send in a message</DialogTitle>
            <DialogDescription>Pick a conversation to share this in.</DialogDescription>
          </DialogHeader>

          <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
            {threadsLoading ? (
              <p className="py-6 text-center text-sm text-gray-400">Loading conversations...</p>
            ) : threadsError ? (
              <p className="py-6 text-center text-sm text-red-500">{threadsError}</p>
            ) : threads.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No conversations yet.</p>
            ) : (
              threads.map((thread) => (
                <ThreadPickRow
                  key={thread.id}
                  thread={thread}
                  onClick={() => goToThread(thread.id)}
                />
              ))
            )}
          </div>

          <div className="border-t border-gray-200 pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Start a new conversation
            </p>
            <div className="relative mb-2">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <Input
                value={newQuery}
                onChange={(e) => setNewQuery(e.target.value)}
                placeholder="Search people..."
                className="pl-9"
              />
            </div>
            <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
              {newSearching ? (
                <p className="py-3 text-center text-xs text-gray-400">Searching...</p>
              ) : newQuery.trim().length === 0 ? (
                <p className="py-3 text-center text-xs text-gray-400">
                  Type a name to find someone new to message.
                </p>
              ) : newResults.length === 0 ? (
                <p className="py-3 text-center text-xs text-gray-400">No people found.</p>
              ) : (
                newResults.map((card) => (
                  <PersonResultRow
                    key={card.id}
                    card={card}
                    busy={startingId === card.id}
                    onClick={() => handleStartNew(card)}
                  />
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
