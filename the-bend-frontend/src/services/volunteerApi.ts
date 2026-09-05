import api from './api';

export interface VolunteerPayload {
  name: string;
  phone?: string;
  email?: string;
  skills: string;
  available_time: string;
  photo_url?: string;
  about_me?: string;
}

export const volunteerApi = {
  list: (params?: Record<string, string>) =>
    api.get('/volunteers', { params }),
  enroll: (data: VolunteerPayload) =>
    api.post('/volunteers', data),
  update: (id: string, data: Partial<VolunteerPayload>) =>
    api.put(`/volunteers/${id}`, data),
  delete: (id: string) =>
    api.delete(`/volunteers/${id}`),
};
