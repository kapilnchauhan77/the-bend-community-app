import { Capacitor } from '@capacitor/core'
import { getTenantSlug } from '@/lib/constants'

export type RuntimeKind = 'web' | 'ios' | 'android'

export interface RuntimeConfig {
  kind: RuntimeKind
  isNative: boolean
  apiBaseUrl: string
  wsBaseUrl: string
  tenantSlug: string
  appVersion: string
  buildNumber: string
  environment: 'production' | 'development'
}

const NATIVE_API_BASE_URL = 'https://api.bend.community/api/v1'
const WEB_API_BASE_URL = 'http://localhost:8000/api/v1'

export function getRuntimeConfig(forcedKind?: RuntimeKind): RuntimeConfig {
  const detected = forcedKind ?? (Capacitor.getPlatform() as RuntimeKind)
  const isNative = detected === 'ios' || detected === 'android'
  const apiBaseUrl = import.meta.env.VITE_API_URL || (isNative ? NATIVE_API_BASE_URL : WEB_API_BASE_URL)

  return {
    kind: detected,
    isNative,
    apiBaseUrl,
    wsBaseUrl: apiBaseUrl.replace(/^http/, 'ws').replace('/api/v1', ''),
    tenantSlug: isNative ? 'westmoreland' : getTenantSlug(),
    appVersion: import.meta.env.VITE_APP_VERSION || '0.0.0-dev',
    buildNumber: import.meta.env.VITE_BUILD_NUMBER || '0',
    environment: import.meta.env.MODE === 'production' ? 'production' : 'development',
  }
}
