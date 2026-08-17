import { Directory, Filesystem } from '@capacitor/filesystem'
import type { CachedContent, ContentCache } from '../contracts'

const MAX_ITEMS = 50
const MAX_BYTES = 50 * 1024 * 1024
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const PUBLIC_KINDS = new Set<CachedContent['kind']>(['listing', 'business', 'event', 'bender'])
const INDEX_PATH = 'bend-public-cache/index.json'
type Entry = CachedContent & { lastAccessedAt: string }
const PUBLIC_FIELDS: Record<CachedContent['kind'], string[]> = {
  listing: ['id', 'type', 'category', 'title', 'description', 'quantity', 'unit', 'urgency', 'pricing_type', 'is_free', 'price', 'price_max', 'price_unit', 'price_text', 'expiry_date', 'status', 'images', 'shop', 'posted_by', 'created_at'],
  business: ['id', 'name', 'business_type', 'description', 'avatar_url', 'website', 'address', 'city', 'state', 'zip_code', 'listings'],
  event: ['id', 'title', 'description', 'start_date', 'end_date', 'location', 'category', 'source', 'source_url', 'is_featured', 'created_at'],
  bender: ['id', 'caption', 'media_url', 'media_thumbnail_url', 'media_type', 'created_at', 'author', 'like_count', 'comment_count'],
}
export function normalizePublicContent(kind: CachedContent['kind'], input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => normalizePublicContent(kind, item))
  if (!input || typeof input !== 'object') return input
  const source = input as Record<string, unknown>
  const nested = (value: unknown, nestedKind: CachedContent['kind'] = kind) => {
    if (Array.isArray(value)) return value.map((item) => nested(item, nestedKind))
    if (!value || typeof value !== 'object') return value
    const object = value as Record<string, unknown>
    if (nestedKind === 'listing' && ('title' in object || 'description' in object)) return normalizePublicContent('listing', object)
    if (nestedKind === 'business' && ('listings' in object || 'business_type' in object)) return normalizePublicContent('business', object)
    const fields = ['id', 'name', 'business_type', 'avatar_url', 'shop_name', 'url', 'thumbnail_url', 'type']
    return Object.fromEntries(fields.filter((field) => field in object).map((field) => [field, object[field]]))
  }
  return Object.fromEntries(PUBLIC_FIELDS[kind].filter((field) => field in source).map((field) => [field, field === 'listings' ? nested(source[field], 'listing') : ['shop', 'posted_by', 'author'].includes(field) ? nested(source[field]) : field === 'images' && Array.isArray(source[field]) ? source[field].slice(0, 1).map(nested) : source[field]]))
}
const canonicalKey = (kind: CachedContent['kind'], entityId: string) => `${kind}:${entityId}`
const validKey = (key: string, kind: CachedContent['kind'], entityId: string) => key === canonicalKey(kind, entityId) && !/[\\/]/.test(entityId)

let testMemory = new Map<string, Entry>()

export class NativeContentCache implements ContentCache {
  private readonly memory: boolean
  private entries = new Map<string, Entry>()
  private loaded = false
  private queue: Promise<unknown> = Promise.resolve()

  constructor(options: { storage?: 'memory' | 'filesystem' } = {}) { this.memory = options.storage === 'memory' }

  static resetForTests() { testMemory = new Map() }
  private enqueue<T>(task: () => Promise<T>): Promise<T> { const next = this.queue.then(task, task); this.queue = next.catch(() => undefined); return next }

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
    return typeof item.key === 'string' && PUBLIC_KINDS.has(item.kind as CachedContent['kind']) && typeof item.entityId === 'string' && validKey(item.key, item.kind as CachedContent['kind'], item.entityId) && typeof item.cachedAt === 'string' && Number.isFinite(Date.parse(item.cachedAt)) && Date.now() - Date.parse(item.cachedAt) <= MAX_AGE_MS && typeof item.lastAccessedAt === 'string' && typeof item.sizeBytes === 'number' && item.sizeBytes >= 0 && item.sizeBytes <= MAX_BYTES && item.payload !== undefined
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

  private async deleteImage(imagePath: string | null) {
    if (!imagePath || /(^|[\\/])\.\.?([\\/])/.test(imagePath)) return
    try { await Filesystem.deleteFile({ path: imagePath, directory: Directory.Data }) } catch { /* best effort */ }
  }

  private async evict() {
    const ordered = [...this.entries.values()].sort((a, b) => a.lastAccessedAt.localeCompare(b.lastAccessedAt))
    let bytes = ordered.reduce((sum, item) => sum + item.sizeBytes, 0)
    while (ordered.length > MAX_ITEMS || bytes > MAX_BYTES) {
      const item = ordered.shift()
      if (!item) break
      this.entries.delete(item.key)
      await this.deleteImage(item.imagePath)
      bytes -= item.sizeBytes
    }
  }

  async put(content: CachedContent): Promise<void> { return this.enqueue(() => this.putInternal(content)) }
  private async putInternal(content: CachedContent): Promise<void> {
    await this.load()
    if (!PUBLIC_KINDS.has(content.kind)) throw new Error('PUBLIC_CONTENT_ONLY')
    if (!validKey(content.key, content.kind, content.entityId)) throw new Error('INVALID_CACHE_KEY')
    if (content.imagePath && /(^|[\\/])\.\.?([\\/])/.test(content.imagePath)) throw new Error('INVALID_CACHE_IMAGE_PATH')
    const previous = this.entries.get(content.key)
    let imageBytes = 0
    if (content.imagePath) { try { imageBytes = (await Filesystem.stat({ path: content.imagePath, directory: Directory.Data })).size ?? 0 } catch { imageBytes = 0 } }
    const payload = normalizePublicContent(content.kind, content.payload)
    const sizeBytes = new TextEncoder().encode(JSON.stringify({ key: content.key, kind: content.kind, entityId: content.entityId, cachedAt: content.cachedAt, payload })).byteLength + imageBytes
    if (sizeBytes > MAX_BYTES) return
    this.entries.set(content.key, { ...content, payload, imagePath: content.imagePath ?? null, sizeBytes, lastAccessedAt: new Date().toISOString() })
    if (previous?.imagePath && previous.imagePath !== content.imagePath) await this.deleteImage(previous.imagePath)
    await this.evict()
    await this.persist()
  }

  async get(key: string): Promise<CachedContent | null> { return this.enqueue(() => this.getInternal(key)) }
  private async getInternal(key: string): Promise<CachedContent | null> {
    await this.load()
    const item = this.entries.get(key)
    if (!item) return null
    if (!Number.isFinite(Date.parse(item.cachedAt)) || Date.now() - Date.parse(item.cachedAt) > MAX_AGE_MS) { this.entries.delete(key); await this.persist(); return null }
    item.lastAccessedAt = new Date().toISOString()
    await this.persist()
    return { ...item }
  }

  async remove(key: string) { return this.enqueue(async () => { await this.load(); const item = this.entries.get(key); this.entries.delete(key); if (item) await this.deleteImage(item.imagePath); await this.persist() }) }
  async clear() { return this.enqueue(async () => { await this.load(); await Promise.all([...this.entries.values()].map((item) => this.deleteImage(item.imagePath))); this.entries.clear(); await this.persist() }) }
  async stats() { return this.enqueue(async () => { await this.load(); return { items: this.entries.size, bytes: [...this.entries.values()].reduce((sum, item) => sum + item.sizeBytes, 0) } }) }
}

export const nativeContentCache = new NativeContentCache()
