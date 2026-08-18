import { useEffect, useRef } from 'react'

interface NativeFilterSheetProps {
  open: boolean
  title?: string
  onClose(): void
  returnFocusRef?: React.RefObject<HTMLElement | null>
  children: React.ReactNode
}

export function NativeFilterSheet({ open, title = 'Filters', onClose, returnFocusRef, children }: NativeFilterSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const trigger = returnFocusRef?.current
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !sheetRef.current) return
      const controls = [...sheetRef.current.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((element) => !element.hasAttribute('disabled'))
      if (!controls.length) return
      const index = controls.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)?.focus() }
      else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0]?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); trigger?.focus() }
  }, [open, onClose, returnFocusRef])

  if (!open) return null
  return <div className="native-sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="native-filter-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="native-sheet-title"><button className="native-control" ref={closeRef} type="button" aria-label="Close filters" onClick={onClose}>×</button><h2 id="native-sheet-title">{title}</h2>{children}</div></div>
}
