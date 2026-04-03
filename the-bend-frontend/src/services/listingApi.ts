import api from './api';
import type { Listing, ListingDetail, PaginatedResponse } from '@/types';

export const listingApi = {
  browse: (params: Record<string, string | number | boolean | undefined>) =>
    api.get<PaginatedResponse<Listing>>('/listings', { params }),

  getDetail: (id: string) =>
    api.get<ListingDetail>(`/listings/${id}`),

  create: (data: Record<string, unknown>) =>
    api.post('/listings', data),

  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/listings/${id}`, data),

  fulfill: (id: string) =>
    api.patch(`/listings/${id}/fulfill`),

  delete: (id: string) =>
    api.delete(`/listings/${id}`),

  expressInterest: (listingId: string, message?: string) =>
    api.post('/interests', { listing_id: listingId, message }),

  withdrawInterest: (listingId: string) =>
    api.delete(`/interests/${listingId}`),
};
