/**
 * A complete, rules-legal example hero, so a new player can see a finished sheet before
 * making their own. It's invented for this app, not taken from the book.
 * Upper Class → Accident → Speedster → Lone Wolf.
 */
import type { TraitRef } from '../rules/catalog'
import type { Die } from '../rules/types'
import { createHero, type Hero, type TraitAssignment } from './model'

const P = (id: string): TraitRef => ({ kind: 'power', id })
const Q = (id: string): TraitRef => ({ kind: 'quality', id })
const A = (trait: TraitRef, die: Die): TraitAssignment => ({ trait, die })

export function exampleHero(options: { id?: string; now?: Date } = {}): Hero {
  const hero = createHero('constructed', options)
  hero.details = {
    ...hero.details,
    name: 'Maya Reyes',
    alias: 'Afterimage',
    age: '24',
    build: 'Lean',
    costume: 'A heat-resistant running suit in orange and white',
  }
  hero.traitNames['quality:roleplaying-quality'] = 'Old Money'
  hero.background = { id: 'upper-class', qualities: [A(Q('fitness'), 'd10'), A(Q('alertness'), 'd8')], principle: { id: 'business' } }
  hero.powerSource = {
    id: 'accident',
    powers: [A(P('agility'), 'd10'), A(P('fire'), 'd8'), A(P('awareness'), 'd8')],
    abilities: [
      { source: 'powerSource.green', name: 'Immunity', blanks: { 'energy/element': 'Fire' } },
      { source: 'powerSource.yellow', name: 'Inflict', uses: [P('fire')] },
      { source: 'powerSource.yellow', name: 'Area Alteration', uses: [P('agility')], blanks: { 'Boost or Hinder': 'Boost' } },
    ],
    bonus: [],
  }
  hero.archetype = {
    id: 'speedster',
    traits: [A(P('speed'), 'd12'), A(P('flight'), 'd6')],
    abilities: [
      { source: 'archetype.green', name: 'Always on the Move', uses: [P('speed')] },
      { source: 'archetype.green', name: 'Non-stop Assault', uses: [Q('alertness')] },
      { source: 'archetype.yellow', name: 'Speedy Analysis', uses: [P('flight')] },
    ],
    bonus: [],
    principle: { id: 'gearhead' },
  }
  hero.personality = { id: 'lone-wolf', bonus: [], outUses: [Q('fitness')] }
  hero.redAbilities = [
    { source: 'red', name: 'Paragon Feat', category: 'power:athletic', uses: [P('agility')] },
    { source: 'red', name: 'Push Your Limits', category: 'power:athletic' },
  ]
  hero.health = { trait: P('agility'), mode: 'fixed' }
  return hero
}
