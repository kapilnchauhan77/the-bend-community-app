import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import type { CachedContent, ContentCache } from '../contracts'

const MAX_ITEMS = 50
const MAX_BYTES = 50 * 1024 * 1024
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const PUBLIC_KINDS = new Set<CachedContent['kind']>(['listing', 'business', 'event', 'bender'])
const INDEX_PATH = 'bend-public-cache/index.json'
type Entry = CachedContent & { lastAccessedAt: string }
type PublicObject = Record<string, unknown>
type Projector = (source: PublicObject) => PublicObject

const isObject = (value: unknown): value is PublicObject => !!value && typeof value === 'object' && !Array.isArray(value)
const pick = (source: PublicObject, fields: readonly string[]): PublicObject =>
  Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(source, field)).map((field) => [field, source[field]]))

const projectListingImage: Projector = (source) => pick(source, ['url', 'thumbnail_url'])
const projectListingShop: Projector = (source) => pick(source, ['id', 'name', 'business_type', 'avatar_url', 'address', 'contact_phone', 'whatsapp'])
const projectListingPoster: Projector = (source) => pick(source, ['id', 'name', 'avatar_url'])
const projectBenderAuthor: Projector = (source) => pick(source, ['id', 'name', 'avatar_url', 'shop_id', 'shop_name'])

const projectListing: Projector = (source) => {
  const result = pick(source, [
    'id', 'type', 'category', 'title', 'description', 'quantity', 'unit', 'urgency', 'pricing_type', 'is_free',
    'price', 'price_max', 'price_unit', 'price_text', 'expiry_date', 'status', 'interest_count', 'views_count', 'created_at',
  ])
  if (isObject(source.shop)) result.shop = projectListingShop(source.shop)
  else if (source.shop === null) result.shop = null
  if (isObject(source.posted_by)) result.posted_by = projectListingPoster(source.posted_by)
  else if (source.posted_by === null) result.posted_by = null
  if (Array.isArray(source.images)) result.images = source.images.filter(isObject).slice(0, 1).map(projectListingImage)
  return result
}

const projectBusiness: Projector = (source) => {
  const result = pick(source, [
    'id', 'name', 'business_type', 'description', 'avatar_url', 'website', 'address', 'city', 'state', 'zip_code',
    'contact_phone', 'whatsapp', 'status', 'active_listings_count', 'total_fulfilled',
    'endorsement_count', 'member_since',
  ])
  if (Array.isArray(source.listings)) result.listings = source.listings.filter(isObject).map(projectListing)
  return result
}

const projectEvent: Projector = (source) => pick(source, [
  'id', 'title', 'description', 'start_date', 'end_date', 'location', 'category', 'image_url', 'source', 'source_url',
  'is_featured', 'status', 'created_at',
])

const projectBender: Projector = (source) => {
  const result = pick(source, ['id', 'caption', 'media_url', 'media_thumbnail_url', 'media_type', 'created_at', 'like_count', 'comment_count'])
  if (isObject(source.author)) result.author = projectBenderAuthor(source.author)
  return result
}

const PROJECTORS: Record<CachedContent['kind'], Projector> = {
  listing: projectListing,
  business: projectBusiness,
  event: projectEvent,
  bender: projectBender,
}

export function normalizePublicContent(kind: CachedContent['kind'], input: unknown): unknown {
  const projector = PROJECTORS[kind]
  if (Array.isArray(input)) return input.filter(isObject).map(projector)
  if (!isObject(input)) return input
  if (Array.isArray(input.items)) {
    return {
      items: input.items.filter(isObject).map(projector),
      ...pick(input, ['next_cursor', 'has_more']),
    }
  }
  return projector(input)
}
const canonicalKey = (kind: CachedContent['kind'], entityId: string) => `${kind}:${entityId}`
const validKey = (key: string, kind: CachedContent['kind'], entityId: string) => key === canonicalKey(kind, entityId) && !/[\\/]/.test(entityId)
const safeImagePath = (path: string) => path.startsWith('bend-public-cache/images/') && !path.includes('..') && !path.startsWith('/') && !path.includes('\\')

let testMemory = new Map<string, Entry>()

export class NativeContentCache implements ContentCache {
  private readonly memory: boolean
  private entries = new Map<string, Entry>()
  private loaded = false
  private queue: Promise<unknown> = Promise.resolve()

  constructor(options: { storage?: 'memory' | 'filesystem' } = {}) { this.memory = options.storage === 'memory' }

