import type { PlatformServices } from '../contracts'
import { UnsupportedPlatformOperation } from '../unsupportedPlatformOperation'
import { NativeSessionStore } from './NativeSessionStore'

const unsupported = (operation: string) => { throw new UnsupportedPlatformOperation(operation) }
const stub = <T extends object>(methods: (keyof T)[]) => Object.fromEntries(methods.map((method) => [method, (...args: unknown[]) => { void args; return unsupported(String(method)) }])) as T

export function createNativePlatformServices(): PlatformServices {
  return {
    sessionStore: new NativeSessionStore(),
    push: stub(['explainAndRequest', 'register', 'unregister', 'addTapListener']),
    deepLinks: stub(['parse', 'addListener']),
    browser: stub(['open', 'close']),
    media: stub(['pickPhoto', 'capturePhoto', 'captureVideo']),
    location: stub(['getForegroundPosition']),
    share: stub(['share']),
    network: stub(['getStatus', 'addListener']),
    cache: stub(['put', 'get', 'remove', 'clear', 'stats']),
    analytics: stub(['capture', 'identify', 'reset', 'setOptOut', 'isOptedOut']),
    crashes: stub(['captureException']),
  }
}
