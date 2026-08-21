import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityEvent } from '@/types';
import { EventDetailPage } from './EventDetailPage';
import { eventApi } from '@/services/eventApi';
import { EventCard } from './EventsPage';

vi.mock('@/services/eventApi', () => ({ eventApi: { getDetail: vi.fn() } }));
vi.mock('@/components/layout/PageLayout', () => ({ PageLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/shared/ShareButton', () => ({ ShareButton: ({ url }: { url: string }) => <span data-testid="share-url">{url}</span> }));
const browserOpen = vi.hoisted(() => vi.fn());
vi.mock('@/platform/createPlatformServices', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/platform/createPlatformServices')>()), usePlatformServices: () => ({ browser: { open: browserOpen } }) }));
let nativePresentation = true;
vi.mock('@/components/layout/NativePresentationContext', () => ({ useNativePresentation: () => nativePresentation }));

const eventId = '00000000-0000-0000-0000-000000000003';
const secondEventId = '00000000-0000-0000-0000-000000000004';
const mixedCaseEventId = 'a0000000-b000-c000-d000-e00000000005';
const event: CommunityEvent = { id: eventId, title: 'Harvest Festival', description: 'A day in the park', start_date: '2026-09-12T14:00:00Z', end_date: '2026-09-12T16:00:00Z', location: 'Market Square', category: 'community', image_url: 'https://cdn.example.test/event.jpg', source: 'Calendar', source_url: 'https://events.example.test/harvest', is_featured: false, status: 'published', created_at: '2026-01-01T00:00:00Z' };
const cardEvent = (source_url?: string): CommunityEvent => ({ ...event, source_url });
const originalLocation = window.location;
const nativeCss = readFileSync('src/styles/native.css', 'utf8');
const nativeRouteLinkRule = nativeCss.match(/\.native-app a\.native-route-link\s*\{([^}]*)\}/)?.[1] ?? '';

function renderAt(id = eventId) { return render(<MemoryRouter initialEntries={[`/events/${id}`]}><Routes><Route path="/events/:eventId" element={<EventDetailPage />} /></Routes></MemoryRouter>); }
function SwitchToSecondEvent() { const navigate = useNavigate(); return <button type="button" onClick={() => navigate(`/events/${secondEventId}`)}>switch</button>; }
function PathProbe() { return <output data-testid="path">{useLocation().pathname}</output>; }

beforeEach(() => { vi.clearAllMocks(); nativePresentation = true; });
afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('EventDetailPage', () => {
  it('renders the event fields and canonical native share URL', async () => {
    vi.mocked(eventApi.getDetail).mockResolvedValue({ data: event } as never);
    renderAt();
    expect(screen.getByText('Loading event')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: event.title })).toBeInTheDocument();
    expect(screen.getByText('community')).toBeInTheDocument();
    expect(screen.getByText('Market Square')).toBeInTheDocument();
    expect(screen.getByText('A day in the park')).toBeInTheDocument();
    expect(screen.getByTestId('share-url')).toHaveTextContent(`https://westmoreland.bend.community/events/${eventId}`);
    expect(screen.getByRole('link', { name: 'All events' })).toHaveClass('native-control', 'native-route-link');
    expect(screen.getByRole('link', { name: 'View source' })).toHaveAttribute('href', event.source_url);
    expect(screen.getByRole('link', { name: 'View source' })).toHaveClass('native-control', 'native-route-link');
  });

  it('shares a web event on the tenant origin that rendered it', async () => {
    nativePresentation = false;
    Object.defineProperty(window, 'location', { configurable: true, value: { origin: 'https://northumberland.bend.community' } });
    vi.mocked(eventApi.getDetail).mockResolvedValue({ data: event } as never);

    renderAt();

    expect(await screen.findByRole('heading', { name: event.title })).toBeInTheDocument();
    expect(screen.getByTestId('share-url')).toHaveTextContent(`https://northumberland.bend.community/events/${eventId}`);
    expect(screen.getByRole('link', { name: 'All events' })).not.toHaveClass('native-control', 'native-route-link');
    expect(screen.getByRole('link', { name: 'View source' })).not.toHaveClass('native-control', 'native-route-link');
  });

  it('gives the unavailable back link the native target contract', async () => {
    vi.mocked(eventApi.getDetail).mockRejectedValueOnce({ response: { status: 404 } });

    renderAt();

    expect(await screen.findByRole('link', { name: 'Back to events' })).toHaveClass('native-control', 'native-route-link');
  });

  it('leaves the unavailable back link unchanged on the web', async () => {
    nativePresentation = false;
    vi.mocked(eventApi.getDetail).mockRejectedValueOnce({ response: { status: 404 } });

    renderAt();

    expect(await screen.findByRole('link', { name: 'Back to events' })).not.toHaveClass('native-control', 'native-route-link');
  });

  it('makes native route links measurable 44 pixel targets', () => {
    expect(nativeRouteLinkRule).toMatch(/display:\s*inline-flex/);
    expect(nativeRouteLinkRule).toMatch(/align-items:\s*center/);
    expect(nativeRouteLinkRule).toMatch(/min-height:\s*44px/);
  });

  it('accepts a lowercase response for the same uppercase route UUID', async () => {
    const caseInsensitiveEvent = { ...event, id: mixedCaseEventId, title: 'Case-insensitive event' };
    vi.mocked(eventApi.getDetail).mockResolvedValue({ data: caseInsensitiveEvent } as never);

    renderAt(mixedCaseEventId.toUpperCase());

    expect(await screen.findByRole('heading', { name: caseInsensitiveEvent.title })).toBeInTheDocument();
  });

  it('maps unavailable statuses without retry', async () => {
    for (const status of [400, 401, 403, 404, 422]) {
      vi.mocked(eventApi.getDetail).mockRejectedValueOnce({ response: { status } });
      renderAt(`00000000-0000-0000-0000-000000000${status}`);
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Event unavailable'));
      expect(screen.queryByRole('button', { name: 'Retry event' })).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('offers retry for transient failures and recovers', async () => {
    vi.mocked(eventApi.getDetail).mockRejectedValueOnce({ response: { status: 503 } }).mockResolvedValueOnce({ data: event } as never);
    renderAt();
    expect(await screen.findByRole('button', { name: 'Retry event' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry event' }));
    expect(await screen.findByRole('heading', { name: event.title })).toBeInTheDocument();
  });

  it.each([408, 429, 500, 503])('shows retry for transient status %i', async (status) => {
    vi.mocked(eventApi.getDetail).mockRejectedValueOnce({ response: { status } });
    renderAt(`00000000-0000-0000-0000-000000000${status}`);
    expect(await screen.findByRole('button', { name: 'Retry event' })).toBeInTheDocument();
  });

  it('shows retry for a network failure', async () => {
    vi.mocked(eventApi.getDetail).mockRejectedValueOnce(new Error('network down'));
    renderAt('00000000-0000-0000-0000-000000000900');
    expect(await screen.findByRole('button', { name: 'Retry event' })).toBeInTheDocument();
  });

  it('falls back to a generated image when the event image fails', async () => {
    vi.mocked(eventApi.getDetail).mockResolvedValue({ data: event } as never);
    renderAt();
    const image = await screen.findByRole('img', { name: event.title });
    fireEvent.error(image);
    expect(screen.getByText('the bend')).toBeInTheDocument();
  });

  it('does not show stale content when the event id changes', async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    vi.mocked(eventApi.getDetail).mockReturnValueOnce(first as never).mockResolvedValueOnce({ data: { ...event, id: secondEventId, title: 'New event' } } as never);
    render(<MemoryRouter initialEntries={[`/events/${eventId}`]}><Routes><Route path="/events/:eventId" element={<><EventDetailPage /><SwitchToSecondEvent /><PathProbe /></>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(await screen.findByRole('heading', { name: 'New event' })).toBeInTheDocument();
    resolveFirst({ data: event });
    await waitFor(() => expect(screen.queryByRole('heading', { name: event.title })).not.toBeInTheDocument());
  });

  it('clears event A while event B is pending and ignores a late event A response', async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    const second = new Promise((resolve) => { resolveSecond = resolve; });
    const nextEvent = { ...event, id: secondEventId, title: 'New event' };
    vi.mocked(eventApi.getDetail).mockReturnValueOnce(first as never).mockReturnValueOnce(second as never);

    render(<MemoryRouter initialEntries={[`/events/${eventId}`]}><Routes><Route path="/events/:eventId" element={<><EventDetailPage /><SwitchToSecondEvent /><PathProbe /></>} /></Routes></MemoryRouter>);
    resolveFirst({ data: event });
    expect(await screen.findByRole('heading', { name: event.title })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(screen.getByTestId('path')).toHaveTextContent(`/events/${secondEventId}`);
    expect(screen.queryByRole('heading', { name: event.title })).not.toBeInTheDocument();
    expect(screen.getByText('Loading event')).toBeInTheDocument();
    resolveSecond({ data: nextEvent });
    expect(await screen.findByRole('heading', { name: nextEvent.title })).toBeInTheDocument();
  });

  it('rejects an event response whose id does not match the requested id, then retries successfully', async () => {
    vi.mocked(eventApi.getDetail)
      .mockResolvedValueOnce({ data: { ...event, id: secondEventId, title: 'Wrong event' } } as never)
      .mockResolvedValueOnce({ data: { ...event, id: eventId, title: 'Requested event' } } as never);
    renderAt();

    expect(await screen.findByRole('button', { name: 'Retry event' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wrong event' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry event' }));
    expect(await screen.findByRole('heading', { name: 'Requested event' })).toBeInTheDocument();
  });

  it.each([
    '%2e%2e%2fevents%2fpricing',
    '%2e%2e%2fadmin%2fevents',
  ])('renders unavailable for invalid decoded traversal id %s without requesting it', async (invalidId) => {
    renderAt(invalidId);
    expect(await screen.findByRole('heading', { name: 'Event unavailable' })).toBeInTheDocument();
    expect(eventApi.getDetail).not.toHaveBeenCalled();
  });
});

describe('native event cards', () => {
  it('exposes one semantic internal destination and canonical share URL', () => {
    render(<MemoryRouter initialEntries={['/events']}><Routes><Route path="*" element={<><EventCard event={cardEvent()} /><PathProbe /></>} /></Routes></MemoryRouter>);
    const link = screen.getByRole('link', { name: `Open ${event.title}` });
    expect(link).toHaveAttribute('href', `/events/${eventId}`);
    expect(screen.getByTestId('share-url')).toHaveTextContent(`https://westmoreland.bend.community/events/${eventId}`);
    fireEvent.click(link);
    expect(screen.getByTestId('path')).toHaveTextContent(`/events/${eventId}`);
  });

  it('opens safe sources through the platform browser and omits unsafe sources', () => {
    render(<MemoryRouter><EventCard event={cardEvent('https://events.example.test/source')} /><EventCard event={cardEvent('javascript:alert(1)')} /></MemoryRouter>);
    const source = screen.getByRole('link', { name: 'View source' });
    expect(source).toHaveClass('native-control');
    fireEvent.click(source);
    expect(browserOpen).toHaveBeenCalledWith('https://events.example.test/source');
  });

  it('omits unsafe source destinations from web event cards', () => {
    nativePresentation = false;
    render(<MemoryRouter><EventCard event={cardEvent('https://events.example.test/source')} /><EventCard event={cardEvent('javascript:alert(1)')} /></MemoryRouter>);

    const destinations = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(destinations).toEqual([
      'https://events.example.test/source',
      'https://events.example.test/source',
    ]);
  });
});
