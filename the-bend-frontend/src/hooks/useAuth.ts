import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/services/authApi';

export function useAuth() {
  const { user, shop, isAuthenticated, isLoading, setAuth, logout: storeLogout } = useAuthStore();
  const navigate = useNavigate();

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    setAuth(data.user, data.shop ?? null, data.access_token, data.refresh_token);
  }, [setAuth]);

  const register = useCallback(async (formData: Record<string, unknown>) => {
    const { data } = await authApi.register(formData as any);
    return data;
  }, []);

  const logout = useCallback(() => {
    storeLogout();
    navigate('/login');
  }, [storeLogout, navigate]);

  return { user, shop, isAuthenticated, isLoading, login, register, logout };
}
