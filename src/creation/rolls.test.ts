import { describe, expect, it } from 'vitest'
import { createHero } from '../hero/model'
import { setStepRoll, stepRoll, takePendingRoll } from './rolls'

const roll = (results: number[]) => ({ dice: ['d10' as const, 'd10' as const], results, manual: false })

describe('table step rolls', () => {
  it('keeps a roll made before choosing as pending', () => {
    const hero = createHero('guided')
    expect(stepRoll(hero, 'background')).toBeUndefined()
    setStepRoll(hero, 'background', roll([1, 2]))
    expect(hero.pendingRolls).toEqual({ background: roll([1, 2]) })
    expect(stepRoll(hero, 'background')).toEqual(roll([1, 2]))
    // Other steps' pending rolls are kept.
    setStepRoll(hero, 'powerSource', roll([3, 4]))
    expect(Object.keys(hero.pendingRolls!)).toEqual(['background', 'powerSource'])
  })

  it('puts a roll on the choice once there is one', () => {
    const hero = createHero('guided')
    hero.background = { id: 'upper-class', qualities: [] }
    setStepRoll(hero, 'background', roll([5, 6]))
    expect(hero.background.roll).toEqual(roll([5, 6]))
    expect(hero.pendingRolls).toBeUndefined()
    expect(stepRoll(hero, 'background')).toEqual(roll([5, 6]))
  })

  it('takes the pending roll, tidying up when none are left', () => {
    const hero = createHero('guided')
    expect(takePendingRoll(hero, 'background')).toBeUndefined()
    setStepRoll(hero, 'background', roll([1, 2]))
    setStepRoll(hero, 'archetype', roll([3, 4]))
    expect(takePendingRoll(hero, 'background')).toEqual(roll([1, 2]))
    expect(hero.pendingRolls).toEqual({ archetype: roll([3, 4]) })
    expect(takePendingRoll(hero, 'background')).toBeUndefined()
    takePendingRoll(hero, 'archetype')
    expect(hero).not.toHaveProperty('pendingRolls')
  })

  it('keeps the second archetype’s roll pending, then on the second archetype once chosen', () => {
    const hero = createHero('guided')
    hero.archetype = { id: 'divided', traits: [], abilities: [], bonus: [], roll: roll([5, 6]) }
    setStepRoll(hero, 'secondaryArchetype', roll([1, 2]))
    expect(hero.pendingRolls).toEqual({ secondaryArchetype: roll([1, 2]) })
    expect(stepRoll(hero, 'secondaryArchetype')).toEqual(roll([1, 2]))
    // The outer archetype's roll is its own.
    expect(stepRoll(hero, 'archetype')).toEqual(roll([5, 6]))
    hero.archetype.secondary = { id: 'speedster', traits: [], abilities: [], bonus: [], roll: takePendingRoll(hero, 'secondaryArchetype')! }
    expect(hero.pendingRolls).toBeUndefined()
    setStepRoll(hero, 'secondaryArchetype', roll([3, 4]))
    expect(hero.archetype.secondary.roll).toEqual(roll([3, 4]))
  })
})
