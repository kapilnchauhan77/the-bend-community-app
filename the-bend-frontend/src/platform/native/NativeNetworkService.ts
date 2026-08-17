import { Network } from '@capacitor/network'
import type { NetworkService, RemoveListener } from '../contracts'

export class NativeNetworkService implements NetworkService {
  async getStatus() { return (await Network.getStatus()).connected ? 'online' as const : 'offline' as const }
  async addListener(handler: (status: 'online' | 'offline') => void): Promise<RemoveListener> {
    const listener = await Network.addListener('networkStatusChange', (status) => handler(status.connected ? 'online' : 'offline'))
    return { remove: () => listener.remove() }
  }
}
