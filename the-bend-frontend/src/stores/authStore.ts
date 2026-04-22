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

const storedUser = localStorage.getItem('user');
const storedShop = localStorage.getItem('shop');

export const useAuthStore = create<AuthState>((set) => ({
  user: storedUser ? JSON.parse(storedUser) : null,
  shop: storedShop ? JSON.parse(storedShop) : null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  isLoading: false,

  setAuth: (user, shop, accessToken, refreshToken) => {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('shop', JSON.stringify(shop));
    set({ user, shop, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('shop');
    set({ user: null, shop: null, isAuthenticated: false, isLoading: false });
  },

  setLoading: (loading) => set({ isLoading: loading }),
}));
