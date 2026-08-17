import { useCallback, useEffect, useState } from 'react'
import { usePlatformServices } from '@/platform/createPlatformServices'

export function useOnlineMutation() {
  const { network } = usePlatformServices()
  const [online, setOnline] = useState(true)
  useEffect(() => { let active = true; let remove: (() => Promise<void>) | undefined; network.getStatus().then((status) => active && setOnline(status === 'online')); network.addListener((status) => setOnline(status === 'online')).then((listener) => { remove = listener.remove }); return () => { active = false; remove?.() } }, [network])
  const run = useCallback(async <T,>(mutation: () => Promise<T>) => { if (!online) throw new Error('OFFLINE_ACTION_UNAVAILABLE'); return mutation() }, [online])
  return { online, run }
}
