import api from './api';

export const advertisingApi = {
  getPricing: () =>
    api.get('/advertising/pricing'),
  createCheckout: (data: {
    pricing_id: string;
    name: string;
    description?: string;
    website_url?: string;
    logo_url?: string;
    contact_email: string;
    contact_name: string;
  }) =>
    api.post<{ checkout_url: string; session_id: string }>('/advertising/checkout', data),
  checkStatus: (sessionId: string) =>
    api.get(`/advertising/status/${sessionId}`),
};
