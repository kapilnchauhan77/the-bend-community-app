import { useEffect, useRef, useState, type ReactNode, type UIEvent } from 'react'
import { resolveAssetUrl } from '@/lib/constants'
import type { Sponsor } from '@/types'

export interface NativePartnerCarouselProps {
  partners: Sponsor[]
}

const initialsFor = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length > 1) return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase()
  return (words[0] ?? '?').slice(0, 2).toUpperCase()
}

const websiteFor = (partner: Sponsor) => {
  const raw = partner.website_url?.trim()
  if (!raw) return null
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? candidate : null
  } catch {
    return null
  }
}

export function NativePartnerCarousel({ partners }: NativePartnerCarouselProps) {
  const partnerOrder = partners.map((partner) => partner.id).join('\u0000')
  const trackRef = useRef<HTMLUListElement>(null)
  const [position, setPosition] = useState(() => ({ partnerOrder, index: 0 }))
  const [failedLogos, setFailedLogos] = useState<Set<string>>(() => new Set())
  const safeActiveIndex = position.partnerOrder === partnerOrder ? Math.min(position.index, Math.max(0, partners.length - 1)) : 0

  useEffect(() => {
    if (trackRef.current) trackRef.current.scrollLeft = 0
  }, [partnerOrder])

  if (!partners.length) return null

  const activePartner = partners[safeActiveIndex]!
  const updateActivePartner = (event: UIEvent<HTMLUListElement>) => {
    const track = event.currentTarget
    const slides = [...track.querySelectorAll<HTMLElement>('[data-partner-slide]')]
    const measuredStep = slides.length > 1 ? slides[1]!.offsetLeft - slides[0]!.offsetLeft : 0
    const step = measuredStep > 0 ? measuredStep : track.clientWidth
    if (step <= 0) return
    const nextIndex = Math.max(0, Math.min(partners.length - 1, Math.round(track.scrollLeft / step)))
    setPosition({ partnerOrder, index: nextIndex })
  }

  const cardFor = (partner: Sponsor): ReactNode => {
    const logoUrl = resolveAssetUrl(partner.logo_url?.trim())
    const logoKey = `${partner.id}\u0000${logoUrl ?? ''}`
    const card = <>
      <p className="native-partner-eyebrow">Community Partner</p>
      <div className="native-partner-logo">
        {logoUrl && !failedLogos.has(logoKey) ? <img src={logoUrl} alt="" width="120" height="64" loading="lazy" onError={() => setFailedLogos((current) => { const next = new Set(current); next.add(logoKey); return next })} /> : <span className="native-partner-logo-fallback" data-partner-logo-fallback aria-hidden="true">{initialsFor(partner.name)}</span>}
      </div>
      <h3 className="native-partner-name">{partner.name}</h3>
      {partner.description ? <p className="native-partner-description">{partner.description}</p> : null}
    </>
    const website = websiteFor(partner)
    return website ? <a className="native-partner-card" href={website} target="_blank" rel="noopener noreferrer">{card}</a> : <article className="native-partner-card">{card}</article>
  }

  return <div className="native-partner-carousel" role="region" aria-roledescription="carousel" aria-label="Community partners carousel">
    <ul ref={trackRef} className="native-partner-track" role="list" aria-label="Community partners" onScroll={updateActivePartner}>
      {partners.map((partner, index) => <li className="native-partner-slide" key={partner.id} data-partner-slide data-active={index === safeActiveIndex} aria-label={`Partner ${index + 1} of ${partners.length}`}>{cardFor(partner)}</li>)}
    </ul>
    <p className="sr-only" role="status" aria-live="polite">Partner {safeActiveIndex + 1} of {partners.length}: {activePartner.name}</p>
    {partners.length > 1 ? <div className="native-partner-pagination" aria-hidden="true">{partners.map((partner, index) => <span className="native-partner-dot" key={partner.id} data-active={index === safeActiveIndex} />)}</div> : null}
  </div>
}

export default NativePartnerCarousel
