import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebRoutes } from './WebRoutes';

vi.mock('@/stores/authStore', () => ({ useAuthStore: (selector?: (state: { isAuthenticated: boolean; isLoading: boolean; user: null }) => unknown) => selector ? selector({ isAuthenticated: false, isLoading: false, user: null }) : { isAuthenticated: false, isLoading: false, user: null } }));
vi.mock('@/pages/HomePage', () => ({ default: () => <div>web-home-sentinel</div> }));
vi.mock('@/pages/native/NativeHomePage', () => ({ default: () => <div>native-home-sentinel</div> }));
vi.mock('@/pages/native/NativeExplorePage', () => ({ default: () => <div>native-explore-sentinel</div> }));
vi.mock('@/pages/NotFoundPage', () => ({ default: () => <div>Public not found</div> }));
vi.mock('@/pages/BenderPage', () => ({ default: () => <div>bender-page-sentinel</div> }));
vi.mock('@/pages/admin/DashboardPage', () => ({ default: () => <div>Admin dashboard</div> }));
vi.mock('@/components/shared/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/shared/RoleGuard', () => ({ RoleGuard: ({ children }: { children: React.ReactNode }) => children }));
afterEach(() => cleanup());

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

  it.each(['/admin/unknown', '/super-admin/unknown', '/administrator'])('renders NotFound for unknown or near-admin URL %s', (path) => {
    renderAt(path);
    expect(screen.getByText('Public not found')).toBeInTheDocument();
    expect(screen.queryByText('Admin dashboard')).not.toBeInTheDocument();
  });
});
