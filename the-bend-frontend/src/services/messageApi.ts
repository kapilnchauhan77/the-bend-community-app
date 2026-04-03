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
};
