import type { PlatformServices } from '../contracts'
import { UnsupportedPlatformOperation } from '../unsupportedPlatformOperation'
import { NativeSessionStore } from './NativeSessionStore'
import { NativePushService } from './NativePushService'
import { Capacitor } from '@capacitor/core'
import { NativeMediaService } from './NativeMediaService'
import { NativeLocationService } from './NativeLocationService'
import { NativeShareService } from './NativeShareService'
import { NativeBrowserService } from './NativeBrowserService'

const unsupported = (operation: string): never => { throw new UnsupportedPlatformOperation(operation) }
const asyncStub = (operation: string) => async (...args: unknown[]) => { void args; return unsupported(operation) }
const syncStub = (operation: string) => (...args: unknown[]) => { void args; return unsupported(operation) }

export function createNativePlatformServices(): PlatformServices {
  const platform = Capacitor.getPlatform() === 'android' ? 'android' : 'ios'
  return {
    sessionStore: new NativeSessionStore(),
    push: new NativePushService({ platform, appVersion: import.meta.env.VITE_APP_VERSION ?? '0.0.0', buildNumber: import.meta.env.VITE_BUILD_NUMBER ?? '0', locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US' }),
    deepLinks: { parse: syncStub('parse'), addListener: asyncStub('addListener') },
    browser: new NativeBrowserService(),
    media: new NativeMediaService(),
    location: new NativeLocationService(),
    share: new NativeShareService(),
    network: { getStatus: asyncStub('getStatus'), addListener: asyncStub('addListener') },
    cache: { put: asyncStub('put'), get: asyncStub('get'), remove: asyncStub('remove'), clear: asyncStub('clear'), stats: asyncStub('stats') },
    analytics: { capture: syncStub('capture'), identify: syncStub('identify'), reset: syncStub('reset'), setOptOut: asyncStub('setOptOut'), isOptedOut: asyncStub('isOptedOut') },
    crashes: { captureException: syncStub('captureException') },
  }
}
