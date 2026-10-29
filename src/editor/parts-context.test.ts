import { describe, expect, it } from 'vitest'
import { dividedHero, formChangerHero } from '../test/heroes'
import { switchArchetype, type PartFields } from './parts-context'

describe('switching archetypes', () => {
  const roll = { dice: ['d12' as const, 'd6' as const], results: [1, 2], manual: false }

  it('keeps the old archetype’s parts for the visit, and restores them when switching back', () => {
    const hero = dividedHero()
    hero.archetype!.secondary!.roll = roll
    const divided = structuredClone(hero.archetype!.divided)
    const memory = new Map<string, PartFields>()
    switchArchetype(hero, 'shadow', memory)
    expect(hero.archetype!.id).toBe('shadow')
    expect(hero.archetype!.secondary).toBeUndefined()
    expect(hero.archetype!.divided).toBeUndefined()
    // Everything else stays.
    expect(hero.archetype!.abilities.length).toBeGreaterThan(0)
    // The second archetype's roll stays pending (ruling 46).
    expect(hero.pendingRolls?.secondaryArchetype).toEqual(roll)
    expect(memory.has('divided')).toBe(true)

    switchArchetype(hero, 'divided', memory)
    expect(hero.archetype!.divided).toEqual(divided)
    expect(hero.archetype!.secondary?.roll).toEqual(roll)
    expect(hero.pendingRolls?.secondaryArchetype).toBeUndefined()
    expect(memory.size).toBe(0)
  })

  it('doesn’t carry Divided’s second archetype to Modular, which has nothing to restore', () => {
    const hero = dividedHero()
    hero.archetype!.secondary!.roll = roll
    const memory = new Map<string, PartFields>()
    switchArchetype(hero, 'modular', memory)
    expect(hero.archetype!.id).toBe('modular')
    expect(hero.archetype!.secondary).toBeUndefined()
    expect(hero.pendingRolls?.secondaryArchetype).toEqual(roll)
  })

  it('remembers forms too, and does nothing for the same archetype', () => {
    const hero = formChangerHero()
    const memory = new Map<string, PartFields>()
    switchArchetype(hero, hero.archetype!.id, memory)
    expect(memory.size).toBe(0)
    const forms = structuredClone(hero.archetype!.forms)
    switchArchetype(hero, 'speedster', memory)
    expect(hero.archetype!.forms).toBeUndefined()
    switchArchetype(hero, 'form-changer', memory)
    expect(hero.archetype!.forms).toEqual(forms)
  })
})
