/** Villain fixtures shared by the villain tests (Phase 5). */
import { A, P, Q } from './heroes'
import { createVillain, type Villain } from '../villain/model'

/**
 * A rules-legal minor villain: an Adaptive Bruiser built for four heroes.
 * Powers: Robotics d10, Power Suit d8, Strength d8, Agility d6. Qualities: Technology d10,
 * Science d8, Fitness d8, plus the d8 roleplaying quality.
 */
export function adaptiveBruiser(): Villain {
  const v = createVillain({ id: 'v1', now: new Date('2026-10-27T12:00:00Z') })
  v.details.name = 'Ironclad'
  v.traitNames['quality:roleplaying-quality'] = 'Relentless'
  v.approach = {
    id: 'adaptive',
    traits: [A(P('robotics'), 'd10'), A(P('power-suit'), 'd8'), A(P('strength'), 'd8'), A(P('agility'), 'd6'), A(Q('technology'), 'd10'), A(Q('science'), 'd8'), A(Q('fitness'), 'd8')],
    abilities: [
      { source: 'approach', name: 'Adapt and Thrive', uses: [P('power-suit')] },
      { source: 'approach', name: 'Initiate Upgrade Procedure', uses: [P('robotics')] },
      { source: 'approach', name: 'Powerful Imitation' },
    ],
  }
  v.archetype = {
    id: 'bruiser',
    abilities: [
      { source: 'archetype', name: 'Lash Out', uses: [P('strength')] },
      { source: 'archetype', name: 'Grin and Bear It', uses: [Q('fitness')] },
    ],
  }
  return v
}

/**
 * The hero sheet design's test villain (scrpg-aid-designs/hero-sheet/villain-desktop.dc.html): a
 * major Bully Overlord built for four heroes, with Mook Squad and Master of Conquest.
 * Powers: Strength d10, Fire d8, Vitality d8. Qualities: Criminal Underworld Info d8,
 * Imposing d8, plus the d8 roleplaying quality.
 */
export function bullyOverlord(): Villain {
  const v = createVillain({ id: 'v2', now: new Date('2026-10-29T12:00:00Z') })
  v.details.name = 'Test Villain'
  v.details.alias = 'Foreman'
  v.details.concept = 'A crime boss who runs a crew of enforcers.'
  v.approach = {
    id: 'bully',
    traits: [A(P('strength'), 'd10'), A(P('fire'), 'd8'), A(P('vitality'), 'd8'), A(Q('criminal-underworld-info'), 'd8'), A(Q('imposing'), 'd8')],
    abilities: [
      { source: 'approach', name: 'Bust Their Heads', uses: [P('strength')] },
      { source: 'approach', name: 'Thick' },
    ],
  }
  v.archetype = {
    id: 'overlord',
    abilities: [
      { source: 'archetype', name: 'By My Command', uses: [Q('criminal-underworld-info')] },
      { source: 'archetype', name: '“Look Out, Boss!”' },
      { source: 'archetype', name: 'Form Up', uses: [P('strength')] },
    ],
  }
  v.upgrades = [{ id: 'mook-squad', abilities: [{ source: 'upgrade', name: 'Alert!' }] }]
  v.mastery = { source: 'mastery', name: 'Master of Conquest' }
  return v
}
