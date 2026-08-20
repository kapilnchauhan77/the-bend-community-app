export interface SafeExternalUrl {
  href: string
  hostname: string
  original: string
}

export function parseSafeExternalUrl(raw: string | null | undefined): SafeExternalUrl | null {
  if (!raw) return null
  const original = raw.trim()
  if (!original || [...original].some((char) => /\s/.test(char) || char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) return null

  try {
    const url = new URL(original)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return { href: url.href, hostname: url.hostname, original }
  } catch {
    return null
  }
}

export function findFirstSafeExternalUrl(text: string | null | undefined): SafeExternalUrl | null {
  if (!text) return null
  const candidates = text.match(/https?:\/\/[^\s<>]+/gi) ?? []
  for (const candidate of candidates) {
    const trimmed = candidate.replace(/[.,!?;:]+$/, '')
    const parsed = parseSafeExternalUrl(trimmed)
    if (parsed) return parsed
  }
  return null
}
