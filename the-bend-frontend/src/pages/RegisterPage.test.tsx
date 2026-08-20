import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RegisterPage from './RegisterPage'
import { NativePresentationProvider } from '@/components/layout/NativePresentationContext'
import { nextRegistrationStep, previousRegistrationStep, registrationFieldsForStep, resetBusinessRegistrationFields } from '@/auth/registrationFlow'

vi.mock('@/services/authApi', () => ({ authApi: { register: vi.fn() } }))

function renderNative() {
  if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => undefined
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

  it('resets business-only values while preserving common values across account switches', async () => {
    renderNative()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })
    fireEvent.change(screen.getByRole('textbox', { name: /Business Name/ }), { target: { value: 'Old business' } })
    fireEvent.click(screen.getByRole('combobox', { name: /Business Type/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Food and Drink' }))
    fireEvent.change(screen.getByPlaceholderText('123 High Street, Montross'), { target: { value: '10 Old Road' } })
    fireEvent.change(screen.getAllByPlaceholderText('+1 555 0100')[1], { target: { value: '5405550199' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Your Name/ }), { target: { value: 'Pat Neighbor' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Email Address/ }), { target: { value: 'pat@example.com' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Phone/ }), { target: { value: '5405550100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Security and guidelines' })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'An individual' }))
    fireEvent.click(screen.getByRole('button', { name: 'A business' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })
    expect(screen.getByRole('textbox', { name: /Business Name/ })).toHaveValue('')
    expect(screen.getByPlaceholderText('123 High Street, Montross')).toHaveValue('')
    expect(screen.getAllByPlaceholderText('+1 555 0100')[1]).toHaveValue('')
    expect(screen.getByRole('combobox', { name: /Business Type/ })).toHaveTextContent('Select your business type')
    expect(screen.getByRole('textbox', { name: /Your Name/ })).toHaveValue('Pat Neighbor')
    expect(screen.getByRole('textbox', { name: /Email Address/ })).toHaveValue('pat@example.com')
    expect(screen.getByRole('textbox', { name: /Phone/ })).toHaveValue('5405550100')
    expect(screen.queryByText('Please select a business type')).not.toBeInTheDocument()
  })

  it('clears a stale business-type error and focuses the combobox', async () => {
    renderNative()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })
    fireEvent.change(screen.getByRole('textbox', { name: /Business Name/ }), { target: { value: 'Valid business' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Your Name/ }), { target: { value: 'Pat Neighbor' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Email Address/ }), { target: { value: 'pat@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Please select a business type')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Business Type/ })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'A business' }))
    fireEvent.click(screen.getByRole('button', { name: 'An individual' }))
    fireEvent.click(screen.getByRole('button', { name: 'A business' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })
    expect(screen.queryByText('Please select a business type')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Business Type/ })).toHaveTextContent('Select your business type')
  })

  it('resets each business field once, then clears the exact field list once', () => {
    const resetField = vi.fn()
    const clearErrors = vi.fn()
    resetBusinessRegistrationFields({ resetField, clearErrors })
    expect(resetField).toHaveBeenCalledTimes(4)
    expect(resetField).toHaveBeenNthCalledWith(1, 'shop_name', { defaultValue: '' })
    expect(resetField).toHaveBeenNthCalledWith(2, 'business_type', { defaultValue: '' })
    expect(resetField).toHaveBeenNthCalledWith(3, 'address', { defaultValue: '' })
    expect(resetField).toHaveBeenNthCalledWith(4, 'whatsapp', { defaultValue: '' })
    expect(clearErrors).toHaveBeenCalledTimes(1)
    expect(clearErrors).toHaveBeenCalledWith(['shop_name', 'business_type', 'address', 'whatsapp'])
  })

  it('keeps the web registration form on one screen without step controls', () => {
    if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver
    render(<MemoryRouter initialEntries={['/register']}><RegisterPage /></MemoryRouter>)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register business' })).toBeInTheDocument()
  })

  it('connects rendered validation controls to stable error ids', async () => {
    renderNative()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })
    expect(screen.getByRole('textbox', { name: /Business Name/ })).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByRole('combobox', { name: /Business Type/ })).not.toHaveAttribute('aria-describedby')
  })

  it('keeps the exact pure step mappings and clamps navigation', () => {
    expect(registrationFieldsForStep('account-type', 'business')).toEqual(['user_type'])
    expect(registrationFieldsForStep('details', 'business')).toEqual(['shop_name', 'business_type', 'owner_name', 'email', 'phone', 'address', 'whatsapp'])
    expect(registrationFieldsForStep('details', 'individual')).toEqual(['owner_name', 'email', 'phone'])
    expect(registrationFieldsForStep('security', 'individual')).toEqual(['password', 'confirm_password', 'guidelines_accepted'])
    expect(nextRegistrationStep('security')).toBe('security')
    expect(previousRegistrationStep('account-type')).toBe('account-type')
  })
})
