import api from './api';
import type { AxiosResponse } from 'axios';
import type { Listing, ListingDetail, PaginatedResponse, SuccessStory } from '@/types';
export interface PublicRequestOptions { signal?: AbortSignal }

export const listingApi = {
  browse: (params: Record<string, string | number | boolean | undefined>, options?: PublicRequestOptions): Promise<AxiosResponse<PaginatedResponse<Listing>>> =>
    api.get<PaginatedResponse<Listing>>('/listings', { params, signal: options?.signal }),

  getOpportunities: (params: Record<string, string | number | boolean | undefined>, options?: PublicRequestOptions): Promise<AxiosResponse<PaginatedResponse<Listing>>> =>
    api.get<PaginatedResponse<Listing>>('/listings/opportunities', { params, signal: options?.signal }),

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

  saveListing: (listingId: string) =>
    api.post(`/listings/${listingId}/save`),

  unsaveListing: (listingId: string) =>
    api.delete(`/listings/${listingId}/save`),

  getSavedListings: () =>
    api.get('/listings/saved'),

  getMyListings: () =>
    api.get('/listings/mine'),

  getStories: (params?: Record<string, string>): Promise<AxiosResponse<{ items: SuccessStory[] }>> =>
    api.get<{ items: SuccessStory[] }>('/stories', { params }),

  reportListing: (listingId: string, data: { reason: string; details?: string }) =>
    api.post(`/listings/${listingId}/report`, data),
};
