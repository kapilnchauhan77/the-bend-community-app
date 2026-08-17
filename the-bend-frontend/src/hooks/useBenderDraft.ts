import { useCallback, useEffect, useRef, useState } from 'react'
import { draftStore } from '@/drafts/DraftStore'

export type BenderPendingMedia = {
  url: string
  thumbnail_url: string | null
  type: 'image' | 'video'
}

const DRAFT_KEY = 'create-bender-post'

export function useBenderDraft(open: boolean) {
  const [state, setState] = useState({
    generation: 0,
    caption: '',
    pending: null as BenderPendingMedia | null,
    hydrated: false,
    dirty: false,
  })
  const writeQueue = useRef<Promise<void>>(Promise.resolve())
  const generation = useRef(0)
  const lastOpen = useRef(false)
  type StoredDraft = Awaited<ReturnType<typeof draftStore.load>>
  const hydration = useRef<{ generation: number; promise: Promise<StoredDraft> } | null>(null)

  const enqueueWrite = useCallback((operation: () => Promise<void>) => {
    const next = writeQueue.current.then(operation, operation)
    writeQueue.current = next.catch(() => undefined)
    return next
  }, [])

  useEffect(() => {
    let active = true
    if (lastOpen.current !== open) {
      lastOpen.current = open
      generation.current += 1
      hydration.current = open
        ? { generation: generation.current, promise: writeQueue.current.then(() => draftStore.load(DRAFT_KEY).catch(() => null)) }
        : null
    }
    const currentGeneration = generation.current
    if (state.generation !== currentGeneration) {
      queueMicrotask(() => {
        if (!active) return
        setState((current) => current.generation === currentGeneration
          ? current
          : { generation: currentGeneration, caption: '', pending: null, hydrated: false, dirty: false })
      })
    }
    if (!open || !hydration.current || hydration.current.generation !== currentGeneration) return () => { active = false }

    void hydration.current.promise.then((draft) => {
      if (!active) return
      setState((current) => {
        if (!lastOpen.current || generation.current !== currentGeneration || current.generation !== currentGeneration) return current
        if (current.dirty) return { ...current, hydrated: true }
        const uri = draft?.localMediaUris[0]
        return {
          ...current,
          caption: typeof draft?.fields.caption === 'string' ? draft.fields.caption : '',
          pending: uri ? { url: uri, thumbnail_url: null, type: 'image' } : null,
          hydrated: true,
        }
      })
    })

    return () => { active = false }
  }, [open, state.generation])

  useEffect(() => {
    if (!open || !state.hydrated || state.generation !== generation.current) return
    void enqueueWrite(async () => {
      await draftStore.save(DRAFT_KEY, {
        fields: { caption: state.caption },
        localMediaUris: state.pending?.url.startsWith('file:') ? [state.pending.url] : [],
      })
    })
  }, [enqueueWrite, open, state.caption, state.generation, state.hydrated, state.pending])

  const setCaption = useCallback((value: string) => setState((current) => ({ ...current, generation: generation.current, caption: value, dirty: true })), [])
  const setPending = useCallback((value: BenderPendingMedia | null) => setState((current) => ({ ...current, generation: generation.current, pending: value, dirty: true })), [])
  const discard = useCallback(() => {
    generation.current += 1
    hydration.current = null
    setState({ generation: generation.current, caption: '', pending: null, hydrated: false, dirty: false })
    return enqueueWrite(() => draftStore.remove(DRAFT_KEY))
  }, [enqueueWrite])

  return { caption: state.caption, setCaption, pending: state.pending, setPending, hydrated: state.hydrated, discard }
}
