import { useCallback, useEffect, useState } from 'react'
import { usePlatformServices } from '@/platform/createPlatformServices'

export function useOnlineMutation() {
  const { network } = usePlatformServices()
  const [online, setOnline] = useState<boolean | null>(null)
  useEffect(() => {
    let active = true
    let generation = 0
    let removed = false
    const onStatus = (status: 'online' | 'offline') => { if (active) { generation += 1; setOnline(status === 'online') } }
    const listenerPromise = Promise.resolve()
      .then(() => network.addListener(onStatus))
      .then((listener) => {
        if (!active && !removed) { removed = true; void listener.remove() }
        return listener
      })
      .catch(() => null)
    void Promise.resolve()
      .then(() => network.getStatus())
      .then((status) => { if (active && generation === 0) setOnline(status === 'online') })
      .catch(() => { if (active && generation === 0) setOnline(false) })
    return () => {
      active = false
      void listenerPromise.then((listener) => {
        if (listener && !removed) { removed = true; void listener.remove() }
      })
    }
  }, [network])
  const run = useCallback(async <T,>(mutation: () => Promise<T>) => { if (online !== true) throw new Error('OFFLINE_ACTION_UNAVAILABLE'); return mutation() }, [online])
  return { online: online === true, ready: online !== null, run }
}
