import api from './api';

export interface TalentPayload {
  name: string;
  phone?: string;
  email?: string;
  category: string;
  skills: string;
  available_time: string;
  rate: number;
  rate_unit: string;
  photo_url?: string;
}

export const talentApi = {
  list: (params?: Record<string, string>) =>
    api.get('/talent', { params }),
  register: (data: TalentPayload) =>
    api.post('/talent', data),
  update: (id: string, data: Partial<TalentPayload>) =>
    api.put(`/talent/${id}`, data),
  delete: (id: string) =>
    api.delete(`/talent/${id}`),
  sendInquiry: (talentId: string, data: { name: string; message: string; preferred_date?: string }) =>
    api.post(`/talent/${talentId}/inquiries`, data),
};
