import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BusinessProfilePage from './BusinessProfilePage'

const nativePresentation = vi.hoisted(() => ({ value: false }))
vi.mock('@/components/layout/NativePresentationContext', () => ({ useNativePresentation: () => nativePresentation.value }))
vi.mock('@/components/layout/PageLayout', () => ({ PageLayout: ({ children, embeddedClassName }: { children: React.ReactNode; embeddedClassName?: string }) => <div className={embeddedClassName}>{children}</div> }))
vi.mock('@/hooks/useBusinessProfilePublicData', () => ({
  useBusinessProfilePublicData: () => ({
    cached: { cachedAt: null }, shopData: null, listings: [], endorsements: [], setEndorsements: vi.fn(),
    endorsementCount: 0, setEndorsementCount: vi.fn(), discountCodes: [], relatedLoading: false, relatedError: null,
  }),
}))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ isAuthenticated: false, shop: null, user: null }) }))
vi.mock('@/hooks/useOnlineMutation', () => ({ useOnlineMutation: () => ({ online: true, run: vi.fn() }) }))
vi.mock('@/components/shared/ListingCard', () => ({ ListingCard: () => null }))
vi.mock('@/components/shared/ShareButton', () => ({ ShareButton: () => null }))
vi.mock('@/components/features/messages/ShareToMessageButton', () => ({ ShareToMessageButton: () => null }))
vi.mock('@/components/shared/DiscountCodesList', () => ({ DiscountCodesList: () => null }))
vi.mock('@/components/native/OfflineBanner', () => ({ OfflineBanner: () => null }))
vi.mock('@/components/native/CachedContentNotice', () => ({ CachedContentNotice: () => null }))
vi.mock('@/services/shopApi', () => ({ shopApi: { endorse: vi.fn(), withdrawEndorsement: vi.fn(), getEndorsements: vi.fn() } }))
vi.mock('@/services/messageApi', () => ({ messageApi: { startThread: vi.fn() } }))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/business/missing']}><Routes><Route path="/business/:shopId" element={<BusinessProfilePage />} /><Route path="*" element={<LocationProbe />} /></Routes></MemoryRouter>)
}

describe('BusinessProfilePage unavailable navigation', () => {
  afterEach(() => { cleanup(); nativePresentation.value = false })

  it('opens the native business explorer when a business is unavailable', () => {
    nativePresentation.value = true
    const { container } = renderPage()
    expect(container.querySelector('.native-themed-page.native-business-profile-page')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Browse Directory' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/explore?type=businesses')
  })

  it('keeps the web unavailable action pointed at the directory', () => {
    nativePresentation.value = false
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Browse Directory' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/directory')
  })
})
