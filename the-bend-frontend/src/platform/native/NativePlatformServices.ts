import type { PlatformServices } from '../contracts'
import { UnsupportedPlatformOperation } from '../unsupportedPlatformOperation'
import { NativeSessionStore } from './NativeSessionStore'

const unsupported = (operation: string): never => { throw new UnsupportedPlatformOperation(operation) }
const asyncStub = (operation: string) => async (...args: unknown[]) => { void args; return unsupported(operation) }
const syncStub = (operation: string) => (...args: unknown[]) => { void args; return unsupported(operation) }

export function createNativePlatformServices(): PlatformServices {
  return {
    sessionStore: new NativeSessionStore(),
    push: { explainAndRequest: asyncStub('explainAndRequest'), register: asyncStub('register'), unregister: asyncStub('unregister'), addTapListener: asyncStub('addTapListener') },
    deepLinks: { parse: syncStub('parse'), addListener: asyncStub('addListener') },
    browser: { open: asyncStub('open'), close: asyncStub('close') },
    media: { pickPhoto: asyncStub('pickPhoto'), capturePhoto: asyncStub('capturePhoto'), captureVideo: asyncStub('captureVideo') },
    location: { getForegroundPosition: asyncStub('getForegroundPosition') },
    share: { share: asyncStub('share') },
    network: { getStatus: asyncStub('getStatus'), addListener: asyncStub('addListener') },
    cache: { put: asyncStub('put'), get: asyncStub('get'), remove: asyncStub('remove'), clear: asyncStub('clear'), stats: asyncStub('stats') },
    analytics: { capture: syncStub('capture'), identify: syncStub('identify'), reset: syncStub('reset'), setOptOut: asyncStub('setOptOut'), isOptedOut: asyncStub('isOptedOut') },
    crashes: { captureException: syncStub('captureException') },
  }
}
