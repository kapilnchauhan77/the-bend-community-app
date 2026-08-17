import { Preferences } from '@capacitor/preferences'

export type LocalDraft = { fields: Record<string, unknown>; localMediaUris: string[] }
type StorageMode = 'memory' | 'preferences'
let testMemory = new Map<string, LocalDraft>()

export class DraftStore {
  private readonly mode: StorageMode
  constructor(options: { storage?: StorageMode } = {}) { this.mode = options.storage === 'memory' ? 'memory' : 'preferences' }
  static resetForTests() { testMemory = new Map() }
  async save(key: string, draft: LocalDraft) {
    const safe = { fields: draft.fields, localMediaUris: draft.localMediaUris }
    if (this.mode === 'memory') { testMemory.set(key, safe); return }
    await Preferences.set({ key: `bend.draft.${key}`, value: JSON.stringify(safe) })
  }
  async load(key: string): Promise<LocalDraft | null> {
    if (this.mode === 'memory') return testMemory.get(key) ?? null
    const result = await Preferences.get({ key: `bend.draft.${key}` })
    if (!result.value) return null
    try { const parsed = JSON.parse(result.value) as LocalDraft; return parsed && parsed.fields && Array.isArray(parsed.localMediaUris) ? parsed : null } catch { return null }
  }
  async remove(key: string) { if (this.mode === 'memory') testMemory.delete(key); else await Preferences.remove({ key: `bend.draft.${key}` }) }
  async clearPrivateDrafts() { if (this.mode === 'memory') { testMemory.clear(); return } const keys = await Preferences.keys(); await Promise.all(keys.keys.filter((key) => key.startsWith('bend.draft.')).map((key) => Preferences.remove({ key }))) }
}

export const draftStore = new DraftStore()
