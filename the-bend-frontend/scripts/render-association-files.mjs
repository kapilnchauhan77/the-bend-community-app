import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(new URL('..', import.meta.url).pathname)

export function validateInputs(teamId, fingerprint) {
  if (!/^[A-Z0-9]{10}$/.test(teamId)) throw new Error('APPLE_TEAM_ID must be exactly 10 uppercase alphanumeric characters')
  if (!/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fingerprint)) throw new Error('ANDROID_APP_LINK_SHA256 must be exactly 32 colon-separated SHA-256 bytes')
}

export function createAssociationDocuments(teamId, fingerprint) {
  validateInputs(teamId, fingerprint)
  const components = ['/', '/listing/*', '/business/*', '/events', '/events/*', '/bender', '/bender/*', '/messages/*', '/notifications'].map((path) => ({ '/': path }))
  const aasa = { applinks: { apps: [], details: [{ appID: `${teamId}.community.bend.westmoreland`, components }] } }
  const assetlinks = [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'community.bend.westmoreland', sha256_cert_fingerprints: [fingerprint] } }]
  return { aasa, assetlinks }
}

export async function renderAssociationFiles({ teamId, fingerprint, outputDir = resolve(root, 'public/.well-known') }) {
  validateInputs(teamId, fingerprint)
  if (!relative(root, outputDir).split(sep).includes('.well-known')) throw new Error('association output escaped public/.well-known')
  const { aasa, assetlinks } = createAssociationDocuments(teamId, fingerprint)
  await mkdir(outputDir, { recursive: true })
  await writeFile(resolve(outputDir, 'apple-app-site-association'), `${JSON.stringify(aasa, null, 2)}\n`, 'utf8')
  await writeFile(resolve(outputDir, 'assetlinks.json'), `${JSON.stringify(assetlinks, null, 2)}\n`, 'utf8')
  return { aasa, assetlinks }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await renderAssociationFiles({ teamId: process.env.APPLE_TEAM_ID ?? '', fingerprint: process.env.ANDROID_APP_LINK_SHA256 ?? '' })
  console.log('Wrote deterministic association files to public/.well-known')
}
