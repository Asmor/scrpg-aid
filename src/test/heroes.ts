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

/**
 * completeHero as a "Divided Speedster": the Speedster choices move to `secondary`, Divided
 * takes the Controllable transition, Divided Psyche, and a Responsibility principle.
 */
export function dividedHero(): Hero {
  const hero = completeHero()
  const speedster = hero.archetype!
  delete speedster.principle
  hero.archetype = {
    id: 'divided',
    traits: [],
    abilities: [{ source: 'archetype.green', name: 'Divided Psyche' }],
    bonus: [],
    principle: { id: 'detective' },
    secondary: speedster,
    divided: { transitionMethod: 'controllable', transitionAbility: { source: 'archetype.transition', name: 'Transform' } },
  }
  return hero
}

/**
 * completeHero as a "Modular Speedster" with legal modes. Default-mode powers: Speed d12,
 * Agility d10, Fire d8, Awareness d8, Flight d6 (five, so no filler powers are needed).
 */
export function modularHero(): Hero {
  const hero = completeHero()
  const speedster = hero.archetype!
  const principle = speedster.principle
  delete speedster.principle
  speedster.abilities = []
  hero.archetype = {
    id: 'modular',
    traits: [],
    abilities: [{ source: 'archetype.fixedGreen', name: 'Switch', uses: [Q('fitness')] }],
    bonus: [],
    principle,
    secondary: speedster,
    modular: {
      modes: [
        {
          id: 'improvement',
          powers: [A(P('speed'), 'd12'), A(P('agility'), 'd10'), A(P('fire'), 'd10'), A(P('awareness'), 'd10')],
          ability: { source: 'archetype.mode', name: 'Improvement', uses: [P('fire')] },
        },
        {
          id: 'analysis',
          powers: [A(P('agility'), 'd10'), A(P('fire'), 'd8'), A(P('awareness'), 'd10'), A(P('flight'), 'd8')],
          ability: { source: 'archetype.mode', name: 'Analysis', uses: [P('awareness')] },
        },
        {
          id: 'regeneration',
          name: 'Patch Job',
          powers: [A(P('speed'), 'd12'), A(P('flight'), 'd10')],
          ability: { source: 'archetype.mode', name: 'Regeneration', uses: [P('flight')] },
        },
        {
          // Raising Speed past d12 leaves it at d12 (the user's ruling).
          id: 'hunter-killer',
          powers: [A(P('speed'), 'd12'), A(P('agility'), 'd12')],
          ability: { source: 'archetype.mode', name: 'Hunter/Killer', uses: [P('agility')] },
        },
      ],
      powerless: [A(P('fire'), 'd6'), A(P('awareness'), 'd10')],
    },
  }
  return hero
}

/**
 * The hero sheet design's Modular test hero (scrpg-aid-designs/hero-sheet/forms-and-modes.dc.html),
 * a "Modular Blaster". Default-mode powers: Cold d12, Fire d10, Agility d8, Speed d8, Cosmic d6.
 * Its modes copy the mockup's dice, which don't all follow the mode rules (Bombardment raises
 * three powers to d12), so the checks flag them; the sheet shows them as they are.
 */
export function modularBlasterHero(): Hero {
  const hero = modularHero()
  hero.details.name = 'Modular Blaster'
  hero.powerSource!.powers = [A(P('cold'), 'd12'), A(P('fire'), 'd10'), A(P('cosmic'), 'd6')]
  hero.powerSource!.abilities = []
  const secondary = hero.archetype!.secondary!
  secondary.id = 'blaster'
  secondary.traits = [A(P('agility'), 'd8'), A(P('speed'), 'd8')]
  const basic = (name: string) => ({ source: 'archetype.mode' as const, name, uses: [P('fire')] })
  hero.archetype!.modular = {
    modes: [
      { id: 'debilitator', powers: [A(P('fire'), 'd10'), A(P('agility'), 'd8'), A(P('speed'), 'd8'), A(P('cold'), 'd12')], ability: basic('Debilitator') },
      { id: 'analysis', powers: [A(P('fire'), 'd10'), A(P('agility'), 'd8'), A(P('speed'), 'd8'), A(P('cold'), 'd12')], ability: basic('Analysis') },
      { id: 'bombardment', powers: [A(P('fire'), 'd12'), A(P('agility'), 'd12'), A(P('speed'), 'd12')], ability: basic('Bombardment') },
      { id: 'destroyer', powers: [A(P('fire'), 'd10'), A(P('agility'), 'd8'), A(P('speed'), 'd8')], ability: basic('Destroyer') },
    ],
  }
  return hero
}

/**
 * The hero sheet design's Divided test hero: Split Form with a Controllable transition, and a
 * second personality. Both forms: Speed d8, Strength d8, Fitness d10, Persuasion d8 and the
 * roleplaying quality (Night Shift Nurse d8). Civilian form (Natural Leader): Acrobatics d6.
 * Heroic form (Naive): Vitality d12, Agility d10, so Fast Fingers (using Agility) is heroic only.
 */
export function dividedSplitHero(): Hero {
  const hero = createHero('constructed', { id: 'divided-split' })
  hero.details.name = 'Night Nurse'
  hero.background = { id: 'medical', qualities: [A(Q('fitness'), 'd10'), A(Q('persuasion'), 'd8')] }
  hero.powerSource = { id: 'accident', powers: [A(P('vitality'), 'd12'), A(P('agility'), 'd10'), A(P('strength'), 'd8')], abilities: [], bonus: [] }
  hero.archetype = {
    id: 'divided',
    traits: [],
    abilities: [{ source: 'archetype.green', name: 'Split Form' }],
    bonus: [],
    secondary: {
      id: 'speedster',
      traits: [A(P('speed'), 'd8'), A(Q('acrobatics'), 'd6')],
      abilities: [{ source: 'archetype.green', name: 'Fast Fingers', uses: [P('agility')] }],
      bonus: [],
    },
    divided: {
      transitionMethod: 'controllable',
      transitionAbility: { source: 'archetype.transition', name: 'Transform' },
      heroicPersonality: { id: 'naive', bonus: [] },
      split: {
        always: [P('speed'), P('strength'), Q('fitness'), Q('persuasion'), Q('roleplaying-quality')],
        civilian: [Q('acrobatics')],
        heroic: [P('vitality'), P('agility')],
      },
    },
  }
  hero.personality = { id: 'natural-leader', bonus: [] }
  hero.traitNames['quality:roleplaying-quality'] = 'Night Shift Nurse'
  return hero
}
