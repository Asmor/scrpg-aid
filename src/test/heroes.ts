/** Hero fixtures shared by the creation tests. */
import type { TraitRef } from '../rules/catalog'
import type { Die } from '../rules/types'
import { createHero, type Hero, type TraitAssignment } from '../hero/model'

export const P = (id: string): TraitRef => ({ kind: 'power', id })
export const Q = (id: string): TraitRef => ({ kind: 'quality', id })
export const A = (trait: TraitRef, die: Die, upgrades?: true): TraitAssignment => (upgrades ? { trait, die, upgrades } : { trait, die })

/**
 * A rules-legal hero through the personality step:
 * Upper Class (d10, d8 qualities) → Accident (d10, d8, d8 powers) → Speedster (d12, d6) → Lone Wolf.
 */
export function validHero(): Hero {
  const hero = createHero('constructed', { id: 'h' })
  hero.background = { id: 'upper-class', qualities: [A(Q('fitness'), 'd10'), A(Q('alertness'), 'd8')] }
  hero.powerSource = {
    id: 'accident',
    powers: [A(P('agility'), 'd10'), A(P('fire'), 'd8'), A(P('awareness'), 'd8')],
    abilities: [],
    bonus: [],
  }
  hero.archetype = { id: 'speedster', traits: [A(P('speed'), 'd12'), A(P('flight'), 'd6')], abilities: [], bonus: [] }
  hero.personality = { id: 'lone-wolf', bonus: [] }
  hero.traitNames['quality:roleplaying-quality'] = 'Old Money'
  return hero
}

/** validHero with legal power source and archetype abilities filled in. */
export function heroWithAbilities(): Hero {
  const hero = validHero()
  hero.powerSource!.abilities = [
    { source: 'powerSource.green', name: 'Immunity', blanks: { 'energy/element': 'Fire' } },
    { source: 'powerSource.yellow', name: 'Inflict', uses: [P('fire')] },
    { source: 'powerSource.yellow', name: 'Area Alteration', uses: [P('agility')], blanks: { 'Boost or Hinder': 'Boost' } },
  ]
  hero.archetype!.abilities = [
    { source: 'archetype.green', name: 'Always on the Move', uses: [P('speed')] },
    { source: 'archetype.green', name: 'Non-stop Assault', uses: [Q('alertness')] },
    { source: 'archetype.yellow', name: 'Speedy Analysis', uses: [P('flight')] },
  ]
  return hero
}
