import { describe, expect, it } from 'vitest'
import { buildRegistrationPayload } from './registrationFlow'
import type { RegisterFormData } from '@/lib/validators'

const individualWithStaleBusinessFields: RegisterFormData = {
  user_type: 'individual',
  shop_name: 'Old shop',
  business_type: 'Food and Drink',
  owner_name: 'Pat Neighbor',
  email: 'pat@example.com',
  phone: '5405550100',
  whatsapp: '5405550199',
  password: 'safe-password',
  confirm_password: 'safe-password',
  address: '10 Old Road',
  guidelines_accepted: true,
}

describe('buildRegistrationPayload', () => {
  it('removes every business-only value from an individual payload', () => {
    expect(buildRegistrationPayload(individualWithStaleBusinessFields)).toEqual({
      user_type: 'individual',
      owner_name: 'Pat Neighbor',
      email: 'pat@example.com',
      phone: '5405550100',
      password: 'safe-password',
      guidelines_accepted: true,
    })
  })

  it('builds the current flat business payload without confirm_password', () => {
    expect(buildRegistrationPayload({
      user_type: 'business',
      shop_name: 'Bend Market',
      business_type: 'Food and Drink',
      owner_name: 'Pat Neighbor',
      email: 'pat@example.com',
      phone: '5405550100',
      whatsapp: '',
      password: 'safe-password',
      confirm_password: 'safe-password',
      address: '10 Main Street',
      guidelines_accepted: true,
    })).toEqual({
      user_type: 'business',
      shop_name: 'Bend Market',
      business_type: 'Food and Drink',
      owner_name: 'Pat Neighbor',
      email: 'pat@example.com',
      phone: '5405550100',
      whatsapp: undefined,
      password: 'safe-password',
      address: '10 Main Street',
      guidelines_accepted: true,
    })
  })
})
