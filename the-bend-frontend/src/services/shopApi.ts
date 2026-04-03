import api from './api';

export const shopApi = {
  getShop: (id: string) => api.get(`/shops/${id}`),
  updateShop: (id: string, data: Record<string, unknown>) => api.put(`/shops/${id}`, data),
  getShopListings: (id: string, params?: Record<string, string>) => api.get(`/shops/${id}/listings`, { params }),
  getEmployees: (shopId: string) => api.get(`/shops/${shopId}/employees`),
  addEmployee: (shopId: string, data: Record<string, unknown>) => api.post(`/shops/${shopId}/employees`, data),
  updateEmployee: (shopId: string, eid: string, data: Record<string, unknown>) => api.put(`/shops/${shopId}/employees/${eid}`, data),
  deleteEmployee: (shopId: string, eid: string) => api.delete(`/shops/${shopId}/employees/${eid}`),
};
