import { describe, expect, it } from 'vitest'
import {
  describeRef,
  expandRef,
  expandRefs,
  getCategory,
  getTrait,
  refMatches,
  refsMatch,
  traitKey,
  traitsOfKind,
} from './catalog'

describe('catalog', () => {
  it('finds traits by kind and id, keeping their category', () => {
    expect(getTrait({ kind: 'power', id: 'flight' })).toMatchObject({ name: 'Flight', categoryId: 'mobility' })
    expect(getTrait({ kind: 'quality', id: 'close-combat' })).toMatchObject({ categoryId: 'physical' })
    expect(getTrait({ kind: 'quality', id: 'flight' })).toBeUndefined()
  })

  it('keeps powers and qualities apart', () => {
    expect(traitsOfKind('power').every((t) => t.kind === 'power')).toBe(true)
    expect(traitsOfKind('quality').every((t) => t.kind === 'quality')).toBe(true)
    expect(traitsOfKind('power').length).toBeGreaterThan(40)
  })

  it('finds categories', () => {
    expect(getCategory('power', 'athletic')?.usedForHealth).toBe(true)
    expect(getCategory('quality', 'athletic')).toBeUndefined()
  })

  it('describes each kind of option reference', () => {
    expect(describeRef({ power: 'speed' })).toEqual({ kind: 'power', scope: 'trait', id: 'speed' })
    expect(describeRef({ quality: 'stealth' })).toEqual({ kind: 'quality', scope: 'trait', id: 'stealth' })
    expect(describeRef({ powerCategory: 'mobility' })).toEqual({ kind: 'power', scope: 'category', id: 'mobility' })
    expect(describeRef({ qualityCategory: 'mental' })).toEqual({ kind: 'quality', scope: 'category', id: 'mental' })
  })

  it('expands option references to traits', () => {
    expect(expandRef({ power: 'speed' }).map(traitKey)).toEqual(['power:speed'])
    expect(expandRef({ power: 'nonexistent' })).toEqual([])
    const athletic = expandRef({ powerCategory: 'athletic' }).map((t) => t.id)
    expect(athletic).toEqual(['agility', 'speed', 'strength', 'vitality'])
  })

  it('expands a list without duplicates', () => {
    const traits = expandRefs([{ power: 'speed' }, { powerCategory: 'athletic' }, { quality: 'stealth' }])
    expect(traits.map(traitKey)).toEqual([
      'power:speed',
      'power:agility',
      'power:strength',
      'power:vitality',
      'quality:stealth',
    ])
  })

  it('matches traits against references', () => {
    expect(refMatches({ powerCategory: 'mobility' }, { kind: 'power', id: 'flight' })).toBe(true)
    expect(refMatches({ powerCategory: 'athletic' }, { kind: 'power', id: 'flight' })).toBe(false)
    expect(refMatches({ power: 'flight' }, { kind: 'power', id: 'flight' })).toBe(true)
    expect(refMatches({ power: 'flight' }, { kind: 'quality', id: 'flight' })).toBe(false)
    expect(refMatches({ qualityCategory: 'mental' }, { kind: 'power', id: 'awareness' })).toBe(false)
    expect(refsMatch([{ quality: 'stealth' }, { powerCategory: 'mobility' }], { kind: 'power', id: 'leaping' })).toBe(true)
    expect(refsMatch([], { kind: 'power', id: 'leaping' })).toBe(false)
  })
})
