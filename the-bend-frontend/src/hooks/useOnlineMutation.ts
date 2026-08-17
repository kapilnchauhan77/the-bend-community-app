import { useCallback, useEffect, useState } from 'react'
import { usePlatformServices } from '@/platform/createPlatformServices'

export function useOnlineMutation() {
  const { network } = usePlatformServices()
  const [online, setOnline] = useState<boolean | null>(null)
  useEffect(() => { let active = true; let remove: (() => Promise<void>) | undefined; network.getStatus().then((status) => active && setOnline(status === 'online')); network.addListener((status) => setOnline(status === 'online')).then((listener) => { remove = listener.remove }); return () => { active = false; remove?.() } }, [network])
  const run = useCallback(async <T,>(mutation: () => Promise<T>) => { if (online !== true) throw new Error('OFFLINE_ACTION_UNAVAILABLE'); return mutation() }, [online])
  return { online: online === true, ready: online !== null, run }
}
