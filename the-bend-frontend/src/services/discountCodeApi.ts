import api from './api';
import type { DiscountCode } from '@/types';

export interface DiscountCodePayload {
  code?: string;
  name?: string;
  description?: string | null;
  discount_type?: 'percentage' | 'flat';
  // percentage: 1-100, flat: amount in CENTS
  discount_value?: number;
  expiry_date?: string | null;
  max_uses?: number | null;
  is_active?: boolean;
}

export const discountCodeApi = {
  // Owner endpoints (auth required)
  listMine: () => api.get<DiscountCode[]>('/discount-codes/mine'),

  create: (payload: DiscountCodePayload) =>
    api.post<DiscountCode>('/discount-codes', payload),

  update: (id: string, payload: DiscountCodePayload) =>
    api.put<DiscountCode>(`/discount-codes/${id}`, payload),

  remove: (id: string) => api.delete(`/discount-codes/${id}`),

  // Public endpoints (no auth)
  listForShop: (shopId: string) =>
    api.get<DiscountCode[]>(`/shops/${shopId}/discount-codes`),

  listForUser: (userId: string) =>
    api.get<DiscountCode[]>(`/discount-codes/by-user/${userId}`),

  // Returns 410 GONE when exhausted/expired — caller should handle.
  markUsed: (id: string) =>
    api.post<DiscountCode>(`/discount-codes/${id}/use`),
};
