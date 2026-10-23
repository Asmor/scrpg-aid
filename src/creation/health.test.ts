import { describe, expect, it } from 'vitest'
import type { Hero } from '../hero/model'
import { A, completeHero, P, Q } from '../test/heroes'
import { computeHealth, healthTraitOptions, statusDice } from './health'
import { deriveTraits } from './traits'

const health = (hero: Hero) => computeHealth(hero, deriveTraits(hero).traits)
const codes = (hero: Hero) => health(hero).warnings.map((w) => w.code)

describe('status dice', () => {
  it('come from the personality', () => {
    expect(statusDice(completeHero())).toEqual({ green: 'd8', yellow: 'd8', red: 'd8' })
    const hero = completeHero()
    hero.personality = null
    expect(statusDice(hero)).toBeUndefined()
  })

  it('the status retcon raises the Red die one size, to at most d12', () => {
    const hero = completeHero()
    hero.retcon = { id: 'upgrade-red-status', kind: 'upgradeStatusDie' }
    expect(statusDice(hero)).toEqual({ green: 'd8', yellow: 'd8', red: 'd10' })
    // A mismatched retcon record is ignored here (traits.ts warns about it).
    hero.retcon = { id: 'swap-power-dice', kind: 'upgradeStatusDie' }
    expect(statusDice(hero)?.red).toBe('d8')
  })
})

describe('Health', () => {
  it('is 8 + the Red die + the chosen trait + 4 (or the roll), with its zone ranges', () => {
    // 8 + d8 (8) + Agility d10 (10) + 4 = 30
    expect(health(completeHero())).toEqual({ max: 30, ranges: { max: 30, green: [30, 23], yellow: [22, 12], red: [11, 1] }, warnings: [] })
    const hero = completeHero()
    hero.health = { trait: Q('alertness'), mode: 'roll', rollResult: 6 }
    // 8 + 8 + Alertness d8 (8) + 6 = 30
    expect(health(hero).max).toBe(30)
  })

  it('waits until there is a personality and a Health choice', () => {
    const hero = completeHero()
    hero.health = null
    expect(health(hero)).toEqual({ warnings: [] })
    hero.health = { mode: 'fixed' }
    hero.personality = null
    expect(health(hero)).toEqual({ warnings: [] })
  })

  it('asks for the trait and the roll', () => {
    const hero = completeHero()
    hero.health = { mode: 'roll' }
    expect(health(hero)).toEqual({
      warnings: [
        expect.objectContaining({ code: 'health-trait-missing' }),
        expect.objectContaining({ code: 'health-roll-missing', message: 'Roll your d8 for Health, or take the flat 4.' }),
      ],
    })
    hero.health = { trait: P('agility'), mode: 'roll', rollResult: 9 }
    expect(codes(hero)).toEqual(['health-roll-invalid'])
  })

  it('only allows an Athletic power or Mental quality, unless the archetype or personality widens it', () => {
    const hero = completeHero()
    hero.health = { trait: P('fire'), mode: 'fixed' }
    expect(health(hero).warnings.map((w) => w.message)).toEqual(["Fire can't be used for Health."])
    // Mischievous allows any power or quality.
    hero.personality = { id: 'mischievous', bonus: [], outUses: [P('fire')] }
    expect(health(hero)).toMatchObject({ max: 28, warnings: [] })
    // Armored allows Materials and Technological powers.
    const armored = completeHero()
    armored.archetype = { id: 'armored', traits: [A(P('power-suit'), 'd12'), A(Q('banter'), 'd6')], abilities: [], bonus: [] }
    expect(healthTraitOptions(armored, deriveTraits(armored).traits).map((t) => t.trait.id)).toContain('power-suit')
  })

  it('uses the fallback d4 when the hero has no eligible trait', () => {
    const hero = completeHero()
    hero.background!.qualities = [A(Q('fitness'), 'd10'), A(Q('banter'), 'd8')]
    hero.powerSource!.powers = [A(P('fire'), 'd10'), A(P('cold'), 'd8'), A(P('flight'), 'd8')]
    hero.archetype!.traits = [A(P('leaping'), 'd12'), A(Q('finesse'), 'd6')]
    hero.health = { mode: 'fixed' }
    // 8 + 8 + d4 (4) + 4 = 24
    expect(health(hero).max).toBe(24)
    hero.health = { trait: P('fire'), mode: 'fixed' }
    expect(codes(hero)).toEqual(['health-trait-not-allowed'])
  })

  it('stays within the Health table for high totals (the out-of-range warning is defensive)', () => {
    const hero = completeHero()
    hero.retcon = { id: 'upgrade-red-status', kind: 'upgradeStatusDie' }
    hero.archetype!.traits = [A(P('agility'), 'd12', true), A(P('speed'), 'd10'), A(P('flight'), 'd6')]
    hero.health = { trait: P('agility'), mode: 'roll', rollResult: 8 }
    // 8 + d10 (10) + d12 (12) + 8 = 38: still in range.
    expect(health(hero)).toMatchObject({ max: 38 })
    expect(codes(hero)).toEqual([])
  })
})
