import api from './api';

export const adminApi = {
  getDashboard: () => api.get('/admin/dashboard'),
  getRegistrations: (params?: Record<string, string>) => api.get('/admin/registrations', { params }),
  approveRegistration: (shopId: string) => api.post(`/admin/registrations/${shopId}/approve`),
  rejectRegistration: (shopId: string, reason: string) => api.post(`/admin/registrations/${shopId}/reject`, { reason }),
  getShops: (params?: Record<string, string>) => api.get('/admin/shops', { params }),
  suspendShop: (shopId: string, reason: string) => api.post(`/admin/shops/${shopId}/suspend`, { reason }),
  reactivateShop: (shopId: string) => api.post(`/admin/shops/${shopId}/reactivate`),
  getListings: (params?: Record<string, string>) => api.get('/admin/listings', { params }),
  removeListing: (id: string, reason: string) => api.delete(`/admin/listings/${id}`, { data: { reason } }),
  getReports: (period?: string) => api.get('/admin/reports', { params: { period } }),
  getReportedPosts: (params?: Record<string, string>) =>
    api.get('/admin/reports/flags', { params }),
  resolveReport: (reportId: string) =>
    api.post(`/admin/reports/flags/${reportId}/resolve`),
  uploadGuidelines: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/upload/guidelines', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  getCurrentGuidelines: () => api.get('/upload/guidelines/current'),
};
