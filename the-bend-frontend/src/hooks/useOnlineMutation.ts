import { useCallback, useEffect, useState } from 'react'
import { usePlatformServices } from '@/platform/createPlatformServices'

export function useOnlineMutation() {
  const { network } = usePlatformServices()
  const [online, setOnline] = useState<boolean | null>(null)
  useEffect(() => {
    let active = true
    let remove: (() => Promise<void>) | undefined
    let generation = 0
    const onStatus = (status: 'online' | 'offline') => { if (active) { generation += 1; setOnline(status === 'online') } }
    const listenerPromise = network.addListener(onStatus)
    listenerPromise.then((listener) => { if (!active) void listener.remove(); else remove = listener.remove })
    network.getStatus().then((status) => { if (active && generation === 0) setOnline(status === 'online') })
    return () => { active = false; void listenerPromise.then((listener) => listener.remove()); void remove?.() }
  }, [network])
  const run = useCallback(async <T,>(mutation: () => Promise<T>) => { if (online !== true) throw new Error('OFFLINE_ACTION_UNAVAILABLE'); return mutation() }, [online])
  return { online: online === true, ready: online !== null, run }
}
