import { Directory, Filesystem } from '@capacitor/filesystem'
import type { CachedContent, ContentCache } from '../contracts'

const MAX_ITEMS = 50
const MAX_BYTES = 50 * 1024 * 1024
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const PUBLIC_KINDS = new Set<CachedContent['kind']>(['listing', 'business', 'event', 'bender'])
const INDEX_PATH = 'bend-public-cache/index.json'
type Entry = CachedContent & { lastAccessedAt: string }

let testMemory = new Map<string, Entry>()

export class NativeContentCache implements ContentCache {
  private readonly memory: boolean
  private entries = new Map<string, Entry>()
  private loaded = false

  constructor(options: { storage?: 'memory' | 'filesystem' } = {}) { this.memory = options.storage === 'memory' }

  static resetForTests() { testMemory = new Map() }

  private async load() {
    if (this.loaded) return
    this.loaded = true
    if (this.memory) { this.entries = testMemory; return }
    try {
      const result = await Filesystem.readFile({ path: INDEX_PATH, directory: Directory.Data, encoding: 'utf8' })
      const parsed = JSON.parse(String(result.data)) as unknown
      if (!Array.isArray(parsed)) return
      for (const value of parsed) {
        if (this.valid(value)) this.entries.set(value.key, value)
      }
      await this.evict()
    } catch { /* missing or malformed cache is treated as empty */ }
  }

  private valid(value: unknown): value is Entry {
    if (!value || typeof value !== 'object') return false
    const item = value as Partial<Entry>
    return typeof item.key === 'string' && PUBLIC_KINDS.has(item.kind as CachedContent['kind']) && typeof item.entityId === 'string' && typeof item.cachedAt === 'string' && Number.isFinite(Date.parse(item.cachedAt)) && Date.now() - Date.parse(item.cachedAt) <= MAX_AGE_MS && typeof item.lastAccessedAt === 'string' && typeof item.sizeBytes === 'number' && item.sizeBytes >= 0 && item.sizeBytes <= MAX_BYTES && item.payload !== undefined
  }

  private async persist() {
    if (this.memory) { testMemory = this.entries; return }
    try {
      await Filesystem.mkdir({ path: 'bend-public-cache', directory: Directory.Data, recursive: true })
      const data = JSON.stringify([...this.entries.values()])
      await Filesystem.writeFile({ path: `${INDEX_PATH}.tmp`, directory: Directory.Data, data, encoding: 'utf8' })
      await Filesystem.rename({ from: `${INDEX_PATH}.tmp`, to: INDEX_PATH, directory: Directory.Data })
    } catch { /* cache is best effort */ }
  }

  private async evict() {
    const ordered = [...this.entries.values()].sort((a, b) => a.lastAccessedAt.localeCompare(b.lastAccessedAt))
    let bytes = ordered.reduce((sum, item) => sum + item.sizeBytes, 0)
    while (ordered.length > MAX_ITEMS || bytes > MAX_BYTES) {
      const item = ordered.shift()
      if (!item) break
      this.entries.delete(item.key)
      bytes -= item.sizeBytes
    }
  }

  async put(content: CachedContent): Promise<void> {
    await this.load()
    if (!PUBLIC_KINDS.has(content.kind)) throw new Error('PUBLIC_CONTENT_ONLY')
    if (content.sizeBytes > MAX_BYTES || content.sizeBytes < 0) return
    this.entries.set(content.key, { ...content, imagePath: content.imagePath ?? null, lastAccessedAt: new Date().toISOString() })
    await this.evict()
    await this.persist()
  }

  async get(key: string): Promise<CachedContent | null> {
    await this.load()
    const item = this.entries.get(key)
    if (!item) return null
    if (!Number.isFinite(Date.parse(item.cachedAt)) || Date.now() - Date.parse(item.cachedAt) > MAX_AGE_MS) { this.entries.delete(key); await this.persist(); return null }
    item.lastAccessedAt = new Date().toISOString()
    await this.persist()
    return { ...item }
  }

  async remove(key: string) { await this.load(); this.entries.delete(key); await this.persist() }
  async clear() { await this.load(); this.entries.clear(); await this.persist() }
  async stats() { await this.load(); return { items: this.entries.size, bytes: [...this.entries.values()].reduce((sum, item) => sum + item.sizeBytes, 0) } }
}

export const nativeContentCache = new NativeContentCache()
