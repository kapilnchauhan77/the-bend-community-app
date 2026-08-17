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
    open,
    generation: 1,
    caption: '',
    pending: null as BenderPendingMedia | null,
    hydrated: false,
    dirty: false,
  })
  const writeQueue = useRef<Promise<void>>(Promise.resolve())

  if (state.open !== open) {
    setState({ open, generation: state.generation + 1, caption: '', pending: null, hydrated: false, dirty: false })
  }

  const enqueueWrite = useCallback((operation: () => Promise<void>) => {
    const next = writeQueue.current.then(operation, operation)
    writeQueue.current = next.catch(() => undefined)
    return next
  }, [])

  useEffect(() => {
    const currentGeneration = state.generation
    let active = true
    if (!open) return () => { active = false }

    void (async () => {
      await writeQueue.current
      const draft = await draftStore.load(DRAFT_KEY).catch(() => null)
      if (!active) return
      setState((current) => {
        if (!current.open || current.generation !== currentGeneration) return current
        if (current.dirty) return { ...current, hydrated: true }
        const uri = draft?.localMediaUris[0]
        return {
          ...current,
          caption: typeof draft?.fields.caption === 'string' ? draft.fields.caption : '',
          pending: uri ? { url: uri, thumbnail_url: null, type: 'image' } : null,
          hydrated: true,
        }
      })
    })()

    return () => { active = false }
  }, [open, state.generation])

  useEffect(() => {
    if (!open || !state.hydrated) return
    void enqueueWrite(async () => {
      await draftStore.save(DRAFT_KEY, {
        fields: { caption: state.caption },
        localMediaUris: state.pending?.url.startsWith('file:') ? [state.pending.url] : [],
      })
    })
  }, [enqueueWrite, open, state.caption, state.hydrated, state.pending])

  const setCaption = useCallback((value: string) => setState((current) => ({ ...current, caption: value, dirty: true })), [])
  const setPending = useCallback((value: BenderPendingMedia | null) => setState((current) => ({ ...current, pending: value, dirty: true })), [])
  const discard = useCallback(() => {
    setState((current) => ({ ...current, generation: current.generation + 1, caption: '', pending: null, hydrated: false, dirty: false }))
    return enqueueWrite(() => draftStore.remove(DRAFT_KEY))
  }, [enqueueWrite])

  return { caption: state.caption, setCaption, pending: state.pending, setPending, hydrated: state.hydrated, discard }
}
