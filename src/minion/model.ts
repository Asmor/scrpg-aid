/**
 * The minion and lieutenant document (Phase 5): a single die, a short description, and a
 * few abilities the GM writes (Core Rules p. 204–207). A lieutenant is built the same way;
 * it's tougher in play (a successful save doesn't lower its die), so it's a checkbox.
 *
 * Abilities are the GM's own text, since the book gives guidelines rather than a list. An
 * ability can also carry a bonus (or penalty) to some actions, which the game aid offers
 * when the minion rolls; the text says when it applies.
 *
 * Versioning (./serialize.ts) follows the hero's rules.
 */
import { newId } from '../hero/model'
import { BASIC_ACTIONS } from '../rules/slots'
import type { BasicAction, Die } from '../rules/types'

/** What an ability's bonus can apply to: a basic action, or a save. */
export type MinionBonusTarget = BasicAction | 'save'
export const MINION_BONUS_TARGETS: readonly MinionBonusTarget[] = [...BASIC_ACTIONS, 'save']

export interface MinionAbility {
  name: string
  text: string
  /** A bonus (or, if negative, a penalty) the ability gives to some rolls. */
  bonus?: { amount: number; actions: MinionBonusTarget[] }
}

export interface Minion {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  /** Built as a lieutenant (p. 207). */
  lieutenant: boolean
  die: Die
  /** How many appear, in the GM's words (e.g. "1 per hero"). */
  count: string
  /** What it is and how it threatens the heroes. */
  description: string
  abilities: MinionAbility[]
  tactics: string
  notes?: string
}

/** Creates a blank d6 minion (d8 lieutenant). `now` and `id` are injectable for tests. */
export function createMinion(options: { id?: string; now?: Date; lieutenant?: boolean } = {}): Minion {
  const timestamp = (options.now ?? new Date()).toISOString()
  const lieutenant = options.lieutenant ?? false
  return {
    id: options.id ?? newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: '',
    lieutenant,
    // The Easy row of the scene difficulty chart (p. 186).
    die: lieutenant ? 'd8' : 'd6',
    count: '',
    description: '',
    abilities: [],
    tactics: '',
  }
}

/** The name to show for a minion in lists. */
export function minionDisplayName(minion: Pick<Minion, 'name' | 'lieutenant'>): string {
  return minion.name.trim() || (minion.lieutenant ? 'Unnamed lieutenant' : 'Unnamed minion')
}

/** "Lieutenant" or "Minion". */
export const minionKind = (minion: Pick<Minion, 'lieutenant'>) => (minion.lieutenant ? 'Lieutenant' : 'Minion')
