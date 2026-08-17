import type { ShareService } from '../contracts'

export class NativeShareService implements ShareService {
  async share(input: { title: string; text: string; url: string }) {
    try {
      const { Share } = await import('@capacitor/share')
      await Share.share(input)
      return 'shared' as const
    } catch {
      return 'cancelled' as const
    }
  }
}