  static resetForTests() { testMemory = new Map() }
  private enqueue<T>(task: () => Promise<T>): Promise<T> { const next = this.queue.then(task, task); this.queue = next.catch(() => undefined); return next }

  private async readIndex(path: string): Promise<unknown> {
    const result = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 })
    const parsed = JSON.parse(String(result.data)) as unknown
    if (!Array.isArray(parsed)) throw new Error('INVALID_CACHE_INDEX')
    return parsed
  }

  private async cleanupArtifact(path: string) {
    try { await Filesystem.deleteFile({ path, directory: Directory.Data }) } catch { /* best effort */ }
  }

  private async load() {
    if (this.loaded) return
    this.loaded = true
    if (this.memory) { this.entries = testMemory; return }
    let parsed: unknown
    let recoveredFromBackup = false
    try {
      parsed = await this.readIndex(INDEX_PATH)
    } catch {
      try {
        parsed = await this.readIndex(`${INDEX_PATH}.bak`)
        recoveredFromBackup = true
        try { await Filesystem.deleteFile({ path: INDEX_PATH, directory: Directory.Data }) } catch { /* primary is missing */ }
        try {
          await Filesystem.rename({ from: `${INDEX_PATH}.bak`, to: INDEX_PATH, directory: Directory.Data })
          recoveredFromBackup = false
        } catch { /* keep the valid backup if promotion is unavailable */ }
      } catch {
        await this.cleanupArtifact(`${INDEX_PATH}.tmp`)
        return /* missing or malformed cache is treated as empty */
      }
    }

    const safeEntries: Entry[] = []
    const possibleOrphanImages = new Set<string>()
    for (const value of parsed as unknown[]) {
      if (this.valid(value) && (!value.imagePath || safeImagePath(value.imagePath))) {
        safeEntries.push({ ...value, payload: normalizePublicContent(value.kind, value.payload) })
      } else if (value && typeof value === 'object') {
        const imagePath = (value as Partial<Entry>).imagePath
        if (typeof imagePath === 'string' && safeImagePath(imagePath)) possibleOrphanImages.add(imagePath)
      }
    }
    safeEntries.forEach((entry) => this.entries.set(entry.key, entry))
    await this.evict()
    const retained = [...this.entries.values()]
    const referencedImages = new Set(retained.map((entry) => entry.imagePath).filter((path): path is string => !!path))
    safeEntries.forEach((entry) => { if (entry.imagePath && this.entries.get(entry.key) !== entry) possibleOrphanImages.add(entry.imagePath) })
    await Promise.all([...possibleOrphanImages].filter((path) => !referencedImages.has(path)).map((path) => this.deleteImage(path)))
    await this.cleanupArtifact(`${INDEX_PATH}.tmp`)
    if (!recoveredFromBackup) await this.cleanupArtifact(`${INDEX_PATH}.bak`)
    if (JSON.stringify(parsed) !== JSON.stringify(retained)) await this.persist()
  }

  private valid(value: unknown): value is Entry {
    if (!value || typeof value !== 'object') return false
    const item = value as Partial<Entry>
    return typeof item.key === 'string' && PUBLIC_KINDS.has(item.kind as CachedContent['kind']) && typeof item.entityId === 'string' && validKey(item.key, item.kind as CachedContent['kind'], item.entityId) && typeof item.cachedAt === 'string' && Number.isFinite(Date.parse(item.cachedAt)) && Date.now() - Date.parse(item.cachedAt) <= MAX_AGE_MS && typeof item.lastAccessedAt === 'string' && Number.isFinite(Date.parse(item.lastAccessedAt)) && typeof item.sizeBytes === 'number' && item.sizeBytes >= 0 && item.sizeBytes <= MAX_BYTES && item.payload !== undefined
  }

  private async persist() {
    if (this.memory) { testMemory = this.entries; return }
    try {
      await Filesystem.mkdir({ path: 'bend-public-cache', directory: Directory.Data, recursive: true })
      const data = JSON.stringify([...this.entries.values()])
      const temporaryPath = `${INDEX_PATH}.tmp`
      const backupPath = `${INDEX_PATH}.bak`
      await Filesystem.writeFile({ path: temporaryPath, directory: Directory.Data, data, encoding: Encoding.UTF8 })

      let movedExisting = false
      try { await Filesystem.deleteFile({ path: backupPath, directory: Directory.Data }) } catch { /* no stale backup */ }
      try {
        await Filesystem.rename({ from: INDEX_PATH, to: backupPath, directory: Directory.Data })
        movedExisting = true
      } catch { /* the index may not exist yet */ }

      try {
        await Filesystem.rename({ from: temporaryPath, to: INDEX_PATH, directory: Directory.Data })
      } catch {
        if (movedExisting) {
          try { await Filesystem.deleteFile({ path: INDEX_PATH, directory: Directory.Data }) } catch { /* no partial destination */ }
          try { await Filesystem.rename({ from: backupPath, to: INDEX_PATH, directory: Directory.Data }) } catch { /* retain whichever valid file the provider preserved */ }
        }
        return
      }
      if (movedExisting) await this.cleanupArtifact(backupPath)
    } catch { /* cache is best effort */ }
  }

  private async deleteImage(imagePath: string | null) {
    if (!imagePath || !safeImagePath(imagePath)) return
    try { await Filesystem.deleteFile({ path: imagePath, directory: Directory.Data }) } catch { /* best effort */ }
  }

  private async deleteImageIfUnreferenced(imagePath: string | null) {
    if (!imagePath || [...this.entries.values()].some((entry) => entry.imagePath === imagePath)) return
    await this.deleteImage(imagePath)
  }

  private async evict() {
    const ordered = [...this.entries.values()].sort((a, b) => a.lastAccessedAt.localeCompare(b.lastAccessedAt))
    let bytes = ordered.reduce((sum, item) => sum + item.sizeBytes, 0)
    while (ordered.length > MAX_ITEMS || bytes > MAX_BYTES) {
      const item = ordered.shift()
      if (!item) break
      this.entries.delete(item.key)
      await this.deleteImageIfUnreferenced(item.imagePath)
      bytes -= item.sizeBytes
    }
  }

  async put(content: CachedContent): Promise<void> { return this.enqueue(() => this.putInternal(content)) }
  private async putInternal(content: CachedContent): Promise<void> {
    await this.load()
    if (!PUBLIC_KINDS.has(content.kind)) throw new Error('PUBLIC_CONTENT_ONLY')
    if (!validKey(content.key, content.kind, content.entityId)) throw new Error('INVALID_CACHE_KEY')
    if (content.imagePath && !safeImagePath(content.imagePath)) throw new Error('INVALID_CACHE_IMAGE_PATH')
    const previous = this.entries.get(content.key)
    let imageBytes = 0
    if (content.imagePath) { try { imageBytes = (await Filesystem.stat({ path: content.imagePath, directory: Directory.Data })).size ?? 0 } catch { imageBytes = 0 } }
    const payload = normalizePublicContent(content.kind, content.payload)
    const sizeBytes = new TextEncoder().encode(JSON.stringify({ key: content.key, kind: content.kind, entityId: content.entityId, cachedAt: content.cachedAt, payload })).byteLength + imageBytes
    if (sizeBytes > MAX_BYTES) return
    this.entries.set(content.key, { ...content, payload, imagePath: content.imagePath ?? null, sizeBytes, lastAccessedAt: new Date().toISOString() })
    if (previous?.imagePath && previous.imagePath !== content.imagePath) await this.deleteImageIfUnreferenced(previous.imagePath)
    await this.evict()
    await this.persist()
  }

  async get(key: string): Promise<CachedContent | null> { return this.enqueue(() => this.getInternal(key)) }
  private async getInternal(key: string): Promise<CachedContent | null> {
    await this.load()
    const item = this.entries.get(key)
    if (!item) return null
    if (!Number.isFinite(Date.parse(item.cachedAt)) || Date.now() - Date.parse(item.cachedAt) > MAX_AGE_MS) { this.entries.delete(key); await this.deleteImageIfUnreferenced(item.imagePath); await this.persist(); return null }
    item.lastAccessedAt = new Date().toISOString()
    await this.persist()
    return { ...item }
  }

  async remove(key: string) { return this.enqueue(async () => { await this.load(); const item = this.entries.get(key); this.entries.delete(key); if (item) await this.deleteImageIfUnreferenced(item.imagePath); await this.persist() }) }
  async clear() { return this.enqueue(async () => { await this.load(); const paths = new Set([...this.entries.values()].map((item) => item.imagePath).filter((path): path is string => !!path)); this.entries.clear(); await Promise.all([...paths].map((path) => this.deleteImage(path))); await this.persist() }) }
  async stats() { return this.enqueue(async () => { await this.load(); return { items: this.entries.size, bytes: [...this.entries.values()].reduce((sum, item) => sum + item.sizeBytes, 0) } }) }
}

export const nativeContentCache = new NativeContentCache()
