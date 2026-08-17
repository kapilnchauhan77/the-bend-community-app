import type { SessionStore, StoredSession } from '../contracts'

const REFRESH_TOKEN_KEY = 'refresh_token'

export class WebSessionStore implements SessionStore {
  readonly kind = 'web'

  async load(): Promise<StoredSession | null> {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    return refreshToken ? { refreshToken } : null
  }

  async save(session: StoredSession): Promise<void> {
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken)
  }

  async clear(): Promise<void> {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }
}
