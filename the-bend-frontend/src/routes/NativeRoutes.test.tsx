import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeRoutes } from './NativeRoutes';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (state: { isAuthenticated: boolean; isLoading: boolean; user: null }) => unknown) =>
    selector ? selector({ isAuthenticated: false, isLoading: false, user: null }) : { isAuthenticated: false, isLoading: false, user: null },
}));
vi.mock('@/pages/HomePage', () => ({ default: () => <div>Native home</div> }));

afterEach(() => cleanup());

function renderNativeAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NativeRoutes />
    </MemoryRouter>,
  );
}

describe('NativeRoutes', () => {
  it.each(['/admin', '/super-admin'])('does not render %s in native mode', async (path) => {
    renderNativeAt(path);
    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
  });

  it('shows the five approved native destinations', () => {
    renderNativeAt('/');

    for (const label of ['Home', 'Explore', 'Post', 'Inbox', 'You']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});
