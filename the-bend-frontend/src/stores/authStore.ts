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

const storedUser = sessionStorage.getItem('user');
const storedShop = sessionStorage.getItem('shop');

export const useAuthStore = create<AuthState>((set) => ({
  user: storedUser ? JSON.parse(storedUser) : null,
  shop: storedShop ? JSON.parse(storedShop) : null,
  isAuthenticated: !!sessionStorage.getItem('access_token'),
  isLoading: false,

  setAuth: (user, shop, accessToken, refreshToken) => {
    sessionStorage.setItem('access_token', accessToken);
    sessionStorage.setItem('refresh_token', refreshToken);
    sessionStorage.setItem('user', JSON.stringify(user));
    sessionStorage.setItem('shop', JSON.stringify(shop));
    set({ user, shop, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('shop');
    set({ user: null, shop: null, isAuthenticated: false, isLoading: false });
  },

  setLoading: (loading) => set({ isLoading: loading }),
}));
