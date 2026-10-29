/**
 * What the wizard shares with the Archetype step about a complex archetype's parts
 * (../hero/archetype-parts.ts): which part cards are open, and the parts of archetypes the
 * player switched away from during this visit, so switching back restores them.
 */
import { createContext, useContext } from 'react'
import type { ArchetypeChoice, Hero } from '../hero/model'
import { setStepRoll, takePendingRoll } from '../creation/rolls'
import type { ArchetypePart } from '../hero/archetype-parts'

/** The choices that belong to an archetype's own parts, dropped when switching to another archetype. */
export const PART_FIELDS = ['secondary', 'divided', 'modular', 'forms', 'minionForms'] as const

export type PartFields = Pick<ArchetypeChoice, (typeof PART_FIELDS)[number]>

export interface PartsState {
  parts: readonly ArchetypePart[]
  isOpen: (part: string) => boolean
  toggle: (part: string) => void
  /** Parts kept from archetypes chosen earlier in this visit, by archetype id. */
  memory: Map<string, PartFields>
}

const closed: PartsState = { parts: [], isOpen: () => true, toggle: () => {}, memory: new Map() }

export const PartsContext = createContext<PartsState>(closed)

export function useParts(): PartsState {
  return useContext(PartsContext)
}

/**
 * Switches the hero's archetype to another one, keeping everything but the old archetype's
 * own parts, which go into `memory`; the new one's remembered parts come back. A second
 * archetype's roll stays as the pending roll, so dropping it doesn't give a fresh roll and
 * re-roll (ruling 46). Changes `hero` in place.
 */
export function switchArchetype(hero: Hero, id: string, memory: Map<string, PartFields>): void {
  const choice = hero.archetype
  if (!choice || choice.id === id) return
  const kept: PartFields = {}
  for (const field of PART_FIELDS) {
    if (choice[field] !== undefined) Object.assign(kept, { [field]: choice[field] })
    delete choice[field]
  }
  if (Object.keys(kept).length) memory.set(choice.id, kept)
  if (kept.secondary?.roll) setStepRoll(hero, 'secondaryArchetype', kept.secondary.roll)
  const restored = memory.get(id)
  if (restored) {
    Object.assign(choice, restored)
    memory.delete(id)
    // The restored second archetype has its roll again.
    if (restored.secondary?.roll) takePendingRoll(hero, 'secondaryArchetype')
  }
  choice.id = id
}
