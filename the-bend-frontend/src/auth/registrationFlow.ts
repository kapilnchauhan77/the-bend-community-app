import type { FieldPath } from 'react-hook-form'
import type { RegisterFormData } from '@/lib/validators'

export const REGISTRATION_STEPS = [
  { id: 'account-type', label: 'Account type' },
  { id: 'details', label: 'Your details' },
  { id: 'security', label: 'Security and guidelines' },
] as const

export type RegistrationStep = (typeof REGISTRATION_STEPS)[number]['id']
export type RegistrationUserType = RegisterFormData['user_type']

export interface RegisterPayload {
  user_type?: 'business' | 'individual'
  shop_name?: string
  business_type?: string
  owner_name: string
  email: string
  phone?: string
  whatsapp?: string
  password: string
  address?: string
  guidelines_accepted: boolean
}

export const BUSINESS_ONLY_REGISTRATION_FIELDS = [
  'shop_name',
  'business_type',
  'address',
  'whatsapp',
] as const satisfies readonly FieldPath<RegisterFormData>[]

export type RegistrationResetOperations = {
  resetField: (name: (typeof BUSINESS_ONLY_REGISTRATION_FIELDS)[number], options: { defaultValue: '' }) => void
  clearErrors: (names: readonly (typeof BUSINESS_ONLY_REGISTRATION_FIELDS)[number][]) => void
}

export function resetBusinessRegistrationFields(operations: RegistrationResetOperations): void {
  for (const field of BUSINESS_ONLY_REGISTRATION_FIELDS) operations.resetField(field, { defaultValue: '' })
  operations.clearErrors([...BUSINESS_ONLY_REGISTRATION_FIELDS])
}

export function buildRegistrationPayload(data: RegisterFormData): RegisterPayload {
  if (data.user_type === 'individual') {
    return {
      user_type: 'individual',
      owner_name: data.owner_name,
      email: data.email,
      phone: data.phone || undefined,
      password: data.password,
      guidelines_accepted: data.guidelines_accepted,
    }
  }

  return {
    user_type: 'business',
    shop_name: data.shop_name || undefined,
    business_type: data.business_type || undefined,
    owner_name: data.owner_name,
    email: data.email,
    phone: data.phone || undefined,
    whatsapp: data.whatsapp || undefined,
    password: data.password,
    address: data.address || undefined,
    guidelines_accepted: data.guidelines_accepted,
  }
}

const NEXT_REGISTRATION_STEP: Record<RegistrationStep, RegistrationStep> = {
  'account-type': 'details',
  details: 'security',
  security: 'security',
}

const PREVIOUS_REGISTRATION_STEP: Record<RegistrationStep, RegistrationStep> = {
  'account-type': 'account-type',
  details: 'account-type',
  security: 'details',
}

export function registrationFieldsForStep(
  step: RegistrationStep,
  userType: RegistrationUserType,
): FieldPath<RegisterFormData>[] {
  if (step === 'account-type') return ['user_type']
  if (step === 'security') return ['password', 'confirm_password', 'guidelines_accepted']
  return userType === 'business'
    ? ['shop_name', 'business_type', 'owner_name', 'email', 'phone', 'address', 'whatsapp']
    : ['owner_name', 'email', 'phone']
}

export function nextRegistrationStep(step: RegistrationStep): RegistrationStep {
  return NEXT_REGISTRATION_STEP[step]
}

export function previousRegistrationStep(step: RegistrationStep): RegistrationStep {
  return PREVIOUS_REGISTRATION_STEP[step]
}
