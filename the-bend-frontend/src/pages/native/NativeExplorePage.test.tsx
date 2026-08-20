import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NativeExplorePage from './NativeExplorePage'
import type { NativeExploreGroup, NativeTypedResults } from '@/hooks/useNativeExplore'
import type { NativeDiscoveryCardModel } from '@/native/discovery/types'

const business = { id: '1', kind: 'business' as const, label: 'Farm', title: 'Farm', supportingText: '', thumbnailUrl: null, targetPath: '/business/1', coordinates: null, urgent: false }
const listing = { ...business, id: 'listing', kind: 'listing' as const, label: 'staff', title: 'Listing', targetPath: '/listing/1' }
const event = { ...business, id: 'event', kind: 'event' as const, label: 'community', title: 'Event', targetPath: '/event/1' }
const bender = { ...business, id: 'bender', kind: 'bender' as never, label: 'Bender', title: 'Community update', supportingText: 'Pat Owner', targetPath: '/bender?post=bender' }
const volunteer = { ...business, id: 'volunteer', kind: 'volunteer' as const, label: 'Volunteer', title: 'Volunteer', targetPath: '/volunteer/1' }
const fixture: { groups: NativeExploreGroup[]; typed: NativeTypedResults | null; refreshAll: ReturnType<typeof vi.fn>; mapBusinesses?: unknown[]; userCoordinates?: unknown; online?: boolean; location?: { status: string }; requestLocation?: ReturnType<typeof vi.fn> } = { groups: [], typed: null, refreshAll: vi.fn(), mapBusinesses: [], userCoordinates: null, online: true, location: { status: 'idle' }, requestLocation: vi.fn() }
vi.mock('@/hooks/useNativeExplore', () => ({ useNativeExplore: vi.fn(() => fixture) }))

function state(data: NativeDiscoveryCardModel[], status: 'success' | 'empty' | 'error' = 'success', cachedAt: string | null = null) { return { status, data, source: cachedAt ? 'cache' as const : 'network' as const, cachedAt, error: status === 'error' ? new Error('failed') : null, retry: vi.fn() } }
function configureAll() { fixture.groups = [{ kind: 'listing', heading: 'Listings', state: state([listing]) }, { kind: 'business', heading: 'Businesses', state: state([business]) }, { kind: 'event', heading: 'Events', state: state([event]) }, { kind: 'bender' as never, heading: 'Bender', state: state([bender]) }, { kind: 'volunteer', heading: 'Volunteer', state: state([volunteer]) }]; fixture.typed = null; fixture.mapBusinesses = [] }
function configureTyped(data: NativeDiscoveryCardModel[] = [business]) { fixture.groups = []; fixture.typed = { state: state(data), hasMore: false, loadingMore: false, loadMoreError: null, refineMessage: null, loadMore: vi.fn() } }
function Probe() { const location = useLocation(); const navigate = useNavigate(); return <><output data-testid="location">{location.pathname}{location.search}</output><button type="button" onClick={() => navigate(-1)}>Back</button><button type="button" onClick={() => navigate(-1)}>Go back</button><button type="button" onClick={() => navigate('/explore?q=external&type=listings&category=materials&urgency=urgent&sort=created_desc&mode=map&near=true')}>External</button><button type="button" onClick={() => navigate('/explore')}>Defaults</button></> }
function UnmountHarness() { const [visible, setVisible] = useState(true); return <MemoryRouter initialEntries={['/explore?q=old']}><button type="button" onClick={() => setVisible(false)}>Unmount Explore</button>{visible && <NativeExplorePage />}<Probe /></MemoryRouter> }

beforeEach(() => { vi.useFakeTimers(); configureAll(); fixture.location = { status: 'idle' }; fixture.requestLocation = vi.fn().mockResolvedValue({ status: 'granted', latitude: 40, longitude: -79 }) })
afterEach(() => { vi.useRealTimers(); cleanup() })

