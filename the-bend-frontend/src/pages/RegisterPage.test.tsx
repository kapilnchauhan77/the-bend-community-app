import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RegisterPage from './RegisterPage'
import { NativePresentationProvider } from '@/components/layout/NativePresentationContext'
import { nextRegistrationStep, previousRegistrationStep, registrationFieldsForStep, resetBusinessRegistrationFields } from '@/auth/registrationFlow'

vi.mock('@/services/authApi', () => ({ authApi: { register: vi.fn() } }))
const browserOpen = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('@/platform/createPlatformServices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/createPlatformServices')>()),
  usePlatformServices: () => ({ browser: { open: browserOpen } }),
}))

import { authApi } from '@/services/authApi'

const nativeCss = readFileSync('src/styles/native.css', 'utf8')
const cssRule = (selector: string) => {
  return nativeCss.split('}').find((chunk) => chunk.includes(selector) && chunk.includes('{'))?.split('{').slice(1).join('{') ?? ''
}

function renderNative() {
  if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => undefined
  return render(<MemoryRouter initialEntries={['/register']}><NativePresentationProvider><RegisterPage /></NativePresentationProvider></MemoryRouter>)
}

async function fillNativeBusinessForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByRole('heading', { name: 'Your details' })
  fireEvent.change(screen.getByRole('textbox', { name: /Business Name/ }), { target: { value: 'Bend Market' } })
  fireEvent.click(screen.getByRole('combobox', { name: /Business Type/ }))
  fireEvent.click(await screen.findByRole('option', { name: 'Food and Drink' }))
  fireEvent.change(screen.getByRole('textbox', { name: /Your Name/ }), { target: { value: 'Pat Neighbor' } })
  fireEvent.change(screen.getByRole('textbox', { name: /Email Address/ }), { target: { value: 'pat@example.com' } })
  fireEvent.change(screen.getByRole('textbox', { name: /Phone/ }), { target: { value: '5405550100' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByRole('heading', { name: 'Security and guidelines' })
  fireEvent.change(document.getElementById('password')!, { target: { value: 'safe-password1' } })
  fireEvent.change(document.getElementById('confirm_password')!, { target: { value: 'safe-password1' } })
}

describe('RegisterPage native steps', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('starts on account type and focuses the step heading after advancing', async () => {
    renderNative()
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 3')
    expect(screen.getByRole('heading', { name: 'Account type' })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Business accounts require admin approval before access. Individual accounts can access immediately after registration.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('heading', { name: 'Your details' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Step 2 of 3')
  })

  it('uses one-column native registration grids with shrinkable children for large text', async () => {
    renderNative()
    const accountTypeGrid = screen.getByRole('button', { name: 'A business' }).parentElement
    expect(accountTypeGrid).toHaveClass('native-registration-adaptive-grid')
    expect(accountTypeGrid?.children).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })
    const contactGrid = screen.getByLabelText(/WhatsApp/).parentElement?.parentElement
    expect(contactGrid).toHaveClass('native-registration-adaptive-grid')
    expect(contactGrid?.children).toHaveLength(2)

    expect(cssRule('.native-app .native-registration-adaptive-grid')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(cssRule('.native-app .native-registration-adaptive-grid > *')).toMatch(/min-width:\s*0/)
  })

  it('lets native contact controls grow above their 44px minimum', async () => {
    renderNative()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })

    for (const control of [screen.getByLabelText(/Phone/), screen.getByLabelText(/WhatsApp/)]) {
      expect(control).toHaveClass('native-registration-adaptive-control')
      expect(control).not.toHaveClass('h-11')
    }

    const controlRule = cssRule('.native-app .native-registration-adaptive-control')
    expect(controlRule).toMatch(/min-width:\s*0/)
    expect(controlRule).toMatch(/min-height:\s*44px/)
    expect(controlRule).toMatch(/height:\s*auto/)
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
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/guidelines')
    expect(screen.getByRole('link', { name: 'community guidelines' })).toHaveAttribute('href', '/guidelines')
    expect(browserOpen).not.toHaveBeenCalled()
  })

  it('connects rendered validation controls to stable error ids', async () => {
    renderNative()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })
    expect(screen.getByRole('textbox', { name: /Business Name/ })).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByRole('combobox', { name: /Business Type/ })).not.toHaveAttribute('aria-describedby')
  })

  it('keeps the WhatsApp error beside WhatsApp and out of Security', async () => {
    renderNative()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Your details' })
    fireEvent.change(screen.getByRole('textbox', { name: /Business Name/ }), { target: { value: 'Bend Market' } })
    fireEvent.click(screen.getByRole('combobox', { name: /Business Type/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'Food and Drink' }))
    fireEvent.change(screen.getByRole('textbox', { name: /Your Name/ }), { target: { value: 'Pat Neighbor' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Email Address/ }), { target: { value: 'pat@example.com' } })
    fireEvent.change(screen.getAllByPlaceholderText('+1 555 0100')[1], { target: { value: '123456789012345678901' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    const whatsappError = await screen.findByText(/20 character|20 characters|<=20/)
    expect(document.querySelectorAll('#whatsapp-error')).toHaveLength(1)
    expect(screen.getAllByPlaceholderText('+1 555 0100')[1]).toHaveAttribute('aria-describedby', 'whatsapp-error')
    expect(whatsappError.closest('div')?.querySelector('#whatsapp')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Security and guidelines' })).not.toBeInTheDocument()
  })

  it('keeps the exact pure step mappings and clamps navigation', () => {
    expect(registrationFieldsForStep('account-type', 'business')).toEqual(['user_type'])
    expect(registrationFieldsForStep('details', 'business')).toEqual(['shop_name', 'business_type', 'owner_name', 'email', 'phone', 'address', 'whatsapp'])
    expect(registrationFieldsForStep('details', 'individual')).toEqual(['owner_name', 'email', 'phone'])
    expect(registrationFieldsForStep('security', 'individual')).toEqual(['password', 'confirm_password', 'guidelines_accepted'])
    expect(nextRegistrationStep('security')).toBe('security')
    expect(previousRegistrationStep('account-type')).toBe('account-type')
  })

  it('keeps Register disabled before consent and enables it after consent', async () => {
    renderNative()
    await fillNativeBusinessForm()
    const registerButton = screen.getByRole('button', { name: 'Register business' })
    expect(registerButton).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /agree to the community guidelines/i }))
    expect(registerButton).toBeEnabled()
  })

  it('opens Guidelines inside the native app without losing security-step values', async () => {
    renderNative()
    await fillNativeBusinessForm()
    fireEvent.click(screen.getByRole('checkbox', { name: /agree to the community guidelines/i }))

    const trigger = screen.getByRole('link', { name: 'View' })
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'Community Guidelines' })
    expect(dialog).toHaveTextContent('1. Purpose & Mission')
    expect(browserOpen).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Security and guidelines' })).toBeInTheDocument()
    expect(document.getElementById('password')).toHaveValue('safe-password1')
    expect(document.getElementById('confirm_password')).toHaveValue('safe-password1')
    expect(screen.getByRole('checkbox', { name: /agree to the community guidelines/i })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Close Community Guidelines' }))
    expect(screen.queryByRole('dialog', { name: 'Community Guidelines' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(document.getElementById('password')).toHaveValue('safe-password1')
  })

  it('uses the same in-app Guidelines sheet for the inline link', async () => {
    renderNative()
    await fillNativeBusinessForm()
    const link = screen.getByRole('link', { name: 'community guidelines' })
    const consent = screen.getByRole('checkbox', { name: /agree to the community guidelines/i })
    fireEvent.click(consent)
    expect(consent).toBeChecked()
    expect(link).toHaveAttribute('href', '/guidelines')

    fireEvent.click(link)

    expect(await screen.findByRole('dialog', { name: 'Community Guidelines' })).toBeInTheDocument()
    expect(browserOpen).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Security and guidelines' })).toBeInTheDocument()
    expect(consent).toBeChecked()
  })

  it('sends the exact hand-written payload and stays disabled while pending', async () => {
    let resolveRequest!: () => void
    vi.mocked(authApi.register).mockReturnValue(new Promise((resolve) => {
      resolveRequest = () => resolve({ data: { message: 'ok' } } as never)
    }) as never)
    renderNative()
    await fillNativeBusinessForm()
    fireEvent.click(screen.getByRole('checkbox', { name: /agree to the community guidelines/i }))
    const registerButton = screen.getByRole('button', { name: 'Register business' })
    fireEvent.click(registerButton)
    await waitFor(() => expect(registerButton).toBeDisabled())
    expect(authApi.register).toHaveBeenCalledWith({
      user_type: 'business',
      shop_name: 'Bend Market',
      business_type: 'food_and_drink',
      owner_name: 'Pat Neighbor',
      email: 'pat@example.com',
      phone: '5405550100',
      whatsapp: undefined,
      password: 'safe-password1',
      address: undefined,
      guidelines_accepted: true,
    })
    resolveRequest()
    expect(await screen.findByRole('button', { name: 'Back to Home' })).toHaveClass('native-auth-adaptive-action')
  })

  it('stays on Security after rejection and retains values and confirmation', async () => {
    vi.mocked(authApi.register).mockRejectedValueOnce(new Error('Nope'))
    renderNative()
    await fillNativeBusinessForm()
    fireEvent.click(screen.getByRole('checkbox', { name: /agree to the community guidelines/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Register business' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Registration failed')
    expect(alert).toHaveClass('native-auth-error')
    expect(alert).not.toHaveStyle({ backgroundColor: 'hsl(0, 86%, 97%)' })
    expect(screen.getByRole('heading', { name: 'Security and guidelines' })).toBeInTheDocument()
    expect(document.getElementById('password')).toHaveValue('safe-password1')
    expect(document.getElementById('confirm_password')).toHaveValue('safe-password1')
    expect(screen.getByRole('checkbox', { name: /agree to the community guidelines/i })).toBeChecked()
  })
})
