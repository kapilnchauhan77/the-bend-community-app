import api from './api';
import type { ReferenceCard } from '../types';

export type SendMessagePayload = {
  content?: string;
  attachment_url?: string | null;
  attachment_type?: 'image' | 'video' | null;
  attachment_thumbnail_url?: string | null;
  reference_type?: string;
  reference_id?: string;
};

export const messageApi = {
  getThreads: (params?: Record<string, string>) =>
    api.get('/messages/threads', { params }),
  getThreadMessages: (threadId: string, params?: Record<string, string>) =>
    api.get(`/messages/threads/${threadId}`, { params }),
  /**
   * Send a message in a thread. Phase 2: accepts either a string body (legacy
   * call sites — text-only) or a structured payload with optional attachment
   * fields for media-only / media+text sends. Backend requires at least one
   * of `content` (non-empty) or `attachment_url`.
   */
  sendMessage: (threadId: string, payload: string | SendMessagePayload) => {
    const body: SendMessagePayload =
      typeof payload === 'string' ? { content: payload } : payload;
    return api.post(`/messages/threads/${threadId}`, body);
  },
  getUnreadCount: () =>
    api.get<{ unread_count: number }>('/messages/unread-count'),
  startThread: (shopId: string, listingId?: string) =>
    api.post<{ id: string; created: boolean }>('/messages/threads', {
      shop_id: shopId,
      listing_id: listingId,
    }),
  createDirectThread: (recipientUserId: string) =>
    api.post<{ id: string; created: boolean }>('/messages/threads', {
      recipient_user_id: recipientUserId,
    }),
  referenceSearch: (q: string, type?: string) =>
    api.get<{ items: ReferenceCard[] }>('/messages/reference-search', {
      params: { q, ...(type ? { type } : {}) },
    }),
};
