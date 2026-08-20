import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityEvent } from '@/types';
import { EventDetailPage } from './EventDetailPage';
import { eventApi } from '@/services/eventApi';

vi.mock('@/services/eventApi', () => ({ eventApi: { getDetail: vi.fn() } }));
vi.mock('@/components/layout/PageLayout', () => ({ PageLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/shared/ShareButton', () => ({ ShareButton: ({ url }: { url: string }) => <span data-testid="share-url">{url}</span> }));
vi.mock('@/components/shared/EventThumb', () => ({ EventThumb: ({ event }: { event: CommunityEvent }) => <div data-testid="event-thumb">{event.title}</div> }));
vi.mock('@/platform/createPlatformServices', () => ({ usePlatformServices: () => ({ browser: { open: vi.fn() } }) }));

const event: CommunityEvent = { id: 'event-1', title: 'Harvest Festival', description: 'A day in the park', start_date: '2026-09-12T14:00:00Z', end_date: '2026-09-12T16:00:00Z', location: 'Market Square', category: 'community', image_url: 'https://cdn.example.test/event.jpg', source: 'Calendar', source_url: 'https://events.example.test/harvest', is_featured: false, status: 'published', created_at: '2026-01-01T00:00:00Z' };

function renderAt(id = 'event-1') { return render(<MemoryRouter initialEntries={[`/events/${id}`]}><Routes><Route path="/events/:eventId" element={<EventDetailPage />} /></Routes></MemoryRouter>); }
function SwitchToSecondEvent() { const navigate = useNavigate(); return <button type="button" onClick={() => navigate('/events/event-2')}>switch</button>; }

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
