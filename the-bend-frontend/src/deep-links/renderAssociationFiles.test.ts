import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
// @ts-expect-error The generator is an executable ESM module without a production TS dependency.
import { associationOutputDirectory, createAssociationDocuments, renderAssociationFiles, validateInputs } from '../../scripts/render-association-files.mjs'

const teamId = 'ABCDE12345'
const fingerprint = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'

describe('association generator', () => {
  it.each([['', fingerprint], ['abcde12345', fingerprint], [teamId, 'AA:BB'], [teamId, fingerprint.toLowerCase()]])('rejects invalid inputs', (team, hash) => expect(() => validateInputs(team, hash)).toThrow())
  it('renders deterministic exact app links and approved paths', async () => {
    const first = createAssociationDocuments(teamId, fingerprint)
    const second = createAssociationDocuments(teamId, fingerprint)
    expect(second).toEqual(first)
    expect(first.aasa.applinks.details[0].appID).toBe('ABCDE12345.community.bend.westmoreland')
    expect(first.assetlinks[0].target.package_name).toBe('community.bend.westmoreland')
    expect(first.aasa.applinks.details[0].components.map((item: Record<string, string>) => item['/'])).toEqual(['/', '/listing/*', '/business/*', '/events', '/events/*', '/bender', '/bender/*', '/messages/*', '/notifications'])
  })

  it('rejects external and traversal output directories before writing', async () => {
    await expect(renderAssociationFiles({ teamId, fingerprint, outputDir: '/tmp/x/.well-known' })).rejects.toThrow(/public\/\.well-known/)
    await expect(renderAssociationFiles({ teamId, fingerprint, outputDir: join(associationOutputDirectory, '..', '..', '.well-known') })).rejects.toThrow(/public\/\.well-known/)
    expect(associationOutputDirectory.endsWith('/public/.well-known')).toBe(true)
  })
})
