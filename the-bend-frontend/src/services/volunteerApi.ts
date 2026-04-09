import api from './api';

export const volunteerApi = {
  list: (params?: Record<string, string>) =>
    api.get('/volunteers', { params }),
  enroll: (data: { name: string; phone: string; skills: string; available_time: string }) =>
    api.post('/volunteers', data),
};
