import api from './api';

export const sponsorApi = {
  list: (placement?: string) =>
    api.get('/sponsors', { params: placement ? { placement } : {} }),

  // Admin — sponsors
  adminList: () => api.get('/admin/sponsors'),
  approve: (id: string) => api.post(`/admin/sponsors/${id}/approve`),
  adminUpdate: (id: string, data: Record<string, unknown>) => api.put(`/admin/sponsors/${id}`, data),
  adminDelete: (id: string) => api.delete(`/admin/sponsors/${id}`),
  adminCreate: (data: Record<string, unknown>) => api.post('/admin/sponsors', data),

  // Admin — pricing
  adminListPricing: () => api.get('/admin/pricing'),
  adminCreatePricing: (data: Record<string, unknown>) => api.post('/admin/pricing', data),
  adminUpdatePricing: (id: string, data: Record<string, unknown>) => api.put(`/admin/pricing/${id}`, data),
  adminDeletePricing: (id: string) => api.delete(`/admin/pricing/${id}`),

  // Admin — settings
  getSettings: () => api.get('/admin/settings'),
};
