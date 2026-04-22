import api from './api';

export const shopApi = {
  getShop: (id: string) => api.get(`/shops/${id}`),
  updateShop: (id: string, data: Record<string, unknown>) => api.put(`/shops/${id}`, data),
  getShopListings: (id: string, params?: Record<string, string>) => api.get(`/shops/${id}/listings`, { params }),
  directory: (params?: Record<string, string>) =>
    api.get('/shops', { params }),
  getEndorsements: (shopId: string) =>
    api.get(`/shops/${shopId}/endorsements`),
  endorse: (shopId: string, message?: string) =>
    api.post(`/shops/${shopId}/endorse`, { message }),
  withdrawEndorsement: (shopId: string) =>
    api.delete(`/shops/${shopId}/endorse`),
};
