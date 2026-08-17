import { describe, expect, it, beforeEach } from 'vitest'
import { DraftStore } from './DraftStore'

describe('DraftStore', () => {
  beforeEach(() => DraftStore.resetForTests())

  it('stores typed fields and local media URIs without submitted state', async () => {
    const drafts = new DraftStore({ storage: 'memory' })
    await drafts.save('create-listing', { fields: { title: 'A listing' }, localMediaUris: ['file://photo.jpg'] })
    expect(await drafts.load('create-listing')).toEqual({ fields: { title: 'A listing' }, localMediaUris: ['file://photo.jpg'] })
  })

  it('clears private drafts', async () => {
    const drafts = new DraftStore({ storage: 'memory' })
    await drafts.save('create-listing', { fields: { title: 'A listing' }, localMediaUris: [] })
    await drafts.clearPrivateDrafts()
    expect(await drafts.load('create-listing')).toBeNull()
  })
})
