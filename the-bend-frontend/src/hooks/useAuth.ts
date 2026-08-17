import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/services/authApi';

export function useAuth() {
  const { user, shop, isAuthenticated, isLoading, setAuth, logout: storeLogout } = useAuthStore();
  const navigate = useNavigate();

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    await setAuth(data.user, data.shop ?? null, data.access_token, data.refresh_token);
  }, [setAuth]);

  const register = useCallback(async (formData: Record<string, unknown>) => {
    const { data } = await authApi.register(formData as Parameters<typeof authApi.register>[0]);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await storeLogout();
    navigate('/login');
  }, [storeLogout, navigate]);

  return { user, shop, isAuthenticated, isLoading, login, register, logout };
}
