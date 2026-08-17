import type { BrowserService } from '../contracts'
import { Capacitor } from '@capacitor/core'
import { UnsupportedPlatformOperation } from '../unsupportedPlatformOperation'

export class NativeBrowserService implements BrowserService {
  async open(url: string) { if (!Capacitor.isNativePlatform()) throw new UnsupportedPlatformOperation('open'); const { Browser } = await import('@capacitor/browser'); await Browser.open({ url }) }
  async close() { if (!Capacitor.isNativePlatform()) throw new UnsupportedPlatformOperation('close'); const { Browser } = await import('@capacitor/browser'); await Browser.close() }
}
