import api from './api';
import type { BenderPost, BenderComment, BenderCommentHeartResponse, BenderLinkPreview, PaginatedResponse } from '@/types';

export interface BenderLinkPreviewResponse {
  preview_token: string;
  preview: BenderLinkPreview;
}

export type CreatePostPayload = {
  caption?: string;
  preview_token?: string;
  media_url?: string;
  media_thumbnail_url?: string;
  media_type?: 'image' | 'video';
};

export type UpdatePostPayload = {
  caption: string | null;
  preview_token?: string;
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
  listPosts: (cursor?: string, limit = 15) =>
    api.get<PaginatedResponse<BenderPost>>('/bender/posts', {
      params: { cursor, limit },
    }),

  createPost: (payload: CreatePostPayload) =>
    api.post<BenderPost>('/bender/posts', payload),

  updatePost: (postId: string, payload: UpdatePostPayload) =>
    api.patch<BenderPost>(`/bender/posts/${postId}`, payload),

  getPost: (postId: string) => api.get<BenderPost>(`/bender/posts/${postId}`),

  generateLinkPreview: (url: string, signal?: AbortSignal) =>
    api.post<BenderLinkPreviewResponse>('/bender/link-preview', { url }, { signal }),

  deletePost: (id: string) => api.delete(`/bender/posts/${id}`),

  like: (id: string) => api.post(`/bender/posts/${id}/like`),
  unlike: (id: string) => api.delete(`/bender/posts/${id}/like`),

  listComments: (postId: string, cursor?: string, limit = 20) =>
    api.get<PaginatedResponse<BenderComment>>(`/bender/posts/${postId}/comments`, {
      params: { cursor, limit },
    }),

  createComment: (postId: string, content: string, parentCommentId?: string) =>
    api.post<BenderComment>(`/bender/posts/${postId}/comments`, {
      content,
      parent_comment_id: parentCommentId ?? null,
    }),

  getComment: (postId: string, commentId: string) =>
    api.get<BenderComment>(`/bender/posts/${postId}/comments/${commentId}`),

  likeComment: (postId: string, commentId: string) =>
    api.post<BenderCommentHeartResponse>(`/bender/posts/${postId}/comments/${commentId}/like`),

  unlikeComment: (postId: string, commentId: string) =>
    api.delete<BenderCommentHeartResponse>(`/bender/posts/${postId}/comments/${commentId}/like`),

  deleteComment: (postId: string, commentId: string) =>
    api.delete(`/bender/posts/${postId}/comments/${commentId}`),
};
