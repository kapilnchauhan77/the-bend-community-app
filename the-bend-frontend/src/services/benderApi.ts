import api from './api';
import type { BenderPost, BenderComment, PaginatedResponse } from '@/types';

export type CreatePostPayload = {
  caption?: string;
  media_url?: string;
  media_thumbnail_url?: string;
  media_type?: 'image' | 'video';
};

export type ListBenderPostsOptions = {
  search?: string;
  signal?: AbortSignal;
};

/**
 * Bender (Instagram-style community feed) API wrapper.
 * - Lists are cursor-paginated; pass `next_cursor` from the previous page to
 *   continue. Backend returns `has_more` so callers don't have to compare cursors.
 * - Likes are idempotent — calling like() twice or unlike() twice is safe and
 *   simplifies optimistic UI rollback on network errors.
 * - Comments are ASC (oldest first) to match Instagram-style chronological reads.
 */
export const benderApi = {
  listPosts: (cursor?: string, limit = 15, options: ListBenderPostsOptions = {}) =>
    api.get<PaginatedResponse<BenderPost>>('/bender/posts', {
      params: { cursor, limit, ...(options.search === undefined ? {} : { search: options.search }) },
      ...(options.signal ? { signal: options.signal } : {}),
    }),

  createPost: (payload: CreatePostPayload) =>
    api.post<BenderPost>('/bender/posts', payload),

  deletePost: (id: string) => api.delete(`/bender/posts/${id}`),

  like: (id: string) => api.post(`/bender/posts/${id}/like`),
  unlike: (id: string) => api.delete(`/bender/posts/${id}/like`),

  listComments: (postId: string, cursor?: string, limit = 20) =>
    api.get<PaginatedResponse<BenderComment>>(`/bender/posts/${postId}/comments`, {
      params: { cursor, limit },
    }),

  createComment: (postId: string, content: string) =>
    api.post<BenderComment>(`/bender/posts/${postId}/comments`, { content }),

  deleteComment: (postId: string, commentId: string) =>
    api.delete(`/bender/posts/${postId}/comments/${commentId}`),
};
