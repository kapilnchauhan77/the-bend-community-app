import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BenderPage from './BenderPage'

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  user: { id: 'user-1', role: 'individual' },
}))

vi.mock('@/stores/authStore', () => ({ useAuthStore: () => authState }))
vi.mock('@/hooks/useBenderFeed', () => ({
  useBenderFeed: () => ({
    posts: [], cursor: null, hasMore: false, loading: false, loadingMore: false,
    loadMoreError: null, cachedAt: null, loadNext: vi.fn(), prepend: vi.fn(),
    remove: vi.fn(), patch: vi.fn(),
  }),
}))
vi.mock('@/hooks/useBenderDraft', () => ({
  useBenderDraft: () => ({
    caption: '', setCaption: vi.fn(), pending: null, setPending: vi.fn(),
    hydrated: true, discard: vi.fn(async () => undefined),
  }),
}))
vi.mock('@/hooks/useOnlineMutation', () => ({
  useOnlineMutation: () => ({ online: true, ready: true, run: vi.fn() }),
}))
vi.mock('@/components/layout/Navbar', () => ({ Navbar: () => <div data-testid="web-navbar">Web navbar</div> }))
vi.mock('@/components/layout/BottomNav', () => ({ BottomNav: () => <div data-testid="web-bottom-nav">Web bottom nav</div> }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => <div data-testid="web-footer">Web footer</div> }))
vi.mock('@/components/shared/InstallBanner', () => ({ InstallBanner: () => <div data-testid="web-install-banner">Web install banner</div> }))
vi.mock('@/components/shared/SponsorBanner', () => ({ SponsorBanner: () => <div data-testid="web-sponsor-banner">Web sponsor banner</div> }))

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderPage(nativeEmbedded = false) {
  return render(
    <MemoryRouter initialEntries={['/bender']}>
      <BenderPage nativeEmbedded={nativeEmbedded} />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('BenderPage native shell', () => {
  afterEach(() => {
    authState.isAuthenticated = true
    document.documentElement.classList.remove('dark')
    document.body.innerHTML = ''
  })

  it('uses one native feed surface without web navigation, sponsorship, or install chrome', () => {
    renderPage(true)

    expect(screen.getByRole('heading', { name: 'Bender' })).toBeInTheDocument()
    expect(document.querySelector('.native-bender-page')).toBeInTheDocument()
    expect(screen.queryByTestId('web-navbar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('web-bottom-nav')).not.toBeInTheDocument()
    expect(screen.queryByTestId('web-sponsor-banner')).not.toBeInTheDocument()
    expect(screen.queryByTestId('web-install-banner')).not.toBeInTheDocument()
  })

  it('keeps native Bender inside the semantic theme boundary in dark mode', () => {
    document.documentElement.classList.add('dark')
    renderPage(true)

    expect(document.querySelector('.native-bender-page')).toBeInTheDocument()
    expect(document.querySelector('.native-bender-header')).toBeInTheDocument()
  })

  it('keeps New post and puts Messages at the far right of the native Bender header', () => {
    renderPage(true)

    const [newPost] = screen.getAllByRole('button', { name: 'New post' })
    const messages = screen.getByRole('button', { name: 'Messages' })
    expect(newPost.compareDocumentPosition(messages) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(messages)
    expect(screen.getByTestId('location')).toHaveTextContent('/messages')
  })

  it('preserves the existing web chrome and omits the native Messages action on the web route', () => {
    renderPage()

    expect(screen.getByTestId('web-navbar')).toBeInTheDocument()
    expect(screen.getByTestId('web-bottom-nav')).toBeInTheDocument()
    expect(screen.getByTestId('web-sponsor-banner')).toBeInTheDocument()
    expect(screen.getByTestId('web-install-banner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Messages' })).not.toBeInTheDocument()
  })
})
