import type { FieldPath } from 'react-hook-form'
import type { RegisterFormData } from '@/lib/validators'

export const REGISTRATION_STEPS = [
  { id: 'account-type', label: 'Account type' },
  { id: 'details', label: 'Your details' },
  { id: 'security', label: 'Security and guidelines' },
] as const

export type RegistrationStep = (typeof REGISTRATION_STEPS)[number]['id']
export type RegistrationUserType = RegisterFormData['user_type']

export const BUSINESS_ONLY_REGISTRATION_FIELDS = [
  'shop_name',
  'business_type',
  'address',
  'whatsapp',
] as const satisfies readonly FieldPath<RegisterFormData>[]

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
