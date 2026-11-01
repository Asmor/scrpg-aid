import { describe, expect, it } from 'vitest'
import { allTags, cleanTags, compareText, enterChoice, hasTag, normalizeTag, spellingFor, suggestTags, withoutTag, withTag } from './tags'

describe('normalizeTag', () => {
  it('trims, collapses inner whitespace, and caps at 40 characters', () => {
    expect(normalizeTag('  scene   3 ')).toBe('scene 3')
    expect(normalizeTag('a\tb\nc')).toBe('a b c')
    expect(normalizeTag('x'.repeat(45))).toBe('x'.repeat(40))
    // Capping never leaves a trailing space.
    expect(normalizeTag(`${'x'.repeat(39)} yz`)).toBe('x'.repeat(39))
  })

  it('rejects an empty tag', () => {
    expect(normalizeTag('')).toBeUndefined()
    expect(normalizeTag('   ')).toBeUndefined()
  })
})

describe('tag lists', () => {
  it('match and stay unique ignoring case, keeping the spelling typed', () => {
    expect(hasTag(['Scene-3'], 'scene-3')).toBe(true)
    expect(withTag(['scene-3'], 'Scene-3')).toEqual(['scene-3'])
    expect(withTag(['scene-3'], 'Prep')).toEqual(['scene-3', 'Prep'])
    expect(withoutTag(['scene-3', 'Prep'], 'prep')).toEqual(['scene-3'])
  })

  it('cleans tags read from a file', () => {
    expect(cleanTags([' a ', 'A', '', 'b  c'])).toEqual(['a', 'b c'])
  })
})

describe('allTags', () => {
  it('is the union of item tags, alphabetical in number order, with counts', () => {
    const items = [{ tags: ['scene-10', 'prep'] }, { tags: ['scene-2', 'prep'] }, { tags: [] }]
    expect(allTags(items)).toEqual([
      { name: 'prep', count: 2 },
      { name: 'scene-2', count: 1 },
      { name: 'scene-10', count: 1 },
    ])
  })

  it('counts spellings together and shows the most common', () => {
    expect(allTags([{ tags: ['Prep'] }, { tags: ['prep'] }, { tags: ['prep'] }])).toEqual([{ name: 'prep', count: 3 }])
    // A tie goes to the first alphabetically.
    expect(allTags([{ tags: ['prep'] }, { tags: ['Prep'] }])[0]!.name).toBe(compareText('Prep', 'prep') < 0 ? 'Prep' : 'prep')
  })
})

describe('suggestions', () => {
  const existing = allTags([{ tags: ['scene-3', 'scene-30', 'prep', 'aprep', 'one-shot', 'thursday-game', 'scene-1', 'scene-2', 'scene-4'] }])

  it('uses an existing spelling for typed text that matches ignoring case', () => {
    expect(spellingFor('  PREP ', existing)).toBe('prep')
    expect(spellingFor('new tag', existing)).toBe('new tag')
    expect(spellingFor('  ', existing)).toBeUndefined()
  })

  it('lists up to six tags containing the text, not on the item, alphabetical', () => {
    expect(suggestTags('scene', existing, ['scene-2'])).toEqual({ suggestions: ['scene-1', 'scene-3', 'scene-4', 'scene-30'], create: 'scene' })
    expect(suggestTags('', existing).suggestions).toHaveLength(6)
  })

  it('offers to create text that matches no tag', () => {
    expect(suggestTags('Scene 9', existing)).toEqual({ suggestions: [], create: 'Scene 9' })
    expect(suggestTags('rep', existing)).toEqual({ suggestions: ['aprep', 'prep'], create: 'rep' })
  })

  it('puts an exact match first and picks it on Enter, even when the item has it', () => {
    const s = suggestTags('PREP', existing)
    expect(s).toEqual({ suggestions: ['prep', 'aprep'], exact: 'prep' })
    expect(enterChoice(s)).toBe('prep')
    expect(enterChoice(suggestTags('prep', existing, ['prep']))).toBe('prep')
  })

  it('picks the first suggestion on Enter, or the tag to create', () => {
    expect(enterChoice(suggestTags('scene', existing))).toBe('scene-1')
    expect(enterChoice(suggestTags('brand new', existing))).toBe('brand new')
    expect(enterChoice(suggestTags('', []))).toBeUndefined()
  })
})
