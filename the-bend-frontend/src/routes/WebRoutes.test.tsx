import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebRoutes } from './WebRoutes';
import { eventApi } from '@/services/eventApi';

vi.mock('@/stores/authStore', () => ({ useAuthStore: (selector?: (state: { isAuthenticated: boolean; isLoading: boolean; user: null }) => unknown) => selector ? selector({ isAuthenticated: false, isLoading: false, user: null }) : { isAuthenticated: false, isLoading: false, user: null } }));
vi.mock('@/pages/HomePage', () => ({ default: () => <div>web-home-sentinel</div> }));
vi.mock('@/pages/native/NativeHomePage', () => ({ default: () => <div>native-home-sentinel</div> }));
vi.mock('@/pages/native/NativeExplorePage', () => ({ default: () => <div>native-explore-sentinel</div> }));
vi.mock('@/pages/NotFoundPage', () => ({ default: () => <div>Public not found</div> }));
vi.mock('@/pages/BenderPage', () => ({ default: () => <div>bender-page-sentinel</div> }));
vi.mock('@/pages/AdvertisePage', () => ({ default: () => <div>advertise-page-sentinel</div> }));
vi.mock('@/services/eventApi', () => ({ eventApi: { getDetail: vi.fn() } }));
vi.mock('@/platform/createPlatformServices', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/platform/createPlatformServices')>()), usePlatformServices: () => ({ browser: { open: vi.fn() } }) }));
vi.mock('@/components/layout/PageLayout', () => ({ PageLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="public-page-layout"><nav>public web chrome</nav>{children}</div> }));
vi.mock('@/pages/admin/DashboardPage', () => ({ default: () => <div>Admin dashboard</div> }));
vi.mock('@/components/shared/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/shared/RoleGuard', () => ({ RoleGuard: ({ children }: { children: React.ReactNode }) => children }));
afterEach(() => cleanup());

const publicEventId = '00000000-0000-0000-0000-000000000003';
const publicEvent = { id: publicEventId, title: 'Public event', description: 'Public description', start_date: '2026-09-12T14:00:00Z', category: 'community', location: 'Market Square', source: 'manual', is_featured: false, status: 'published', created_at: '2026-01-01T00:00:00Z' };

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><WebRoutes /></MemoryRouter>); }

describe('WebRoutes', () => {
  it('P12 renders web Home only at root and NotFound for web Explore', () => {
    renderAt('/');
    expect(screen.getByText('web-home-sentinel')).toBeInTheDocument();
    expect(screen.queryByText('native-home-sentinel')).not.toBeInTheDocument();
    cleanup();
    renderAt('/explore');
    expect(screen.getByText('Public not found')).toBeInTheDocument();
    expect(screen.queryByText('native-explore-sentinel')).not.toBeInTheDocument();
  });
  it('does not render the public not-found surface alongside admin routes', () => {
    renderAt('/admin');
    expect(screen.getByText('Admin dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Public not found')).not.toBeInTheDocument();
  });

  it('keeps the public not-found surface for unknown public URLs', () => {
    renderAt('/unknown-public-path');
    expect(screen.getByText('Public not found')).toBeInTheDocument();
  });

  it('renders Bender at the canonical focused-post route', () => {
    renderAt('/bender/00000000-0000-0000-0000-000000000001');
    expect(screen.getByText('bender-page-sentinel')).toBeInTheDocument();
  });

  it('keeps the public advertising journey on the web route', () => {
    renderAt('/advertise');
    expect(screen.getByText('advertise-page-sentinel')).toBeInTheDocument();
    expect(screen.queryByText('Public not found')).not.toBeInTheDocument();
  });

  it('renders event detail on the public web route with web routing', async () => {
    vi.mocked(eventApi.getDetail).mockResolvedValue({ data: publicEvent } as never);
    renderAt(`/events/${publicEventId}`);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Public event' })).toBeInTheDocument());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('public web chrome')).toBeInTheDocument();
    expect(screen.queryByText('Public not found')).not.toBeInTheDocument();
  });

  it.each(['/admin/unknown', '/super-admin/unknown', '/administrator'])('renders NotFound for unknown or near-admin URL %s', (path) => {
    renderAt(path);
    expect(screen.getByText('Public not found')).toBeInTheDocument();
    expect(screen.queryByText('Admin dashboard')).not.toBeInTheDocument();
  });
});
