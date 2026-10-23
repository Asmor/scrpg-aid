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

/** heroWithAbilities plus legal Red abilities, principles, Out ability, and Health: a complete, rules-legal hero. */
export function completeHero(): Hero {
  const hero = heroWithAbilities()
  hero.background!.principle = { id: 'business' }
  hero.archetype!.principle = { id: 'gearhead' }
  hero.redAbilities = [
    { source: 'red', name: 'Paragon Feat', category: 'power:athletic', uses: [P('agility')] },
    { source: 'red', name: 'Push Your Limits', category: 'power:athletic' },
  ]
  hero.personality!.outUses = [Q('fitness')]
  hero.health = { trait: P('agility'), mode: 'fixed' }
  return hero
}

/**
 * completeHero as a Form-Changer with legal forms. Base powers: Shapeshifting d12, Agility d10,
 * Fire d8, Awareness d8, Flight d6.
 */
export function formChangerHero(): Hero {
  const hero = completeHero()
  hero.archetype = {
    id: 'form-changer',
    traits: [A(P('shapeshifting'), 'd12'), A(P('flight'), 'd6')],
    abilities: [
      { source: 'archetype.fixedGreen', name: 'Change Forms', uses: [P('shapeshifting')] },
      { source: 'archetype.green', name: 'Form Recovery', uses: [P('shapeshifting')] },
    ],
    bonus: [],
    principle: { id: 'destiny' },
    forms: [
      {
        zone: 'green',
        name: 'Brute',
        powers: [A(P('strength'), 'd12'), A(P('agility'), 'd10'), A(P('fire'), 'd8'), A(P('awareness'), 'd8'), A(P('shapeshifting'), 'd6')],
        ability: { source: 'archetype.form', name: 'Strong Form', uses: [P('strength')] },
      },
      {
        zone: 'green',
        powers: [A(P('fire'), 'd12'), A(P('agility'), 'd10'), A(P('shapeshifting'), 'd8'), A(P('awareness'), 'd8'), A(P('flight'), 'd6')],
        ability: { source: 'archetype.form', name: 'Clever Form', uses: [P('fire')] },
      },
      {
        zone: 'yellow',
        powers: [A(P('agility'), 'd12'), A(P('speed'), 'd10'), A(P('fire'), 'd8'), A(P('awareness'), 'd8'), A(P('shapeshifting'), 'd6')],
        upgrades: [P('speed'), Q('fitness')],
        ability: { source: 'archetype.form', name: 'Agile Form', uses: [P('agility')] },
      },
    ],
  }
  return hero
}

/** completeHero as a Minion-Maker with six minion forms (from its d6 Creativity). */
export function minionMakerHero(): Hero {
  const hero = completeHero()
  hero.archetype = {
    id: 'minion-maker',
    traits: [A(P('robotics'), 'd12'), A(Q('creativity'), 'd6')],
    abilities: [],
    bonus: [],
    minionForms: { quality: Q('creativity'), forms: ['Autonomous', 'Burrowing', 'Floating', 'Pack', 'Explosive', 'Reinforced'] },
  }
  return hero
}
