import api from './api';
import type { AuthTokens } from '@/types';

export const authApi = {
  register: (data: {
    shop_name: string;
    business_type: string;
    owner_name: string;
    email: string;
    phone: string;
    whatsapp?: string;
    password: string;
    address?: string;
    guidelines_accepted: boolean;
  }) => api.post<{ message: string; shop_id: string }>('/auth/register', data),

  login: (email: string, password: string) =>
    api.post<AuthTokens>('/auth/login', { email, password }),

  refresh: (refreshToken: string) =>
    api.post<{ access_token: string; token_type: string }>('/auth/refresh', {
      refresh_token: refreshToken,
    }),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post<{ message: string }>('/auth/reset-password', {
      token,
      new_password: newPassword,
    }),
};
