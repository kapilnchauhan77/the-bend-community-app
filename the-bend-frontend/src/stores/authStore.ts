import { create } from 'zustand'
import type { AuthTokens, User, Shop } from '@/types'
import { sessionManager } from '@/auth/sessionManager'

interface AuthState {
  user: User | null; shop: Shop | null; isAuthenticated: boolean; isLoading: boolean
  setAuth: (user: User, shop: Shop | null, accessToken: string, refreshToken: string) => Promise<void>
  initialize: () => Promise<void>; logout: () => Promise<void>; setLoading: (loading: boolean) => void
}

function readJson<T>(key: string): T | null {
  try {
    const storage = typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage : undefined
    return storage ? JSON.parse(storage.getItem(key) || 'null') as T : null
  } catch { return null }
}

const initial = sessionManager.getSnapshot()
const storedUser = readJson<User>('user')
const storedShop = readJson<Shop>('shop')

export const useAuthStore = create<AuthState>((set) => {
  sessionManager.subscribe((snapshot) => set(snapshot))
  return {
    user: initial.user ?? (!sessionManager.isNative ? storedUser : null), shop: initial.shop ?? (!sessionManager.isNative ? storedShop : null),
    isAuthenticated: initial.isAuthenticated, isLoading: false,
    setAuth: async (user, shop, accessToken, refreshToken) => sessionManager.setAuthenticated({ access_token: accessToken, refresh_token: refreshToken, token_type: 'bearer', user, shop } as AuthTokens),
    initialize: async () => { set({ isLoading: true }); set(await sessionManager.initialize()) },
    logout: async () => { await sessionManager.logout(); set(sessionManager.getSnapshot()) },
    setLoading: (loading) => set({ isLoading: loading }),
  }
})
