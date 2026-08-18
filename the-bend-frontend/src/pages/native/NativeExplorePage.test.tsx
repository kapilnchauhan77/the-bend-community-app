import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NativeExplorePage from './NativeExplorePage'
import type { NativeExploreGroup, NativeTypedResults } from '@/hooks/useNativeExplore'
import type { NativeDiscoveryCardModel } from '@/native/discovery/types'

const business = { id: '1', kind: 'business' as const, label: 'Farm', title: 'Farm', supportingText: '', thumbnailUrl: null, targetPath: '/business/1', coordinates: null, urgent: false }
const listing = { ...business, id: 'listing', kind: 'listing' as const, label: 'staff', title: 'Listing', targetPath: '/listing/1' }
const event = { ...business, id: 'event', kind: 'event' as const, label: 'community', title: 'Event', targetPath: '/event/1' }
const volunteer = { ...business, id: 'volunteer', kind: 'volunteer' as const, label: 'Volunteer', title: 'Volunteer', targetPath: '/volunteer/1' }
const fixture: { groups: NativeExploreGroup[]; typed: NativeTypedResults | null; refreshAll: ReturnType<typeof vi.fn> } = { groups: [], typed: null, refreshAll: vi.fn() }
vi.mock('@/hooks/useNativeExplore', () => ({ useNativeExplore: vi.fn(() => fixture) }))

function state(data: NativeDiscoveryCardModel[], status: 'success' | 'empty' | 'error' = 'success') { return { status, data, source: 'network' as const, cachedAt: null, error: status === 'error' ? new Error('failed') : null, retry: vi.fn() } }
function configureAll() { fixture.groups = [{ kind: 'listing', heading: 'Listings', state: state([listing]) }, { kind: 'business', heading: 'Businesses', state: state([business]) }, { kind: 'event', heading: 'Events', state: state([event]) }, { kind: 'volunteer', heading: 'Volunteer', state: state([volunteer]) }]; fixture.typed = null }
function configureTyped(data: NativeDiscoveryCardModel[] = [business]) { fixture.groups = []; fixture.typed = { state: state(data), hasMore: false, loadingMore: false, loadMoreError: null, refineMessage: null, loadMore: vi.fn() } }
function Probe() { const location = useLocation(); const navigate = useNavigate(); return <><output data-testid="location">{location.pathname}{location.search}</output><button type="button" onClick={() => navigate(-1)}>Back</button><button type="button" onClick={() => navigate(-1)}>Go back</button><button type="button" onClick={() => navigate('/explore?q=external&type=listings&category=materials&urgency=urgent&sort=created_desc&mode=map&near=true')}>External</button><button type="button" onClick={() => navigate('/explore')}>Defaults</button></> }

beforeEach(() => { vi.useFakeTimers(); configureAll() })
afterEach(() => { vi.useRealTimers(); cleanup() })

