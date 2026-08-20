import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RegisterPage from './RegisterPage'
import { NativePresentationProvider } from '@/components/layout/NativePresentationContext'

vi.mock('@/services/authApi', () => ({ authApi: { register: vi.fn() } }))

function renderNative() {
  if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver
  return render(<MemoryRouter initialEntries={['/register']}><NativePresentationProvider><RegisterPage /></NativePresentationProvider></MemoryRouter>)
}

describe('RegisterPage native steps', () => {
  afterEach(() => document.body.innerHTML = '')

  it('starts on account type and focuses the step heading after advancing', async () => {
    renderNative()
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 3')
    expect(screen.getByRole('heading', { name: 'Account type' })).toHaveAttribute('aria-current', 'step')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('heading', { name: 'Your details' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Step 2 of 3')
  })

  it('validates only the current step and requires business details', async () => {
    renderNative()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })
    expect(screen.getByRole('textbox', { name: /Business Name/ })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Business Type/ })).toBeInTheDocument()
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument()
  })

  it('omits business fields for an individual and clears them when switching types', async () => {
    renderNative()
    fireEvent.click(screen.getByRole('button', { name: 'An individual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })
    expect(screen.queryByLabelText('Business Name')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: /Your Name/ }), { target: { value: 'Pat Neighbor' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Email Address/ }), { target: { value: 'pat@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'A business' }))
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 3')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })
    expect(screen.queryByLabelText('Business Name')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Your Name/ })).toHaveValue('Pat Neighbor')
    expect(screen.getByRole('textbox', { name: /Email Address/ })).toHaveValue('pat@example.com')
  })

  it('keeps the web registration form on one screen without step controls', () => {
    if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver
    render(<MemoryRouter initialEntries={['/register']}><RegisterPage /></MemoryRouter>)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register business' })).toBeInTheDocument()
  })
})
