import api from './api';
import type { AxiosResponse } from 'axios';
import type { PaginatedResponse, Shop } from '@/types';
import type { PublicRequestOptions } from './listingApi';

export const shopApi = {
  getShop: (id: string) => api.get(`/shops/${id}`),
  updateShop: (id: string, data: Record<string, unknown>) => api.put(`/shops/${id}`, data),
  getShopListings: (id: string, params?: Record<string, string>) => api.get(`/shops/${id}/listings`, { params }),
  directory: (params?: Record<string, string | number | boolean | undefined>, options?: PublicRequestOptions): Promise<AxiosResponse<PaginatedResponse<Shop>>> =>
    api.get<PaginatedResponse<Shop>>('/shops', { params, signal: options?.signal }),
  getEndorsements: (shopId: string) =>
    api.get(`/shops/${shopId}/endorsements`),
  endorse: (shopId: string, message?: string) =>
    api.post(`/shops/${shopId}/endorse`, { message }),
  withdrawEndorsement: (shopId: string) =>
    api.delete(`/shops/${shopId}/endorse`),
};
