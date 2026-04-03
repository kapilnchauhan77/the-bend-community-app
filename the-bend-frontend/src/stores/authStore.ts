import { create } from 'zustand';
import type { User, Shop } from '@/types';

interface AuthState {
  user: User | null;
  shop: Shop | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuth: (user: User, shop: Shop | null, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  shop: null,
  isAuthenticated: !!sessionStorage.getItem('access_token'),
  isLoading: false,

  setAuth: (user, shop, accessToken, refreshToken) => {
    sessionStorage.setItem('access_token', accessToken);
    sessionStorage.setItem('refresh_token', refreshToken);
    set({ user, shop, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    set({ user: null, shop: null, isAuthenticated: false, isLoading: false });
  },

  setLoading: (loading) => set({ isLoading: loading }),
}));
