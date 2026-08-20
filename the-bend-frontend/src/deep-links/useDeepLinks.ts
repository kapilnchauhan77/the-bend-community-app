import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { parseDeepLink, savePendingDestination } from './deepLinkRoutes'

export function useDeepLinks(): void {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isLoading = useAuthStore((state) => state.isLoading)
  const authRef = useRef(isAuthenticated)
  const loadingRef = useRef(isLoading)
  const navigateRef = useRef(navigate)
  useEffect(() => {
    authRef.current = isAuthenticated
    loadingRef.current = isLoading
    navigateRef.current = navigate
  }, [isAuthenticated, isLoading, navigate])

  useEffect(() => {
    let disposed = false
    let removeListener: (() => Promise<void>) | undefined

    const handleUrl = (url: string, replace: boolean) => {
      const target = parseDeepLink(url)
      if (!target || disposed) return
      if (target.requiresAuth && loadingRef.current) {
        savePendingDestination(target)
        if (replace) navigateRef.current(target.path, { replace: true })
        else navigateRef.current(target.path)
        return
      }
      if (target.requiresAuth && !authRef.current) {
        savePendingDestination(target)
        if (replace) navigateRef.current('/login', { replace: true })
        else navigateRef.current('/login')
        return
      }
      if (replace) navigateRef.current(target.path, { replace: true })
      else navigateRef.current(target.path)
    }

    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) handleUrl(launch.url, true)
    }).catch(() => undefined)

    void App.addListener('appUrlOpen', ({ url }) => handleUrl(url, false)).then((handle) => {
      if (disposed) void handle.remove()
      else removeListener = handle.remove
    }).catch(() => undefined)

    return () => {
      disposed = true
      if (removeListener) void removeListener()
    }
  }, [])
}
