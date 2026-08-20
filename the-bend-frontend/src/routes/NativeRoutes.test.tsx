import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PlatformServicesProvider } from '@/platform/createPlatformServices';
import type { RuntimeConfig } from '@/platform/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeRoutes } from './NativeRoutes';

const authState = vi.hoisted(() => ({ isAuthenticated: false, isLoading: false, user: null }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (state: typeof authState) => unknown) => selector ? selector(authState) : authState,
}));
vi.mock('@/pages/HomePage', () => ({ default: () => <div>web-home-sentinel</div> }));
vi.mock('@/pages/native/NativeHomePage', () => ({ default: () => <div>native-home-sentinel</div> }));
vi.mock('@/pages/native/NativeExplorePage', () => ({ default: () => <div>native-explore-sentinel</div> }));
vi.mock('@/pages/ListingDetailPage', () => ({ default: () => <div>native-listing-detail-sentinel</div> }));
vi.mock('@/pages/BusinessProfilePage', () => ({ default: () => <h1>business-sentinel</h1> }));
vi.mock('@/pages/EventsPage', () => ({ default: () => <h1>events-sentinel</h1> }));
vi.mock('@/pages/BenderPage', () => ({ default: () => <h1>bender-sentinel</h1> }));
vi.mock('@/pages/VolunteerPage', () => ({ default: () => <h1>volunteer-sentinel</h1> }));
vi.mock('@/pages/TalentPage', () => ({ default: () => <h1>talent-sentinel</h1> }));
vi.mock('@/pages/MessagesPage', () => ({ default: () => <div>native-messages-sentinel</div> }));
vi.mock('@/pages/GuidelinesViewPage', () => ({ default: ({ embeddedNative }: { embeddedNative?: boolean }) => <div>native-guidelines-public-sentinel:{String(embeddedNative)}</div> }));
vi.mock('@/pages/LoginPage', () => ({ default: function MockLoginPage() { return <div>Login page: {useLocation().state?.from?.pathname}</div>; } }));

afterEach(() => { authState.isAuthenticated = false; cleanup(); });

function renderNativeAt(path: string) {
  const config: RuntimeConfig = { kind: 'web', isNative: false, apiBaseUrl: 'https://api.example.test', wsBaseUrl: 'wss://api.example.test', tenantSlug: 'westmoreland', appVersion: 'test', buildNumber: '1', environment: 'test' };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PlatformServicesProvider config={config}><NativeRoutes /></PlatformServicesProvider>
    </MemoryRouter>,
  );
}

describe('NativeRoutes', () => {
  it('P12 uses distinct native Home and Explore module boundaries', () => {
    renderNativeAt('/');
    expect(screen.getByText('native-home-sentinel')).toBeInTheDocument();
    expect(screen.queryByText('web-home-sentinel')).not.toBeInTheDocument();
    cleanup();
    renderNativeAt('/explore');
    expect(screen.getByText('native-explore-sentinel')).toBeInTheDocument();
    expect(screen.queryByText('native-home-sentinel')).not.toBeInTheDocument();
  });
  it.each(['/admin', '/super-admin'])('does not render %s in native mode', async (path) => {
    renderNativeAt(path);
    expect(await screen.findByText(/this page isn't available in the mobile app/i)).toBeInTheDocument();
    expect(screen.queryByText(/admin dashboard|super admin/i)).not.toBeInTheDocument();
  });

  it('renders public community guidelines in the native presentation while blocking the admin editor', async () => {
    renderNativeAt('/guidelines');
    expect(screen.getByText('native-guidelines-public-sentinel:true')).toBeInTheDocument();
    expect(screen.queryByText(/this page isn't available in the mobile app/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/upload and manage the community guidelines document/i)).not.toBeInTheDocument();

    cleanup();
    renderNativeAt('/admin/guidelines');
    expect(await screen.findByText(/this page isn't available in the mobile app/i)).toBeInTheDocument();
    expect(screen.queryByText('native-guidelines-public-sentinel:true')).not.toBeInTheDocument();
    expect(screen.queryByText(/upload and manage the community guidelines document/i)).not.toBeInTheDocument();
  });

  it('shows the five approved native destinations', () => {
    renderNativeAt('/');

    for (const label of ['Home', 'Explore', 'Create', 'Bender', 'You']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Inbox' })).not.toBeInTheDocument();
  });

  it('redirects a guest protected route to the native login surface', () => {
    renderNativeAt('/messages');
    expect(screen.getByText('Login page: /messages')).toBeInTheDocument();
  });

  it('renders the native listing detail deep link', () => {
    renderNativeAt('/listing/abc');
    expect(screen.getByText('native-listing-detail-sentinel')).toBeInTheDocument();
    expect(screen.queryByText('native-home-sentinel')).not.toBeInTheDocument();
  });

  it.each([
    ['/listing/00000000-0000-0000-0000-000000000001', 'Listing'],
    ['/business/00000000-0000-0000-0000-000000000001', 'Business'],
    ['/events', 'Events'],
  ])('renders one focused header for %s', (path, title) => {
    renderNativeAt(path);
    expect(screen.getByTestId('native-route-title')).toHaveTextContent(title);
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1);
  });

  it('redirects a protected focused route before rendering its frame', () => {
    renderNativeAt('/messages/thread-1');
    expect(screen.getByText('Login page: /messages/thread-1')).toBeInTheDocument();
    expect(screen.queryByTestId('native-route-title')).not.toBeInTheDocument();
  });

  it('renders the unavailable focused frame for an unmatched native route', () => {
    renderNativeAt('/admin/unknown');
    expect(screen.getByTestId('native-route-title')).toHaveTextContent('Page unavailable');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the authenticated Messages action on a focused Bender post', () => {
    authState.isAuthenticated = true;
    renderNativeAt('/bender/post-1');
    expect(screen.getByTestId('native-route-title')).toHaveTextContent('Bender post');
    expect(screen.getByRole('button', { name: 'Messages' })).toBeInTheDocument();
  });

  it('renders an authenticated protected messages route without Login', () => {
    authState.isAuthenticated = true;
    renderNativeAt('/messages');
    expect(screen.getByText('native-messages-sentinel')).toBeInTheDocument();
    expect(screen.queryByText(/Login page/)).not.toBeInTheDocument();
  });

  it('opens post actions and retains a guest continuation', () => {
    renderNativeAt('/');
    const setItem = vi.fn();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { setItem, getItem: vi.fn() } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(screen.getByRole('button', { name: 'Offer something' }));
    expect(screen.getByText('Login page: /create?type=offer')).toBeInTheDocument();
    expect(setItem).toHaveBeenCalledWith('native_pending_post_path', '/create?type=offer');
  });

  it('dismisses the post sheet with Escape and backdrop clicks, but not panel clicks', async () => {
    renderNativeAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const dialog = screen.getByRole('dialog');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    fireEvent.click(screen.getByText('What do you want to create?'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Close' });
    const bender = screen.getByRole('button', { name: 'Share on Bender' });
    bender.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(close).toHaveFocus();
    close.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Share on Bender' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('What do you want to create?'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
