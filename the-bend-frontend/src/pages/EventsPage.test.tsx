import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityEvent } from '@/types'
import EventsPage from './EventsPage'

const refresh = vi.fn(() => Promise.resolve())
const browserOpen = vi.hoisted(() => vi.fn(() => Promise.resolve()))
let cachedState: {
  data: CommunityEvent[] | null
  source: 'cache' | 'network' | null
  cachedAt: string | null
  status: 'loading' | 'success' | 'empty' | 'error'
  error: Error | null
  refresh: typeof refresh
}

vi.mock('@/hooks/useCachedPublicContent', () => ({ useCachedPublicContent: () => cachedState }))
vi.mock('@/hooks/useOnlineMutation', () => ({ useOnlineMutation: () => ({ online: true, ready: true, run: vi.fn() }) }))
vi.mock('@/components/layout/NativePresentationContext', () => ({ useNativePresentation: () => true }))
vi.mock('@/platform/createPlatformServices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/createPlatformServices')>()),
  usePlatformServices: () => ({ browser: { open: browserOpen } }),
}))
vi.mock('@/components/layout/PageLayout', () => ({ PageLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/shared/SponsorBanner', () => ({ SponsorBanner: () => null }))
vi.mock('@/components/native/CachedContentNotice', () => ({ CachedContentNotice: () => null }))
vi.mock('@/components/shared/ShareButton', () => ({ ShareButton: ({ url }: { url: string }) => <button type="button" data-share-url={url}>Share</button> }))

const todayAtNoon = new Date()
todayAtNoon.setHours(12, 0, 0, 0)
const event: CommunityEvent = {
  id: '00000000-0000-0000-0000-000000000030',
  title: 'Community Picnic',
  description: 'Lunch with neighbors',
  start_date: todayAtNoon.toISOString(),
  end_date: null,
  location: 'Town Park',
  category: 'community',
  image_url: null,
  source: 'manual',
  source_url: null,
  is_featured: false,
  status: 'active',
  created_at: todayAtNoon.toISOString(),
}
const sourcedEvent: CommunityEvent = { ...event, source: 'County calendar', source_url: 'https://events.example.test/community-picnic' }

function renderPage() {
  return render(<MemoryRouter initialEntries={['/events']}><EventsPage /></MemoryRouter>)
}

beforeEach(() => {
  refresh.mockClear()
  browserOpen.mockClear()
  cachedState = { data: [event], source: 'network', cachedAt: null, status: 'success', error: null, refresh }
})
afterEach(cleanup)

describe('EventsPage native recovery and destinations', () => {
  it('replaces a cold-cache fetch failure with a truthful retry state', () => {
    cachedState = { ...cachedState, data: null, source: null, status: 'error', error: new Error('network down') }
    const { container } = renderPage()

    expect(screen.getByRole('heading', { name: 'Unable to load events' })).toBeInTheDocument()
    expect(screen.queryByText('No events found')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry events' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps cached events visible during a refresh failure', () => {
    cachedState = { ...cachedState, source: 'cache', status: 'error', error: new Error('refresh failed') }
    renderPage()

    expect(screen.getByRole('heading', { name: event.title })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry events' })).not.toBeInTheDocument()
  })

  it('makes each native list card a named internal event link', () => {
    renderPage()

    expect(screen.getByRole('link', { name: `Open ${event.title}` })).toHaveAttribute('href', `/events/${event.id}`)
  })

  it('makes each selected-day calendar row a named internal event link', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }))

    expect(screen.getByRole('link', { name: `Open ${event.title}` })).toHaveAttribute('href', `/events/${event.id}`)
  })

  it('keeps the calendar source as an explicit external action', () => {
    cachedState = { ...cachedState, data: [sourcedEvent] }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }))

    const source = screen.getByRole('link', { name: 'View source' })
    expect(source).toHaveClass('native-control')
    fireEvent.click(source)
    expect(browserOpen).toHaveBeenCalledWith('https://events.example.test/community-picnic')
    expect(screen.getByRole('link', { name: `Open ${event.title}` })).toHaveAttribute('href', `/events/${event.id}`)
  })
})
