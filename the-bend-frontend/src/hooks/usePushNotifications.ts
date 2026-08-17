import { useCallback, useEffect, useMemo, useState } from 'react'
import { notificationApi } from '@/services/notificationApi'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformServices } from '@/platform/createPlatformServices'
import { Capacitor } from '@capacitor/core'
import { useNavigate } from 'react-router-dom'

export function createTapNavigator(navigate: (path: string) => void) {
  return (target: { path: string; requiresAuth: boolean }) => {
    if (!target.path.startsWith('/') || target.path.startsWith('//')) return
    navigate(target.path)
  }
}

export function usePushNotifications() {
  const services = usePlatformServices()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const shop = useAuthStore((state) => state.shop)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isLoading = useAuthStore((state) => state.isLoading)
  const session = useMemo(() => ({ user, shop, isAuthenticated, isLoading }), [user, shop, isAuthenticated, isLoading])
  const [permission, setPermission] = useState<string>(Capacitor.isNativePlatform() ? 'prompt' : (typeof Notification !== 'undefined' ? Notification.permission : 'default'))
  const [isSubscribed, setIsSubscribed] = useState(false)
  useEffect(() => {
    if (!session.isAuthenticated || session.isLoading) return
    void services.push.register(session)
    const tap = services.push.addTapListener(createTapNavigator(navigate))
    return () => { void tap.then((listener) => listener.remove()); void services.push.unregister('online') }
  }, [services, session, navigate])
  const requestPermission = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      const result = await services.push.explainAndRequest(); setPermission(result)
      if (result === 'granted' && session.isAuthenticated) { await services.push.register(session); setIsSubscribed(true) }
      return result === 'granted'
    }
    if (typeof Notification === 'undefined') return false
    const result = await Notification.requestPermission(); setPermission(result); return result === 'granted'
  }, [services, session])
  const subscribe = useCallback(async () => {
    if (Capacitor.isNativePlatform()) return requestPermission()
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY })
      const json = subscription.toJSON()
      await notificationApi.registerPushSubscription({ endpoint: json.endpoint!, keys: json.keys as Record<string, string> })
      setIsSubscribed(true); return true
    } catch { return false }
  }, [requestPermission])
  return { permission, isSubscribed, requestPermission, subscribe }
}
