import { describe, expect, it } from 'vitest'
import capacitorConfig from '../../capacitor.config'

describe('native status-bar configuration', () => {
  it('keeps the native WebView below the iOS status bar', () => {
    expect(capacitorConfig.plugins?.StatusBar?.overlaysWebView).toBe(false)
    expect(capacitorConfig.plugins?.StatusBar?.backgroundColor).toBe('#f7f3ea')
  })
})
