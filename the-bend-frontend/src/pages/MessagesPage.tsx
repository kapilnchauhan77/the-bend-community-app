import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, MessageCircle, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { messageApi } from '@/services/messageApi';
import { useAuthStore } from '@/stores/authStore';
import { useMessageStore } from '@/stores/messageStore';
import { PageLayout } from '@/components/layout/PageLayout';
import { EmptyState } from '@/components/shared/EmptyState';
import type { MessageThread, Message } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
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
  const date = new Date(dateStr);
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
    const day = new Date(msg.created_at).toDateString();
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
            {lastMsg
              ? `${isOwnLastMsg ? 'You: ' : ''}${lastMsg.content}`
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
  const time = new Date(message.created_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1.5`}>
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
}: {
  thread: MessageThread;
  messages: Message[];
  currentUserId: string;
  onBack: () => void;
  onSend: (content: string) => Promise<void>;
  loading: boolean;
}) {
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const grouped = groupMessagesByDate(messages);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [thread.id]);

  async function handleSend() {
    const content = inputValue.trim();
    if (!content || sending) return;
    setInputValue('');
    setSending(true);
    try {
      await onSend(content);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

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
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 rounded-full bg-gray-50 border-gray-200 focus-visible:ring-1 focus-visible:ring-[hsl(35,45%,42%)] text-sm"
            disabled={sending}
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
            size="icon"
            className="rounded-full w-10 h-10 flex-shrink-0 transition-all"
            style={{
              backgroundColor:
                inputValue.trim() ? 'hsl(160, 25%, 24%)' : 'hsl(35, 25%, 70%)',
            }}
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
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
  const { user } = useAuthStore();

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
        setMessages(msgs);
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
    async (content: string) => {
      if (!activeThread || !user) return;

      // Optimistic message
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        thread_id: activeThread.id,
        sender_id: user.id,
        content,
        created_at: new Date().toISOString(),
      };
      addMessage(optimistic);

      // Update thread preview
      setThreads(
        threads.map((t) =>
          t.id === activeThread.id
            ? {
                ...t,
                last_message: {
                  content,
                  sender_id: user.id,
                  created_at: new Date().toISOString(),
                },
                last_message_at: new Date().toISOString(),
              }
            : t
        )
      );

      try {
        const { data } = await messageApi.sendMessage(activeThread.id, content);
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
      <div className="max-w-7xl mx-auto h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)]">
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
            />
          ) : null}
        </div>
      </div>
    </PageLayout>
  );
}
