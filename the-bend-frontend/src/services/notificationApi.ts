import api from './api';

export const notificationApi = {
  getNotifications: (params?: Record<string, string | boolean>) =>
    api.get('/notifications', { params }),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  getUnreadCount: () => api.get<{ unread_count: number }>('/notifications/unread-count'),
  registerPushSubscription: (data: { endpoint: string; keys: Record<string, string> }) =>
    api.post('/notifications/push-subscription', data),
};
