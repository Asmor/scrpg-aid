import { describe, expect, it } from 'vitest'
import type { PlayMod } from '../hero/model'
import type { AbilityEffect } from '../rules/types'
import { emptyPlay } from './state'
import { activePlans, chosenMods, modFlagsFor, confirmRoll, defaultAssignment, defaultModChoice, defaultPlans, describeEffect, describeRolls, hasDoubles, modSize, overcomeOutcome, poolDice, results, sortRolls, useValue, type Rolled } from './roll'

const r = (label: string, die: Rolled['die'], value: number): Rolled => ({ label, die, value })
// Speed d12 rolls 7, Fitness d10 rolls 3, Green status d8 rolls 5.
const pool = [r('Speed', 'd12', 7), r('Fitness', 'd10', 3), r('Green status', 'd8', 5)]

describe('the roll', () => {
  it('sorts into Max, Mid, and Min by value', () => {
    expect(sortRolls(pool)).toEqual({ max: pool[0], mid: pool[2], min: pool[1] })
    expect(describeRolls(pool)).toEqual(['Max: 7 (Speed d12)', 'Mid: 5 (Green status d8)', 'Min: 3 (Fitness d10)'])
    expect(describeRolls([r('Fitness', 'd10', 4)])).toEqual(['4 (Fitness d10)'])
  })

  it('works out each use, including sums and typed-in values', () => {
    expect(['max', 'mid', 'min', 'max+min', 'max+mid+min'].map((u) => useValue(u as never, pool))).toEqual([7, 5, 3, 10, 15])
    expect(useValue('single', [r('Fitness', 'd10', 4)])).toBe(4)
    expect(useValue('damage', pool, { damage: 6 })).toBe(6)
    expect(useValue('other', pool)).toBeUndefined()
  })

  it('spots doubles', () => {
    expect(hasDoubles(pool)).toBe(false)
    expect(hasDoubles([r('a', 'd6', 4), r('b', 'd8', 4), r('c', 'd8', 1)])).toBe(true)
  })

  it('sizes Boosts and Hinders, and Overcome outcomes, in bands of four (p. 25–26)', () => {
    expect([0, 1, 3, 4, 7, 8, 11, 12, 20].map(modSize)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
    expect([-1, 2, 5, 9, 13].map(overcomeOutcome)).toEqual(['Spectacular failure', 'Failure, or success with a major twist', 'Success with a minor twist', 'Full success', 'Success with an extra benefit'])
  })
})

describe('mods', () => {
  const mods: PlayMod[] = [
    { id: 'p1', label: 'tied up', value: -3 },
    { id: 'b1', label: 'cheer', value: 1 },
    { id: 'b2', label: 'armor', value: 2, persistent: true },
    { id: 'xb1', label: 'high ground', value: 2, exclusive: true },
    { id: 'xb2', label: 'focus', value: 3, exclusive: true },
    { id: 'xp1', label: 'dazed', value: -1, exclusive: true },
    { id: 'xp2', label: 'blinded', value: -2, exclusive: true },
  ]

  it('starts with penalties and persistent bonuses, and the largest exclusive of each', () => {
    const choice = defaultModChoice(mods)
    expect(choice).toEqual({ nonExclusive: ['p1', 'b2'], exclusiveBonus: 'xb2', exclusivePenalty: 'xp2' })
    expect(chosenMods(mods, choice).map((m) => m.id)).toEqual(['p1', 'b2', 'xb2', 'xp2'])
    expect(chosenMods(mods, { nonExclusive: [], exclusiveBonus: null, exclusivePenalty: null })).toEqual([])
  })

  it('puts every mod on the largest effect to start with', () => {
    expect(defaultAssignment(mods.slice(0, 2), [5, 7])).toEqual({ p1: 1, b1: 1 })
    expect(defaultAssignment(mods.slice(0, 1), [undefined])).toEqual({ p1: 0 })
  })
})

describe('effects', () => {
  const effects: AbilityEffect[] = [
    { actions: ['boost', 'hinder'], use: 'max' },
    { actions: ['attack'], use: 'mid', optional: true, when: 'doubles' },
    { actions: ['overcome'], use: ['max', 'mid'] },
    { actions: ['attack'], use: 'max', doublesUse: 'max+min' },
  ]

  it('starts with the first action and use, leaving optional effects out', () => {
    const plans = defaultPlans(effects)
    expect(plans.map((p) => [p.action, p.use, p.included])).toEqual([
      ['boost', 'max', true],
      ['attack', 'mid', false],
      ['overcome', 'max', true],
      ['attack', 'max', true],
    ])
  })

  it('keeps doubles-only effects for doubles, and switches to the doubles use', () => {
    const plans = defaultPlans(effects).map((p) => ({ ...p, included: true }))
    expect(activePlans(plans, pool).map((p) => p.use)).toEqual(['max', 'max', 'max'])
    const doubles = [r('a', 'd12', 6), r('b', 'd10', 6), r('c', 'd8', 2)]
    expect(activePlans(plans, doubles).map((p) => `${p.action}:${p.use}`)).toEqual(['boost:max', 'attack:mid', 'overcome:max', 'attack:max+min'])
  })

  it('gives each effect its value with its mods, and describes it', () => {
    const plans = activePlans(defaultPlans([{ actions: ['attack'], use: 'max' }, { actions: ['hinder'], use: 'min' }]), pool)
    const mod: PlayMod = { id: 'b', label: 'x', value: 2 }
    const res = results(plans, pool, {}, [mod], { b: 0 })
    expect(res.map(describeEffect)).toEqual(['Deal 9 (Max, with +2) damage.', 'Hinder 3 (Min): a -1 penalty.'])
    expect(describeEffect({ action: 'overcome', use: 'max', base: 9, mods: [], total: 9 })).toBe('Overcome 9 (Max): Full success.')
    expect(describeEffect({ action: 'boost', use: 'mid', base: 0, mods: [], total: 0 })).toBe('Boost 0 (Mid): no bonus.')
    expect(describeEffect({ action: 'recover', use: 'damage', base: undefined, mods: [], total: undefined })).toBe('Recover (damage taken): needs a value.')
  })
})

describe('poolDice', () => {
  const speed = { trait: { kind: 'power' as const, id: 'speed' }, die: 'd12' as const, step: 'archetype' as const, name: 'Speed' }
  const fitness = { trait: { kind: 'quality' as const, id: 'fitness' }, die: 'd10' as const, step: 'background' as const, name: 'Fitness' }
  const status = { label: 'Green status', die: 'd8' as const }

  it('is a power, a quality, and the status die normally', () => {
    expect(poolDice({ power: speed, quality: fitness, status })).toEqual([{ label: 'Speed', die: 'd12' }, { label: 'Fitness', die: 'd10' }, status])
  })

  it('is one die for a single-die ability', () => {
    expect(poolDice({ use: { effects: [], pool: { single: 'trait' }, traits: [fitness.trait] }, power: speed, quality: fitness, status })).toEqual([{ label: 'Fitness', die: 'd10' }])
    expect(poolDice({ use: { effects: [], pool: { single: 'status' }, traits: [] }, status })).toEqual([status])
    expect(poolDice({ use: { effects: [], pool: { single: 'redStatus' }, traits: [] }, redStatus: 'd10' })).toEqual([{ label: 'Red status', die: 'd10' }])
  })
})

describe('confirmRoll', () => {
  it('writes the roll to the history and uses up one-time mods', () => {
    let n = 0
    const clock = { now: new Date('2026-10-26T20:00:00Z'), newId: () => `id${++n}` }
    const once: PlayMod = { id: 'm1', label: 'cheer', value: 1 }
    const kept: PlayMod = { id: 'm2', label: 'armor', value: 2, persistent: true }
    const play = { ...emptyPlay(), mods: [once, kept] }
    const res = [{ action: 'attack' as const, use: 'max' as const, base: 7, mods: [once, kept], total: 10 }]
    const after = confirmRoll(play, { title: 'Used ability Inflict:', rolled: pool, results: res, manual: false }, clock)
    expect(after.mods).toEqual([kept])
    expect(after.history).toEqual([
      {
        id: 'id1',
        at: '2026-10-26T20:00:00.000Z',
        text: 'Used ability Inflict:',
        details: ['Max: 7 (Speed d12)', 'Mid: 5 (Green status d8)', 'Min: 3 (Fitness d10)', 'Deal 10 (Max, with +1 +2) damage.', "Applied '+1 cheer' bonus.", "Applied '+2 armor' bonus (persistent)."],
      },
      { id: 'id2', at: '2026-10-26T20:00:00.000Z', text: "Used up '+1 cheer' bonus." },
    ])
  })
})

describe('modFlagsFor', () => {
  it('reads persistent and exclusive from the text, but not for the plain choice of an either/or', () => {
    const either = { actions: ['boost' as const], use: ['max' as const, 'mid' as const] }
    const text = 'Boost using [power]. Use your Max die, or use your Mid die and make it persistent and exclusive.'
    expect(modFlagsFor(text, { effect: either, use: 'max' })).toEqual({ persistent: false, exclusive: false })
    expect(modFlagsFor(text, { effect: either, use: 'mid' })).toEqual({ persistent: true, exclusive: true })
    expect(modFlagsFor('Boost yourself using [power]. That bonus is persistent and exclusive.', { effect: { actions: ['boost'], use: 'mid' }, use: 'mid' })).toEqual({ persistent: true, exclusive: true })
    expect(modFlagsFor('Boost using [power].', { effect: { actions: ['boost'], use: 'mid' }, use: 'mid' })).toEqual({ persistent: false, exclusive: false })
  })
})
