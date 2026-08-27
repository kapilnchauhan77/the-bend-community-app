import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Android release signing configuration', () => {
  const buildGradle = readFileSync(
    resolve(process.cwd(), 'android/app/build.gradle'),
    'utf8',
  )

  it('loads every release signing value from the environment', () => {
    expect(buildGradle).toContain('BEND_ANDROID_KEYSTORE_PATH')
    expect(buildGradle).toContain('BEND_ANDROID_KEYSTORE_PASSWORD')
    expect(buildGradle).toContain('BEND_ANDROID_KEY_ALIAS')
    expect(buildGradle).toContain('BEND_ANDROID_KEY_PASSWORD')
  })

  it('signs release builds only when all required values are present', () => {
    expect(buildGradle).toMatch(/signingConfigs\s*\{[\s\S]*release\s*\{/)
    expect(buildGradle).toContain('signingConfig signingConfigs.release')
    expect(buildGradle).toContain('Missing Android release signing environment variables')
  })
})
