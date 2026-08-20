export const WESTMORELAND_PUBLIC_ORIGIN = 'https://westmoreland.bend.community'

export function publicWestmorelandUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) throw new TypeError('Expected a root-relative path')
  if (path.includes('\\') || [...path].some((char) => /\s/.test(char) || char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) throw new TypeError('Path contains unsafe characters')
  if (/%(?:2f|5c)/i.test(path)) throw new TypeError('Path contains an encoded delimiter')

  const pathname = path.split(/[?#]/, 1)[0]
  if (pathname.split('/').some((segment) => segment === '.' || segment === '..')) throw new TypeError('Path contains dot-segment traversal')
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) throw new TypeError('Expected a relative path')

  return `${WESTMORELAND_PUBLIC_ORIGIN}${path}`
}
