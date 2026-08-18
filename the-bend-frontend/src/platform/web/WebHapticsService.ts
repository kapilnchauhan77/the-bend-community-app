import type { HapticsService } from '../contracts'
export class WebHapticsService implements HapticsService {
  async selection(): Promise<void> { return undefined }
  async impact(): Promise<void> { return undefined }
  async success(): Promise<void> { return undefined }
}
