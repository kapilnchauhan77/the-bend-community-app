import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
vi.mock('@/components/layout/NativePresentationContext', () => ({ useNativePresentation: () => true }));

const event: CommunityEvent = { id: 'event-1', title: 'Harvest Festival', description: 'A day in the park', start_date: '2026-09-12T14:00:00Z', end_date: '2026-09-12T16:00:00Z', location: 'Market Square', category: 'community', image_url: 'https://cdn.example.test/event.jpg', source: 'Calendar', source_url: 'https://events.example.test/harvest', is_featured: false, status: 'published', created_at: '2026-01-01T00:00:00Z' };
const cardEvent = (source_url?: string): CommunityEvent => ({ ...event, source_url });

function renderAt(id = 'event-1') { return render(<MemoryRouter initialEntries={[`/events/${id}`]}><Routes><Route path="/events/:eventId" element={<EventDetailPage />} /></Routes></MemoryRouter>); }
function SwitchToSecondEvent() { const navigate = useNavigate(); return <button type="button" onClick={() => navigate('/events/event-2')}>switch</button>; }
function PathProbe() { return <output data-testid="path">{useLocation().pathname}</output>; }

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('EventDetailPage', () => {
  it('renders the event fields and canonical public share URL', async () => {
    vi.mocked(eventApi.getDetail).mockResolvedValue({ data: event } as never);
    renderAt();
    expect(screen.getByRole('status')).toHaveTextContent('Loading event');
    expect(await screen.findByRole('heading', { name: event.title })).toBeInTheDocument();
    expect(screen.getByText('community')).toBeInTheDocument();
    expect(screen.getByText('Market Square')).toBeInTheDocument();
    expect(screen.getByText('A day in the park')).toBeInTheDocument();
    expect(screen.getByTestId('share-url')).toHaveTextContent('https://westmoreland.bend.community/events/event-1');
    expect(screen.getByRole('link', { name: 'View source' })).toHaveAttribute('href', event.source_url);
  });

  it('maps unavailable statuses without retry', async () => {
    for (const status of [400, 401, 403, 404, 422]) {
      vi.mocked(eventApi.getDetail).mockRejectedValueOnce({ response: { status } });
      renderAt(`event-${status}`);
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
    renderAt(`event-${status}`);
    expect(await screen.findByRole('button', { name: 'Retry event' })).toBeInTheDocument();
  });

  it('shows retry for a network failure', async () => {
    vi.mocked(eventApi.getDetail).mockRejectedValueOnce(new Error('network down'));
    renderAt('network-event');
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
    vi.mocked(eventApi.getDetail).mockReturnValueOnce(first as never).mockResolvedValueOnce({ data: { ...event, id: 'event-2', title: 'New event' } } as never);
    render(<MemoryRouter initialEntries={['/events/event-1']}><Routes><Route path="/events/:eventId" element={<><EventDetailPage /><SwitchToSecondEvent /></>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(await screen.findByRole('heading', { name: 'New event' })).toBeInTheDocument();
    resolveFirst({ data: event });
    await waitFor(() => expect(screen.queryByRole('heading', { name: event.title })).not.toBeInTheDocument());
  });
});

describe('native event cards', () => {
  it('navigates source-less cards internally', () => {
    render(<MemoryRouter initialEntries={['/events']}><Routes><Route path="*" element={<><EventCard event={cardEvent()} /><PathProbe /></>} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('heading', { name: event.title }));
    expect(screen.getByTestId('path')).toHaveTextContent('/events/event-1');
  });

  it('opens safe sources through the platform browser and omits unsafe sources', () => {
    render(<MemoryRouter><EventCard event={cardEvent('https://events.example.test/source')} /><EventCard event={cardEvent('javascript:alert(1)')} /></MemoryRouter>);
    expect(screen.getAllByRole('link', { name: 'View source' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('link', { name: 'View source' }));
    expect(browserOpen).toHaveBeenCalledWith('https://events.example.test/source');
  });
});
