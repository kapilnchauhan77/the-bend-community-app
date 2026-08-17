import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebRoutes } from './WebRoutes';

vi.mock('@/stores/authStore', () => ({ useAuthStore: (selector?: (state: { isAuthenticated: boolean; isLoading: boolean; user: null }) => unknown) => selector ? selector({ isAuthenticated: false, isLoading: false, user: null }) : { isAuthenticated: false, isLoading: false, user: null } }));
vi.mock('@/pages/NotFoundPage', () => ({ default: () => <div>Public not found</div> }));
vi.mock('@/pages/admin/DashboardPage', () => ({ default: () => <div>Admin dashboard</div> }));
afterEach(() => cleanup());

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><WebRoutes /></MemoryRouter>); }

describe('WebRoutes', () => {
  it('does not render the public not-found surface alongside admin routes', () => {
    renderAt('/admin');
    expect(screen.queryByText('Public not found')).not.toBeInTheDocument();
  });

  it('keeps the public not-found surface for unknown public URLs', () => {
    renderAt('/unknown-public-path');
    expect(screen.getByText('Public not found')).toBeInTheDocument();
  });
});
