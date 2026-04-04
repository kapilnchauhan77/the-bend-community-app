import api from './api';

export const messageApi = {
  getThreads: (params?: Record<string, string>) =>
    api.get('/messages/threads', { params }),
  getThreadMessages: (threadId: string, params?: Record<string, string>) =>
    api.get(`/messages/threads/${threadId}`, { params }),
  sendMessage: (threadId: string, content: string) =>
    api.post(`/messages/threads/${threadId}`, { content }),
  getUnreadCount: () =>
    api.get<{ unread_count: number }>('/messages/unread-count'),
  startThread: (shopId: string, listingId?: string) =>
    api.post<{ id: string; created: boolean }>('/messages/threads', {
      shop_id: shopId,
      listing_id: listingId,
    }),
};
