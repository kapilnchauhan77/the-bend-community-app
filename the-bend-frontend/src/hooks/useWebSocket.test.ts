import { describe, expect, it } from 'vitest'
import { buildWebSocketUrl } from './useWebSocket'

describe('buildWebSocketUrl', () => {
  it('uses the configured native production websocket base and encodes tokens', () => {
    expect(buildWebSocketUrl('a+b/c', { kind: 'ios', isNative: true, apiBaseUrl: 'https://api.bend.community/api/v1', wsBaseUrl: 'wss://api.bend.community', tenantSlug: 'westmoreland', appVersion: '1', buildNumber: '1', environment: 'production' })).toBe('wss://api.bend.community/api/v1/ws/chat?token=a%2Bb%2Fc')
  })
})
