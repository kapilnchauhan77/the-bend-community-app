import type { ReactElement } from 'react'
import { findFirstSafeExternalUrl } from '@/lib/safeExternalUrl'
import { usePlatformServices } from '@/platform/createPlatformServices'

export interface BenderCaptionLinkCardProps {
  caption: string | null
}

export function BenderCaptionLinkCard({ caption }: BenderCaptionLinkCardProps): ReactElement | null {
  const safeUrl = findFirstSafeExternalUrl(caption)
  const services = usePlatformServices()

  if (!safeUrl) return null

  return (
    <div className="native-bender-caption-link-card mt-2 rounded-md border border-[hsl(35,18%,88%)] px-2 py-2 text-[12px]">
      <a
        href={safeUrl.href}
        target="_blank"
        rel="noopener noreferrer"
        className="block min-w-0 overflow-wrap-anywhere"
        onClick={(event) => {
          event.preventDefault()
          void services.browser.open(safeUrl.href)
        }}
      >
        <span className="block font-semibold">{safeUrl.hostname}</span>
        <span className="block break-all text-[hsl(30,10%,50%)]">{safeUrl.original}</span>
      </a>
    </div>
  )
}