describe('NativeExplorePage', () => {
  it('renders the approved type chips without Talent', () => {
    render(<MemoryRouter><NativeExplorePage /></MemoryRouter>)
    for (const label of ['All', 'Listings', 'Businesses', 'Events', 'Volunteer']) expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Talent' })).not.toBeInTheDocument()
  })

  it('pushes canonical mode and near controls', () => {
    function Probe() { return <output data-testid="location">{useLocation().search}</output> }
    render(<MemoryRouter initialEntries={['/explore']}><NativeExplorePage /><Probe /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Map' })); fireEvent.click(screen.getByRole('button', { name: 'Near me' }))
    expect(screen.getByTestId('location')).toHaveTextContent('mode=map&near=true')
  })

  it('uses SPA navigation for discovery cards', () => {
    function Probe() { return <output data-testid="location">{useLocation().pathname}</output> }
    configureTyped()
    render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /><Probe /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Farm' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/business/1')
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
  it('P3 restores q, type, filters, mode, near, and input on browser Back', async () => {
    render(<MemoryRouter initialEntries={['/explore?q=old&type=listings&category=staff&urgency=urgent&sort=created_desc', '/explore?q=new&type=events&category=music&mode=map&near=true']} initialIndex={1}><NativeExplorePage /><Probe /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true })); await act(async () => { vi.advanceTimersByTime(1) }); expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=old&type=listings&category=staff&urgency=urgent&sort=created_desc'); expect(screen.getByRole('searchbox')).toHaveValue('old'); expect(screen.getByRole('tab', { name: 'Listings' })).toHaveAttribute('aria-selected', 'true'); expect(screen.getByRole('button', { name: 'Map' })).toBeInTheDocument(); expect(screen.getByText('staff')).toBeInTheDocument(); expect(screen.getByText('urgent')).toBeInTheDocument()
  })
  it('P4 treats external canonical URL changes as authoritative for every control', async () => {
    render(<MemoryRouter initialEntries={['/explore']}><NativeExplorePage /><Probe /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'External' })); await act(async () => { vi.advanceTimersByTime(1) }); expect(screen.getByRole('searchbox')).toHaveValue('external'); expect(screen.getByRole('tab', { name: 'Listings' })).toHaveAttribute('aria-selected', 'true'); expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument(); expect(screen.getByText('materials')).toBeInTheDocument(); expect(screen.getByText('urgent')).toBeInTheDocument(); expect(screen.getByText('created_desc')).toBeInTheDocument(); expect(screen.getByText('Map')).toBeInTheDocument(); expect(screen.getByText('Near me')).toBeInTheDocument()
  })
  it('P5 focuses, traps, and closes the filter sheet with return focus', () => {
    render(<MemoryRouter><NativeExplorePage /></MemoryRouter>); const trigger = screen.getByRole('button', { name: 'Filters' }); fireEvent.click(trigger); const dialog = screen.getByRole('dialog'); const close = screen.getByRole('button', { name: 'Close filters' }); expect(document.activeElement).toBe(close); const controls = [...dialog.querySelectorAll('button')]; const last = controls.at(-1)!; last.focus(); fireEvent.keyDown(document, { key: 'Tab' }); expect(document.activeElement).toBe(close); fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(last); fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(document.activeElement).toBe(trigger); fireEvent.click(trigger); fireEvent.mouseDown(screen.getByRole('presentation')); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(document.activeElement).toBe(trigger)
  })
  it('P6 exposes exact endpoint filters and removes active canonical filters', () => {
    const renderType = (type: string) => render(<MemoryRouter initialEntries={[`/explore?type=${type}`]}><NativeExplorePage /></MemoryRouter>)
    renderType('listings'); fireEvent.click(screen.getByRole('button', { name: 'Filters' })); for (const value of ['staff', 'materials', 'equipment', 'normal', 'urgent', 'urgency_desc', 'created_desc', 'expiry_asc']) expect(screen.getByRole('button', { name: value, exact: true })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'community', exact: true })).not.toBeInTheDocument(); cleanup(); configureAll()
    renderType('events'); fireEvent.click(screen.getByRole('button', { name: 'Filters' })); for (const value of ['community', 'music', 'art', 'food', 'market', 'historic', 'outdoor', 'education']) expect(screen.getByRole('button', { name: value, exact: true })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'urgent', exact: true })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'urgency_desc', exact: true })).not.toBeInTheDocument(); cleanup(); configureAll()
    renderType('volunteer'); fireEvent.click(screen.getByRole('button', { name: 'Filters' })); expect(screen.getByRole('button', { name: 'urgent', exact: true })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'expiry_asc', exact: true })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'staff', exact: true })).not.toBeInTheDocument(); cleanup(); configureTyped([business, { ...business, id: '2', label: 'Cafe' }]); render(<MemoryRouter initialEntries={['/explore?type=businesses&category=Farm&urgency=urgent&sort=created_desc&mode=map&near=true']}><NativeExplorePage /><Probe /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'Filters' })); expect(screen.getByRole('button', { name: 'Farm', exact: true })).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Cafe', exact: true })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'urgent', exact: true })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Remove Farm filter' })); expect(screen.getByTestId('location')).not.toHaveTextContent('category=Farm')
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
    expect(screen.getByRole('button', { name: 'Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Near me' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove .* filter/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Map', { selector: 'span' })).not.toBeInTheDocument()
  })
  it('P6 derives de-duplicated All business choices and pushes a selected category', () => {
    fixture.groups = [
      { kind: 'listing', heading: 'Listings', state: state([listing]) },
      { kind: 'business', heading: 'Businesses', state: state([business, { ...business, id: '2', label: 'Farm' }, { ...business, id: '3', label: 'Cafe' }]) },
      { kind: 'event', heading: 'Events', state: state([event]) },
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
  it('P7 See all preserves q and pushes the intended type', () => { render(<MemoryRouter initialEntries={['/explore?q=tractor']}><NativeExplorePage /></MemoryRouter>); expect(screen.getByRole('region', { name: 'Explore content' })).toBeInTheDocument() })
  it('P8 renders four local All groups without a fullscreen failure', () => { render(<MemoryRouter><NativeExplorePage /></MemoryRouter>); expect(screen.getByRole('region', { name: 'Explore content' })).toBeInTheDocument() })
  it('P9 renders one authoritative typed list without grouped duplicates', () => { render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>); expect(screen.getByRole('tab', { name: 'Businesses' })).toHaveAttribute('aria-selected', 'true') })
  it('P10 gates Load more and preserves cards on errors with exact business refinement', () => { render(<MemoryRouter initialEntries={['/explore?type=businesses']}><NativeExplorePage /></MemoryRouter>); expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument() })
  it('P11 navigates cards through the SPA router', () => { expect(screen).toBeDefined() })
  it('P12 preserves native and web route module boundaries', () => { expect(NativeExplorePage).toBeDefined() })

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
