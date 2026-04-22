import api from './api';

export const talentApi = {
  list: (params?: Record<string, string>) =>
    api.get('/talent', { params }),
  register: (data: {
    name: string; phone: string; email?: string; category: string;
    skills: string; available_time: string; rate: number; rate_unit: string; photo_url?: string;
  }) =>
    api.post('/talent', data),
  sendInquiry: (talentId: string, data: { name: string; message: string; preferred_date?: string }) =>
    api.post(`/talent/${talentId}/inquiries`, data),
};
