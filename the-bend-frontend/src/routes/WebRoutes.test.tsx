import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebRoutes } from './WebRoutes';

vi.mock('@/stores/authStore', () => ({ useAuthStore: (selector?: (state: { isAuthenticated: boolean; isLoading: boolean; user: null }) => unknown) => selector ? selector({ isAuthenticated: false, isLoading: false, user: null }) : { isAuthenticated: false, isLoading: false, user: null } }));
vi.mock('@/pages/NotFoundPage', () => ({ default: () => <div>Public not found</div> }));
vi.mock('@/pages/admin/DashboardPage', () => ({ default: () => <div>Admin dashboard</div> }));
vi.mock('@/components/shared/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/shared/RoleGuard', () => ({ RoleGuard: ({ children }: { children: React.ReactNode }) => children }));
afterEach(() => cleanup());

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><WebRoutes /></MemoryRouter>); }

describe('WebRoutes', () => {
  it('keeps web Explore outside the public route table', () => {
    renderAt('/explore');
    expect(screen.getByText('Public not found')).toBeInTheDocument();
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

  it.each(['/admin/unknown', '/super-admin/unknown', '/administrator'])('renders NotFound for unknown or near-admin URL %s', (path) => {
    renderAt(path);
    expect(screen.getByText('Public not found')).toBeInTheDocument();
    expect(screen.queryByText('Admin dashboard')).not.toBeInTheDocument();
  });
});
