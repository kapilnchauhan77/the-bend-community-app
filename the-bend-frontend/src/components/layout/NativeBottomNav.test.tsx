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
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Post' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })
  it('scrolls an already-selected Explore root instead of pushing another entry', () => {
    renderNavAt('/explore'); fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    expect(scrollRootToTop).toHaveBeenCalledWith('explore'); expect(navigate).not.toHaveBeenCalled()
  })
  it('marks the active root tab with aria-current', () => {
    renderNavAt('/messages/thread-1')
    expect(screen.getByRole('button', { name: 'Inbox' })).toHaveAttribute('aria-current', 'page')
  })
})
