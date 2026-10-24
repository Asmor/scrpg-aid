import { describe, expect, it } from 'vitest'
import type { AbilityPick } from '../hero/model'
import { P, Q } from '../test/heroes'
import { canSetUse, replacePick, setBlank, setCustomName, setUse } from './picks'

const pick: AbilityPick = { source: 'powerSource.yellow', name: 'Inflict' }

describe('ability pick edits', () => {
  it('fills trait slots in order', () => {
    expect(canSetUse(pick, 0)).toBe(true)
    expect(canSetUse(pick, 1)).toBe(false)
    expect(setUse(pick, 1, P('fire'))).toBe(pick)
    const one = setUse(pick, 0, P('fire'))
    expect(one.uses).toEqual([P('fire')])
    const two = setUse(one, 1, Q('banter'))
    expect(two.uses).toEqual([P('fire'), Q('banter')])
    expect(setUse(two, 0, P('cold')).uses).toEqual([P('cold'), Q('banter')])
  })

  it('clearing a slot clears the ones after it, and removes an empty list', () => {
    const two = { ...pick, uses: [P('fire'), Q('banter')] }
    expect(setUse(two, 1, undefined).uses).toEqual([P('fire')])
    expect(setUse(two, 0, undefined)).toEqual(pick)
  })

  it('sets blanks and the player’s name', () => {
    expect(setBlank(setBlank(pick, 'Boost or Hinder', 'Boost'), 'x', ['a', 'b']).blanks).toEqual({ 'Boost or Hinder': 'Boost', x: ['a', 'b'] })
    const named = setCustomName(pick, 'Searing Strike')
    expect(named.customName).toBe('Searing Strike')
    expect(setCustomName(named, '')).toEqual(pick)
  })

  it('adds, replaces, and removes picks by name', () => {
    const other: AbilityPick = { source: 'powerSource.yellow', name: 'Area Alteration' }
    const list = replacePick([pick], other.name, other)
    expect(list).toEqual([pick, other])
    const changed = { ...pick, customName: 'X' }
    expect(replacePick(list, pick.name, changed)).toEqual([changed, other])
    expect(replacePick(list, pick.name, undefined)).toEqual([other])
  })
})
