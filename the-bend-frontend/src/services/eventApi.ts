import api from './api';

export const eventApi = {
  // Public
  list: (params?: Record<string, string>) =>
    api.get('/events', { params }),
  getUpcoming: (limit = 5) =>
    api.get('/events/upcoming', { params: { limit: String(limit) } }),
  getDetail: (id: string) =>
    api.get(`/events/${id}`),

  // Event submission (paid)
  getPricing: () =>
    api.get('/events/pricing'),
  submit: (data: {
    title: string; description?: string; start_date: string;
    end_date?: string; location?: string; category?: string;
    image_url?: string; is_nonprofit: boolean; nonprofit_doc_url?: string;
    submitted_by_name: string; submitted_by_email: string;
  }) =>
    api.post('/events/submit', data),

  // Connector purchase
  connectorCheckout: (data: {
    business_name: string; website_url: string;
    contact_name: string; contact_email: string; notes?: string;
  }) =>
    api.post('/events/connector-checkout', data),

  // Admin - Events
  adminList: (params?: Record<string, string>) =>
    api.get('/admin/events', { params }),
  create: (data: {
    title: string; description?: string; start_date: string;
    end_date?: string; location?: string; category?: string;
    image_url?: string; is_featured?: boolean;
  }) =>
    api.post('/admin/events', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/admin/events/${id}`, data),
  delete: (id: string) =>
    api.delete(`/admin/events/${id}`),

  // Admin - Connectors
  getConnectors: () =>
    api.get('/admin/connectors'),
  createConnector: (data: {
    name: string; type: string; url: string;
    category?: string; is_active?: boolean; config?: Record<string, string>;
  }) =>
    api.post('/admin/connectors', data),
  updateConnector: (id: string, data: Record<string, unknown>) =>
    api.put(`/admin/connectors/${id}`, data),
  deleteConnector: (id: string) =>
    api.delete(`/admin/connectors/${id}`),
  syncConnector: (id: string) =>
    api.post(`/admin/connectors/${id}/sync`),
  testConnector: (id: string) =>
    api.post(`/admin/connectors/${id}/test`),
  syncAll: () =>
    api.post('/admin/connectors/sync-all'),
};
