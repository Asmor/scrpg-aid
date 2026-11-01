import { describe, expect, it } from 'vitest'
import { exampleHero } from '../hero/example'
import { changedSince, restoreSnapshot } from './edit-snapshot'

describe('edit snapshot', () => {
  it('ignores when the hero was saved and the order keys were added in', () => {
    const before = exampleHero()
    const after = structuredClone(before)
    after.updatedAt = '2030-01-01T00:00:00.000Z'
    const { name, ...rest } = after.details
    after.details = { ...rest, name } as typeof after.details
    expect(changedSince(before, after)).toBe(false)
  })

  it('leaves tags out: changing them is not an edit, and reverting keeps the current ones', () => {
    const before = exampleHero()
    const after = { ...structuredClone(before), tags: ['scene-3'], notes: 'new' }
    expect(changedSince(before, { ...structuredClone(before), tags: ['scene-3'] })).toBe(false)
    restoreSnapshot(after, before)
    expect(after.notes).toBeUndefined()
    expect(after.tags).toEqual(['scene-3'])
  })

  it('treats a key set to undefined as missing', () => {
    const before = exampleHero()
    const after = { ...structuredClone(before), notes: undefined }
    delete before.notes
    expect(changedSince(before, after)).toBe(false)
  })

  it('sees a changed choice, an added field and a removed one', () => {
    const before = exampleHero()
    expect(changedSince(before, { ...structuredClone(before), details: { ...before.details, age: '99' } })).toBe(true)
    expect(changedSince(before, { ...structuredClone(before), notes: 'new' })).toBe(true)
    const removed = structuredClone(before)
    removed.redAbilities = removed.redAbilities.slice(1)
    expect(changedSince(before, removed)).toBe(true)
  })

  it('restores exactly the snapshot, dropping fields added since', () => {
    const before = exampleHero()
    const draft = structuredClone(before)
    draft.notes = 'added'
    draft.background = null
    restoreSnapshot(draft, before)
    expect(draft).toEqual(before)
    expect(Object.hasOwn(draft, 'notes')).toBe(Object.hasOwn(before, 'notes'))
    expect(changedSince(before, draft)).toBe(false)
  })
})
