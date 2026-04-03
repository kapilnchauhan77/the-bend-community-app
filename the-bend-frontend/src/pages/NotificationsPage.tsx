import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  MessageSquare,
  Package,
  CheckCircle,
  AlertTriangle,
  Info,
  CheckCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { notificationApi } from '@/services/notificationApi';
import type { Notification } from '@/types';

const PRIMARY = 'hsl(142, 76%, 36%)';

// ─── Icon map by notification type ───────────────────────────────────────────
function getNotificationIcon(type: string) {
  if (type.includes('message')) return MessageSquare;
  if (type.includes('interest') || type.includes('listing')) return Package;
  if (type.includes('fulfilled')) return CheckCircle;
  if (type.includes('urgent') || type.includes('critical')) return AlertTriangle;
  return Info;
}

function getIconStyle(type: string): { bg: string; color: string } {
  if (type.includes('message')) return { bg: 'bg-blue-100', color: 'text-blue-600' };
  if (type.includes('fulfilled')) return { bg: 'bg-green-100', color: 'text-green-600' };
  if (type.includes('urgent') || type.includes('critical'))
    return { bg: 'bg-red-100', color: 'text-red-600' };
  if (type.includes('interest')) return { bg: 'bg-amber-100', color: 'text-amber-600' };
  return { bg: 'bg-gray-100', color: 'text-gray-600' };
}

// ─── Navigate target from notification data ───────────────────────────────────
function getTargetRoute(n: Notification): string {
  const data = n.data ?? {};
  if (data.thread_id) return `/messages/${data.thread_id}`;
  if (data.listing_id) return `/listing/${data.listing_id}`;
  if (n.type.includes('message')) return '/messages';
  return '/browse';
}

// ─── Relative time ────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

// ─── Group notifications by day ───────────────────────────────────────────────
function groupByDay(notifications: Notification[]): Record<string, Notification[]> {
  const groups: Record<string, Notification[]> = {};
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  for (const n of notifications) {
    const d = new Date(n.created_at).toDateString();
    let key: string;
    if (d === todayStr) key = 'Today';
    else if (d === yesterdayStr) key = 'Yesterday';
    else key = 'Older';
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  }
  return groups;
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Older'];

// ─── Single notification card ─────────────────────────────────────────────────
function NotificationItem({
  notification,
  onRead,
  onClick,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onClick: (n: Notification) => void;
}) {
  const Icon = getNotificationIcon(notification.type);
  const iconStyle = getIconStyle(notification.type);

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all duration-150 group
        ${notification.is_read ? 'bg-white hover:bg-gray-50' : 'bg-blue-50/60 hover:bg-blue-50 border border-blue-100'}`}
      onClick={() => onClick(notification)}
    >
      {/* Unread dot */}
      <div className="flex-shrink-0 mt-0.5 relative">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconStyle.bg}`}>
          <Icon className={`w-4.5 h-4.5 ${iconStyle.color}`} size={18} />
        </div>
        {!notification.is_read && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-snug mb-0.5 ${notification.is_read ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'}`}
        >
          {notification.title}
        </p>
        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{notification.body}</p>
        <p className="text-[11px] text-gray-400 mt-1.5">{timeAgo(notification.created_at)}</p>
      </div>

      {/* Mark read button on hover */}
      {!notification.is_read && (
        <button
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-blue-100 text-blue-500"
          title="Mark as read"
          onClick={(e) => {
            e.stopPropagation();
            onRead(notification.id);
          }}
        >
          <CheckCheck size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
        style={{ backgroundColor: 'hsl(142, 76%, 95%)' }}
      >
        <Bell size={36} style={{ color: PRIMARY }} />
      </div>
      <h3 className="text-lg font-bold text-gray-800 mb-1">All caught up</h3>
      <p className="text-sm text-gray-500 max-w-xs">
        You have no notifications right now. We'll let you know when something needs your attention.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(() => {
    setLoading(true);
    notificationApi
      .getNotifications()
      .then((res) => {
        const data = res.data as Notification[] | { items: Notification[] };
        setNotifications(Array.isArray(data) ? data : data.items ?? []);
      })
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    await notificationApi.markRead(id).catch(() => {});
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    await notificationApi.markAllRead().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setMarkingAll(false);
  };

  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      await handleMarkRead(n.id);
    }
    navigate(getTargetRoute(n));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const grouped = groupByDay(notifications);

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="text-xs font-semibold gap-1.5"
            >
              <CheckCheck size={14} />
              {markingAll ? 'Marking…' : 'Mark all read'}
            </Button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-100 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-2.5 bg-gray-100 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            {GROUP_ORDER.filter((g) => grouped[g]?.length).map((group) => (
              <div key={group}>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">
                  {group}
                </h2>
                <Card className="overflow-hidden border border-gray-100 shadow-sm rounded-2xl">
                  <CardContent className="p-2 space-y-1">
                    {grouped[group].map((n, idx) => (
                      <div key={n.id}>
                        <NotificationItem
                          notification={n}
                          onRead={handleMarkRead}
                          onClick={handleClick}
                        />
                        {idx < grouped[group].length - 1 && (
                          <div className="mx-4 border-t border-gray-100" />
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
