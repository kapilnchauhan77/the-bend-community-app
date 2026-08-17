import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage'
import type { SessionStore, StoredSession } from '../contracts'

const SESSION_KEY = 'bend.refresh-session'

export class NativeSessionStore implements SessionStore {
  readonly kind = 'native'

  async load(): Promise<StoredSession | null> {
    await SecureStorage.setSynchronize(false)
    const value = await SecureStorage.get(SESSION_KEY, false, false)
    return value ? { refreshToken: String(value) } : null
  }

  async save(session: StoredSession): Promise<void> {
    await SecureStorage.setSynchronize(false)
    await SecureStorage.set(SESSION_KEY, session.refreshToken, false, false, KeychainAccess.whenUnlockedThisDeviceOnly)
  }

  async clear(): Promise<void> {
    await SecureStorage.remove(SESSION_KEY, false)
  }
}
