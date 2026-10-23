import { describe, expect, it } from 'vitest'
import type { AbilitySource } from '../hero/model'
import { A, completeHero, P, Q } from '../test/heroes'
import { extraRedOptions, findAbility, findRedAbility } from './lookup'

const find = (hero: ReturnType<typeof completeHero>, source: AbilitySource, name: string, category?: string) =>
  findAbility(hero, category ? { source, name, category } : { source, name })?.name

describe('lookup', () => {
  it('finds power source and archetype abilities by source', () => {
    const hero = completeHero()
    expect(find(hero, 'powerSource.green', 'Immunity')).toBe('Immunity')
    expect(find(hero, 'powerSource.yellow', 'Inflict')).toBe('Inflict')
    expect(find(hero, 'powerSource.yellow', 'Immunity')).toBeUndefined()
    expect(find(hero, 'archetype.green', 'Fast Fingers')).toBe('Fast Fingers')
    expect(find(hero, 'archetype.yellow', 'Speedy Analysis')).toBe('Speedy Analysis')
    expect(find(hero, 'archetype.fixedGreen', 'Anything')).toBeUndefined()
  })

  it('finds fixed abilities and fromGreenList Yellow abilities', () => {
    const hero = completeHero()
    hero.archetype = { id: 'modular', traits: [], abilities: [], bonus: [] }
    expect(find(hero, 'archetype.fixedGreen', 'Switch')).toBe('Switch')
    expect(find(hero, 'archetype.fixedYellow', 'Quick Switch')).toBe('Quick Switch')
    expect(find(hero, 'archetype.fixedRed', 'Emergency Switch')).toBe('Emergency Switch')
    hero.archetype = { id: 'physical-powerhouse', traits: [], abilities: [], bonus: [] }
    expect(find(hero, 'archetype.yellow', 'Galvanize')).toBe('Galvanize')
  })

  it('finds nothing without a power source or archetype', () => {
    const hero = completeHero()
    hero.powerSource = null
    hero.archetype = null
    for (const source of ['powerSource.green', 'powerSource.yellow', 'archetype.green', 'archetype.yellow'] as const) {
      expect(find(hero, source, 'Inflict')).toBeUndefined()
    }
  })

  it('finds Red abilities, by category when names repeat', () => {
    const hero = completeHero()
    expect(find(hero, 'red', 'Push Your Limits')).toBe('Push Your Limits')
    expect(find(hero, 'retcon', 'Powerful Strike', 'power:materials')).toBe('Powerful Strike')
    expect(findRedAbility(hero, { source: 'red', name: 'Powerful Strike' })).toEqual({ found: false, reason: 'ambiguous' })
    expect(find(hero, 'red', 'Powerful Strike')).toBeUndefined()
    expect(findRedAbility(hero, { source: 'red', name: 'Book It', category: 'quality:physical' })).toMatchObject({
      found: true,
      category: { qualityCategory: 'physical' },
    })
  })

  it('offers Minion-Maker’s extra Red options only to a Minion-Maker', () => {
    const hero = completeHero()
    expect(extraRedOptions(hero)).toEqual([])
    hero.archetype = { id: 'minion-maker', traits: [A(P('robotics'), 'd12'), A(Q('creativity'), 'd6')], abilities: [], bonus: [] }
    expect(extraRedOptions(hero).map((a) => a.name)).toEqual(['Construction Focus', 'Swarm Combat', 'Sacrifice'])
    expect(findRedAbility(hero, { source: 'red', name: 'Sacrifice' })).toMatchObject({ found: true, category: undefined })
  })
})
