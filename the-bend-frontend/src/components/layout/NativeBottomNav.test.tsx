import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeBottomNav } from './NativeBottomNav'

const navigate = vi.fn(); const scrollRootToTop = vi.fn(); const impact = vi.fn(async () => undefined)
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')), useNavigate: () => navigate }))
vi.mock('./NativeAppShell', () => ({ useNativeAppShell: () => ({ registerRootScroll: vi.fn(), scrollRootToTop }) }))
vi.mock('@/platform/createPlatformServices', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/platform/createPlatformServices')>()), usePlatformServices: () => ({ haptics: { impact, selection: vi.fn(async () => undefined), success: vi.fn(async () => undefined) } }) }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: false }) }))

function renderNavAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><NativeBottomNav /></MemoryRouter>) }

describe('NativeBottomNav', () => {
  afterEach(() => document.body.innerHTML = '')
  it('renders exactly the five approved labels', () => {
    renderNavAt('/')
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Home', 'Explore', 'Create', 'Bender', 'You'])
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Post' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(5)
    expect(screen.getByRole('navigation')).toHaveClass('native-bottom-nav')
    expect(screen.getByRole('button', { name: 'Create' })).toHaveClass('min-w-14')
  })
  it('scrolls an already-selected Explore root instead of pushing another entry', () => {
    renderNavAt('/explore'); fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    expect(scrollRootToTop).toHaveBeenCalledWith('explore'); expect(navigate).not.toHaveBeenCalled()
  })
  it('scrolls an already-selected Home root instead of pushing another entry', () => {
    renderNavAt('/'); fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(scrollRootToTop).toHaveBeenCalledWith('home'); expect(navigate).not.toHaveBeenCalled()
  })
  it('marks the active root tab with aria-current', () => {
    renderNavAt('/bender/thread-1')
    expect(screen.getByRole('button', { name: 'Bender' })).toHaveAttribute('aria-current', 'page')
  })
  it.each(['/bender', '/bender/post-1', '/bender?post=post-1'])('marks Bender active for %s', (path) => {
    renderNavAt(path)
    expect(screen.getByRole('button', { name: 'Bender' })).toHaveAttribute('aria-current', 'page')
  })
  it('navigates to Bender when selected', () => {
    renderNavAt('/')
    fireEvent.click(screen.getByRole('button', { name: 'Bender' }))
    expect(navigate).toHaveBeenCalledWith('/bender')
  })
})
