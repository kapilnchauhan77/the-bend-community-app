import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'

const auth = vi.hoisted(() => ({ isAuthenticated: false, isLoading: false }))
const setPendingDestination = vi.hoisted(() => vi.fn())
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => auth }))
vi.mock('@/auth/pendingDestination', () => ({ setPendingDestination }))

function LoginProbe() {
  const location = useLocation()
  return <output data-testid="login-state">{JSON.stringify(location.state)}</output>
}

describe('ProtectedRoute', () => {
  afterEach(() => { auth.isAuthenticated = false; vi.clearAllMocks() })

  it('preserves pathname, search, and hash when redirecting to login', () => {
    render(
      <MemoryRouter initialEntries={['/create?type=offer#details']}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route path="*" element={<ProtectedRoute><div>protected</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(setPendingDestination).toHaveBeenCalledWith('/create?type=offer#details')
    expect(screen.getByTestId('login-state')).toHaveTextContent(JSON.stringify({ from: { pathname: '/create', search: '?type=offer', hash: '#details' } }))
  })
})
