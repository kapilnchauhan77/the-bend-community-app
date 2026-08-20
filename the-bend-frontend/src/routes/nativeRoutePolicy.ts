export const NATIVE_ROOT_DESTINATIONS: ReadonlySet<string> = new Set(['/', '/explore', '/bender', '/you'])

export function showsNativeBottomNavigation(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return NATIVE_ROOT_DESTINATIONS.has(normalized)
}
