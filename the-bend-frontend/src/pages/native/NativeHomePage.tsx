import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { setPendingIntent } from '@/auth/pendingDestination'
import { useNativeAppShell } from '@/components/layout/NativeAppShell'
import { NativePageHeader } from '@/components/native/ui/NativePageHeader'
import { NativeSearchBar } from '@/components/native/ui/NativeSearchBar'
import { NativeQuickAction } from '@/components/native/ui/NativeQuickAction'
import { NativeResultGroup } from '@/components/native/ui/NativeResultGroup'
import { NativeUrgentCard } from '@/components/native/ui/NativeUrgentCard'
import { NativeDiscoveryCard } from '@/components/native/ui/NativeDiscoveryCard'
import { NativeBenderCard } from '@/components/native/ui/NativeBenderCard'
import { NativePartnerCarousel } from '@/components/native/ui/NativePartnerCarousel'
import { CachedContentNotice } from '@/components/native/CachedContentNotice'
import { useNativeHome } from '@/hooks/useNativeHome'
import { usePlatformServices } from '@/platform/createPlatformServices'
import { publicWestmorelandUrl } from '@/lib/publicUrl'
import type { NativeDiscoveryCardModel } from '@/native/discovery/types'
import { CalendarDays, HeartHandshake, Search, SquarePlus } from 'lucide-react'

export interface NativeHomePageProps { now?: Date }

export function NativeHomePage({ now }: NativeHomePageProps) {
  const navigate = useNavigate(); const auth = useAuthStore(); const { registerRootScroll } = useNativeAppShell(); const { browser } = usePlatformServices(); const rootRef = useRef<HTMLDivElement>(null); const [search, setSearch] = useState(''); const [partnerOpenError, setPartnerOpenError] = useState(false); const home = useNativeHome(now)
  const open = (path: string) => navigate(path)
  const submitSearch = () => { const q = search.trim(); if (q) navigate(`/explore?q=${encodeURIComponent(q)}`) }
  const action = (path: string, protectedAction = false) => { if (protectedAction && !auth.isAuthenticated) { setPendingIntent({ destination: path, action: 'offer-listing' }); navigate('/login'); return } navigate(path) }
  const openPartnerJourney = () => { setPartnerOpenError(false); void browser.open(publicWestmorelandUrl('/advertise')).catch(() => setPartnerOpenError(true)) }
  const cards = (data: NativeDiscoveryCardModel[]) => <div className="native-card-list">{data.map((item) => <NativeDiscoveryCard key={`${item.kind}:${item.id}`} item={item} onOpen={open} />)}</div>
  return <div ref={(node) => { rootRef.current = node; registerRootScroll('home', node) }} role="region" aria-label="Home content" className="native-home-scroll">
    <NativePageHeader title="What’s happening nearby" isAuthenticated={auth.isAuthenticated} onNotifications={auth.isAuthenticated ? () => navigate('/notifications') : undefined} onMessages={auth.isAuthenticated ? () => navigate('/messages') : undefined} />
    <p className="native-home-lede">Needs, opportunities, events, and neighbors—all in one place.</p>
    <NativeSearchBar value={search} label="Search Westmoreland" placeholder="Search Westmoreland" onChange={setSearch} onSubmit={submitSearch} onClear={() => setSearch('')} />
    <nav aria-label="Quick actions" className="native-quick-actions"><NativeQuickAction label="Offer" icon={<SquarePlus size={20} aria-hidden="true" />} onClick={() => action('/create?type=offer', true)} /><NativeQuickAction label="Find" icon={<Search size={20} aria-hidden="true" />} onClick={() => action('/explore?type=listings')} /><NativeQuickAction label="Volunteer" icon={<HeartHandshake size={20} aria-hidden="true" />} onClick={() => action('/explore?type=volunteer')} /><NativeQuickAction label="Events" icon={<CalendarDays size={20} aria-hidden="true" />} onClick={() => action('/explore?type=events')} /></nav>
    <NativeResultGroup heading="Urgent needs" status={home.urgent.status} count={home.urgent.data.length} onRetry={home.urgent.retry} onSeeAll={() => open('/explore?type=listings&urgency=urgent')}><CachedContentNotice cachedAt={home.urgent.cachedAt} />{home.urgent.data.length ? home.urgent.data.map((item) => <NativeUrgentCard key={item.id} item={item} onOpen={open} />) : null}</NativeResultGroup>
    <NativeResultGroup heading="Happening soon" status={home.upcoming.status} count={home.upcoming.data.length} onRetry={home.upcoming.retry} onSeeAll={() => open('/explore?type=events')}><CachedContentNotice cachedAt={home.upcoming.cachedAt} />{cards(home.upcoming.data)}</NativeResultGroup>
    <NativeResultGroup heading="Opportunities" status={home.opportunities.status} count={home.opportunities.data.length} onRetry={home.opportunities.retry} onSeeAll={() => open('/explore?type=volunteer')}><CachedContentNotice cachedAt={home.opportunities.cachedAt} />{cards(home.opportunities.data)}</NativeResultGroup>
    <NativeResultGroup heading="From Bender" status={home.bender.status} count={home.bender.data.length} onRetry={home.bender.retry} onSeeAll={() => open('/bender')}><div className="native-bender-list">{home.bender.data.map((post) => <NativeBenderCard key={post.id} post={post} onOpen={open} />)}</div></NativeResultGroup>
    <NativeResultGroup heading="Community highlights" status={home.highlights.status} count={home.highlights.data.length} onRetry={home.highlights.retry}>{home.highlights.data.map((story) => <article key={story.id} className="native-card"><strong>{story.listing_title}</strong><p>{story.quote}</p></article>)}</NativeResultGroup>
    <NativeResultGroup heading="Partners" status={home.partners.status} count={home.partners.data.length} onRetry={home.partners.retry} footer={<><button type="button" className="native-control native-partner-button" onClick={openPartnerJourney}>Partner with us</button>{partnerOpenError && <p className="native-partner-error" role="status">Could not open the partner journey. Try again.</p>}</>}><NativePartnerCarousel partners={home.partners.data} /></NativeResultGroup>
  </div>
}

export default NativeHomePage
