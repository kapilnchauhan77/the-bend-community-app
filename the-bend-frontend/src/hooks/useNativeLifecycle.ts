import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export function useNativeLifecycle(onResume: () => void) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let remove: (() => Promise<void>) | undefined
    App.addListener('appStateChange', ({ isActive }) => { if (isActive) onResume() }).then((listener) => { remove = listener.remove })
    return () => { remove?.() }
  }, [onResume])
}