describe('NativeExplorePage', () => {
  it('shows freshness context for cached All groups and omits it for current network data', () => {
    fixture.groups = [
      { kind: 'listing', heading: 'Listings', state: state([listing], 'success', '2026-01-01T00:00:00.000Z') },
      { kind: 'business', heading: 'Businesses', state: state([business], 'success', '2026-01-01T00:00:00.000Z') },
      { kind: 'event', heading: 'Events', state: state([event], 'success', '2026-01-01T00:00:00.000Z') },
      { kind: 'bender' as never, heading: 'Bender', state: state([bender]) },
      { kind: 'volunteer', heading: 'Volunteer', state: state([volunteer], 'success', '2026-01-01T00:00:00.000Z') },
    ]
    render(<MemoryRouter initialEntries={['/explore']}><NativeExplorePage /></MemoryRouter>)
    expect(screen.getAllByText(/Showing saved content from/)).toHaveLength(4)
    cleanup()
    configureAll()
    render(<MemoryRouter initialEntries={['/explore']}><NativeExplorePage /></MemoryRouter>)
    expect(screen.queryByText(/Showing saved content from/)).not.toBeInTheDocument()
  })
  it('renders the approved type chips without Talent', () => {
    render(<MemoryRouter><NativeExplorePage /></MemoryRouter>)
    for (const label of ['All', 'Listings', 'Businesses', 'Events', 'Bender', 'Volunteer']) expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Talent' })).not.toBeInTheDocument()
  })

  it('uses SPA navigation for discovery cards', () => {
    function Probe() { return <output data-testid="location">{useLocation().pathname}</output> }
    configureTyped()
    render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /><Probe /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Farm' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/business/1')
  })

  it('keeps the normal business list and does not mount Leaflet while map is offline', () => {
    configureTyped([business]); fixture.online = false; fixture.mapBusinesses = []
    render(<MemoryRouter initialEntries={['/explore?type=businesses&mode=map']}><NativeExplorePage /><Probe /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Businesses' })).toBeInTheDocument()
    expect(screen.getByText(/Map is unavailable offline/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Business map' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'List' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByTestId('location')).not.toHaveTextContent('mode=map')
  })

  it.each(['listings', 'events', 'bender', 'volunteer'] as const)('never exposes Map or Near controls for %s', (type) => {
    configureTyped([type === 'listings' ? listing : type === 'events' ? event : type === 'bender' ? bender : volunteer])
    render(<MemoryRouter initialEntries={[`/explore?type=${type}`]}><NativeExplorePage /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Near me/ })).not.toBeInTheDocument()
  })

  it('selects Bender as a first-class typed view while clearing unsupported controls', () => {
    configureTyped([bender])
    render(<MemoryRouter initialEntries={['/explore?type=listings&category=staff&urgency=urgent&sort=created_desc&mode=map&near=true']}><NativeExplorePage /><Probe /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'Bender' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/explore?type=bender')
    expect(screen.getByRole('tab', { name: 'Bender' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Bender' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Near me/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove .* filter/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument()
  })

  it('opens a typed Bender card on its focused post route', () => {
    configureTyped([bender])
    render(<MemoryRouter initialEntries={['/explore?type=bender']}><NativeExplorePage /><Probe /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Open Bender post by Pat Owner: Community update' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/bender?post=bender')
  })

  it('exposes Map for All and Businesses only when the supplied eligible business set exists', () => {
    configureAll(); fixture.online = true; fixture.mapBusinesses = [{ ...business, coordinates: { latitude: 40, longitude: -79 }, distanceMiles: null }]
    render(<MemoryRouter initialEntries={['/explore']}><NativeExplorePage /><Probe /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Map' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Map' }))
    expect(screen.getByTestId('location')).toHaveTextContent('mode=map')
    cleanup()
    configureTyped([{ ...business, coordinates: { latitude: 40, longitude: -79 } }]); fixture.online = true; fixture.mapBusinesses = [{ ...business, coordinates: { latitude: 40, longitude: -79 }, distanceMiles: null }]
    render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /><Probe /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Map' })).toBeEnabled()
  })

  it.each(['denied', 'unavailable'] as const)('shows Retry and Continue across Westmoreland after %s', async (status) => {
    configureTyped([business]); fixture.location = { status }; fixture.requestLocation = vi.fn().mockResolvedValue({ status })
    render(<MemoryRouter initialEntries={['/explore?type=businesses&near=true']}><NativeExplorePage /><Probe /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue across Westmoreland' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await act(async () => { await Promise.resolve() })
    expect(fixture.requestLocation).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Continue across Westmoreland' }))
    expect(screen.getByTestId('location')).not.toHaveTextContent('near=true')
  })

  it('P1 keeps typed text visible, replaces q after 300ms, and does not add history', async () => {
    render(<MemoryRouter initialEntries={['/before', '/explore?q=old']} initialIndex={1}><NativeExplorePage /><Probe /></MemoryRouter>)
    const input = screen.getByRole('searchbox'); fireEvent.change(input, { target: { value: 'tractor' } }); expect(input).toHaveValue('tractor'); expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=old')
    await act(async () => { vi.advanceTimersByTime(299) }); expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=old')
    await act(async () => { vi.advanceTimersByTime(1) }); expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=tractor')
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true })); expect(screen.getByTestId('location')).toHaveTextContent('/before')
  })
  it('P2 submits a trimmed q immediately, pushes, and cancels the pending debounce', async () => {
    render(<MemoryRouter initialEntries={['/explore?q=old']}><NativeExplorePage /><Probe /></MemoryRouter>); const input = screen.getByRole('searchbox'); fireEvent.change(input, { target: { value: '  generator  ' } }); fireEvent.submit(screen.getByRole('search')); expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=generator'); await act(async () => { vi.advanceTimersByTime(500) }); expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=generator'); fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true })); expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=old')
  })
  it('cancels a pending search debounce when Explore unmounts without mutating the URL or warning', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<UnmountHarness />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unmount Explore' }))
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=old')
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
  it('P3 restores q, type, filters, mode, near, and input on browser Back', async () => {
    render(<MemoryRouter initialEntries={['/explore?q=old&type=listings&category=staff&urgency=urgent&sort=created_desc', '/explore?q=new&type=events&category=music&mode=map&near=true']} initialIndex={1}><NativeExplorePage /><Probe /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true })); await act(async () => { vi.advanceTimersByTime(1) }); expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=old&type=listings&category=staff&urgency=urgent&sort=created_desc'); expect(screen.getByRole('searchbox')).toHaveValue('old'); expect(screen.getByRole('tab', { name: 'Listings' })).toHaveAttribute('aria-selected', 'true'); expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: /Near me/ })).not.toBeInTheDocument(); expect(screen.getByText('staff')).toBeInTheDocument(); expect(screen.getByText('urgent')).toBeInTheDocument()
  })
  it('P3 cancels a pending debounce when Back restores an external Explore URL', async () => {
    render(<MemoryRouter initialEntries={['/explore?q=restored&type=events&category=music', '/explore?q=old']} initialIndex={1}><NativeExplorePage /><Probe /></MemoryRouter>)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=restored&type=events&category=music')
    expect(input).toHaveValue('restored')
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Remove music filter' })).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=restored&type=events&category=music')
    expect(screen.getByRole('searchbox')).toHaveValue('restored')
  })
  it('P3 cancels a pending debounce when non-q URL state changes restore the canonical Explore state', async () => {
    render(<MemoryRouter initialEntries={['/explore?q=same&type=events&category=music&mode=map&near=true', '/explore?q=same&type=listings&category=staff&urgency=urgent&sort=created_desc']} initialIndex={1}><NativeExplorePage /><Probe /></MemoryRouter>)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=same&type=events&category=music&mode=map&near=true')
    expect(screen.getByRole('searchbox')).toHaveValue('same')
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('button', { name: 'List' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Near me/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove music filter' })).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=same&type=events&category=music&mode=map&near=true')
    expect(screen.getByRole('searchbox')).toHaveValue('same')
    expect(screen.getByRole('tab', { name: 'Listings' })).toHaveAttribute('aria-selected', 'false')
  })
  it('P4 treats external canonical URL changes as authoritative for every control', async () => {
    render(<MemoryRouter initialEntries={['/explore']}><NativeExplorePage /><Probe /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'External' })); await act(async () => { vi.advanceTimersByTime(1) }); expect(screen.getByRole('searchbox')).toHaveValue('external'); expect(screen.getByRole('tab', { name: 'Listings' })).toHaveAttribute('aria-selected', 'true'); expect(screen.queryByRole('button', { name: 'List' })).not.toBeInTheDocument(); expect(screen.getByText('materials')).toBeInTheDocument(); expect(screen.getByText('urgent')).toBeInTheDocument(); expect(screen.getByText('created_desc')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: /Near me/ })).not.toBeInTheDocument()
  })
  it('P5 focuses, traps, and closes the filter sheet with return focus', () => {
    render(<MemoryRouter><NativeExplorePage /></MemoryRouter>); const trigger = screen.getByRole('button', { name: 'Filters' }); fireEvent.click(trigger); const dialog = screen.getByRole('dialog'); const close = screen.getByRole('button', { name: 'Close filters' }); expect(document.activeElement).toBe(close); const controls = [...dialog.querySelectorAll('button')]; const last = controls.at(-1)!; last.focus(); fireEvent.keyDown(document, { key: 'Tab' }); expect(document.activeElement).toBe(close); fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(last); fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(document.activeElement).toBe(trigger); fireEvent.click(trigger); fireEvent.mouseDown(screen.getByRole('presentation')); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(document.activeElement).toBe(trigger)
  })
  it('P6 exposes exact endpoint filters and removes active canonical filters', () => {
    const renderType = (type: string) => render(<MemoryRouter initialEntries={[`/explore?type=${type}`]}><NativeExplorePage /></MemoryRouter>)
    renderType('listings'); fireEvent.click(screen.getByRole('button', { name: 'Filters' })); for (const value of ['staff', 'materials', 'equipment', 'normal', 'urgent', 'urgency_desc', 'created_desc', 'expiry_asc']) expect(screen.getByRole('button', { name: value, exact: true })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'community', exact: true })).not.toBeInTheDocument(); cleanup(); configureAll()
    renderType('events'); fireEvent.click(screen.getByRole('button', { name: 'Filters' })); for (const value of ['community', 'music', 'art', 'food', 'market', 'historic', 'outdoor', 'education']) expect(screen.getByRole('button', { name: value, exact: true })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'urgent', exact: true })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'urgency_desc', exact: true })).not.toBeInTheDocument(); cleanup(); configureAll()
    renderType('volunteer'); fireEvent.click(screen.getByRole('button', { name: 'Filters' })); expect(screen.getByRole('button', { name: 'urgent', exact: true })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'expiry_asc', exact: true })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'staff', exact: true })).not.toBeInTheDocument(); cleanup(); configureTyped([business, { ...business, id: '2', label: 'Cafe' }]); render(<MemoryRouter initialEntries={['/explore?type=businesses&category=Farm&urgency=urgent&sort=created_desc&mode=map&near=true']}><NativeExplorePage /><Probe /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'Filters' })); expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Farm', exact: true })).toBeInTheDocument(); expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cafe', exact: true })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'urgent', exact: true })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Remove Farm filter' })); expect(screen.getByTestId('location')).not.toHaveTextContent('category=Farm')
  })
  it('P4 clears every control when an external navigation returns to Explore defaults', async () => {
    render(<MemoryRouter initialEntries={['/explore']}><NativeExplorePage /><Probe /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'External' }))
    await act(async () => { vi.advanceTimersByTime(1) })
    fireEvent.click(screen.getByRole('button', { name: 'Defaults' }))
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(screen.getByTestId('location')).toHaveTextContent('/explore')
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Map' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Near me/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove .* filter/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Map', { selector: 'span' })).not.toBeInTheDocument()
  })
  it('P6 derives de-duplicated All business choices and pushes a selected category', () => {
    fixture.groups = [
      { kind: 'listing', heading: 'Listings', state: state([listing]) },
      { kind: 'business', heading: 'Businesses', state: state([business, { ...business, id: '2', label: 'Farm' }, { ...business, id: '3', label: 'Cafe' }]) },
      { kind: 'event', heading: 'Events', state: state([event]) },
      { kind: 'bender' as never, heading: 'Bender', state: state([bender]) },
      { kind: 'volunteer', heading: 'Volunteer', state: state([volunteer]) },
    ]
    fixture.typed = null
    render(<MemoryRouter initialEntries={['/explore']}><NativeExplorePage /><Probe /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByRole('button', { name: 'Farm', exact: true })).toHaveLength(1)
    expect(within(dialog).getAllByRole('button', { name: 'Cafe', exact: true })).toHaveLength(1)
    expect(within(dialog).getByRole('button', { name: 'staff', exact: true })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'community', exact: true })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cafe', exact: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/explore?category=Cafe')
    expect(screen.getByRole('button', { name: 'Remove Cafe filter' })).toBeInTheDocument()
  })
  it.each([
    ['listing', 'listings', 'Listings'],
    ['business', 'businesses', 'Businesses'],
    ['event', 'events', 'Events'],
    ['bender', 'bender', 'Bender'],
    ['volunteer', 'volunteer', 'Volunteer'],
  ])('P7 See all from the %s group preserves q and pushes %s', (_kind, type, heading) => {
    configureAll()
    render(<MemoryRouter initialEntries={['/explore?q=tractor']}><NativeExplorePage /><Probe /></MemoryRouter>)
    const group = screen.getByRole('heading', { name: heading }).closest('section')!
    fireEvent.click(within(group).getByRole('button', { name: 'See all' }))
    expect(screen.getByTestId('location')).toHaveTextContent(`/explore?q=tractor&type=${type}`)
    expect(screen.getByRole('tab', { name: heading })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
    expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=tractor')
  })
  it('P8 keeps grouped partial failures local with retryable section state', () => {
    const retry = vi.fn()
    fixture.groups = [{ kind: 'listing', heading: 'Listings', state: state([listing]) }, { kind: 'business', heading: 'Businesses', state: state([], 'empty') }, { kind: 'event', heading: 'Events', state: { ...state([], 'error'), retry } }, { kind: 'bender' as never, heading: 'Bender', state: state([bender]) }, { kind: 'volunteer', heading: 'Volunteer', state: state([volunteer]) }]
    fixture.typed = null
    render(<MemoryRouter initialEntries={['/explore']}><NativeExplorePage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Listings' })).toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'Businesses' })).toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'Bender' })).toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'Volunteer' })).toBeInTheDocument()
    const failed = screen.getByRole('heading', { name: 'Events' }).closest('section')!
    const volunteerSection = screen.getByRole('heading', { name: 'Volunteer' }).closest('section')!
    const listingsSection = screen.getByRole('heading', { name: 'Listings' }).closest('section')!
    expect(within(failed).getByRole('alert')).toHaveTextContent('Something went wrong'); expect(within(failed).getByRole('button', { name: 'Retry' })).toBeInTheDocument(); expect(within(listingsSection).getByRole('button', { name: /staff/ })).toBeInTheDocument(); expect(within(volunteerSection).getByRole('button', { name: 'Volunteer' })).toBeInTheDocument(); expect(screen.getByText('No results found.')).toBeInTheDocument(); fireEvent.click(within(failed).getByRole('button', { name: 'Retry' })); expect(retry).toHaveBeenCalledTimes(1)
  })
  it('P9 renders one authoritative typed list without grouped duplicates', () => {
    configureTyped([{ ...business, id: 'typed-1', title: 'Typed one' }, { ...business, id: 'typed-2', title: 'Typed two' }])
    fixture.groups = [{ kind: 'listing', heading: 'Listings', state: state([listing]) }, { kind: 'business', heading: 'Businesses', state: state([business]) }, { kind: 'event', heading: 'Events', state: state([event]) }, { kind: 'bender' as never, heading: 'Bender', state: state([bender]) }, { kind: 'volunteer', heading: 'Volunteer', state: state([volunteer]) }]
    render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Businesses' })).toBeInTheDocument(); expect(screen.getAllByText('Typed one')).toHaveLength(1); expect(screen.getAllByText('Typed two')).toHaveLength(1); expect(screen.queryByRole('heading', { name: 'Listings' })).not.toBeInTheDocument(); expect(screen.queryByRole('heading', { name: 'Events' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument(); expect(screen.queryByText('Listing')).not.toBeInTheDocument()
  })
  it('P10 gates load more, preserves cards on errors, and renders business refinement', () => {
    configureTyped([business]); fixture.typed!.hasMore = true; fixture.typed!.loadMore = vi.fn(); render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>); const load = screen.getByRole('button', { name: 'Load more' }); fireEvent.click(load); expect(fixture.typed!.loadMore).toHaveBeenCalledTimes(1)
    cleanup(); configureTyped([business]); fixture.typed!.hasMore = true; fixture.typed!.loadMoreError = new Error('page failed'); fixture.typed!.loadMore = vi.fn(); render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>); expect(screen.getByRole('button', { name: 'Farm' })).toBeInTheDocument(); expect(screen.getByRole('alert')).toHaveTextContent('Unable to load more results.'); expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled()
    cleanup(); configureTyped([business]); fixture.typed!.refineMessage = 'Refine your search to narrow businesses'; render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>); expect(screen.getByText('Refine your search to narrow businesses')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })
  it('P10 disables Load more while a real typed page is loading', () => {
    configureTyped([business])
    fixture.typed!.hasMore = true
    fixture.typed!.loadingMore = true
    fixture.typed!.loadMore = vi.fn()
    render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>)
    const load = screen.getByRole('button', { name: 'Load more' })
    expect(load).toBeDisabled()
    fireEvent.click(load)
    expect(fixture.typed!.loadMore).not.toHaveBeenCalled()
  })

  it('keeps typed input visible and offers derived business types', () => {
    configureTyped([business, { ...business, id: '2', label: 'Cafe' }])
    render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>)
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'tractor' } })
    expect(input).toHaveValue('tractor')
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getAllByRole('button', { name: 'Farm' })).toHaveLength(2)
  })
})
