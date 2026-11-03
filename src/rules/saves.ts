/**
 * Minion and lieutenant saves (docs/design/npcs/spec.md, section 1; Core Rules p. 16–17, 207;
 * ruling 58). When one takes damage it rolls its own die, with its own mods, as a save: a total
 * equal to or higher than the damage succeeds.
 *
 * |            | Save succeeds                         | Save fails                     |
 * | Minion     | Drops one die size (a d4 stays d4)    | KO'd                           |
 * | Lieutenant | Stays at its die size                 | Drops one die size (a d4 KO'd) |
 *
 * Lieutenants only: damage of at least double the die's size (16 or more against a d8) KOs it
 * outright, with no save. Pure.
 */
import { dieSize, stepDie } from './dice'
import type { Die } from './types'

export interface SaveResult {
  /** KO'd, drops a die size, or stays as it is. */
  outcome: 'ko' | 'shrink' | 'stay'
  /** The die after a shrink. */
  newDie?: Die
  /** KO'd outright by damage of at least double its die: no save was rolled. */
  noSave?: true
}

/** Whether the save's total beats the damage: equal or higher succeeds. */
export const saveSucceeds = (damage: number, roll: number) => roll >= damage

/** A minion's save against `damage`, with `roll` the save's total (its die plus its mods). */
export function minionSave(member: { die: Die }, damage: number, roll: number): SaveResult {
  if (!saveSucceeds(damage, roll)) return { outcome: 'ko' }
  if (member.die === 'd4') return { outcome: 'stay' }
  return { outcome: 'shrink', newDie: stepDie(member.die, -1) }
}

/** Whether damage KOs a lieutenant outright: at least double its die's size. */
export const outrightKo = (die: Die, damage: number) => damage >= 2 * dieSize(die)

/** A lieutenant's save against `damage`, with `roll` the save's total. `roll` is ignored when the damage KOs it outright. */
export function lieutenantSave(member: { die: Die }, damage: number, roll: number): SaveResult {
  if (outrightKo(member.die, damage)) return { outcome: 'ko', noSave: true }
  if (saveSucceeds(damage, roll)) return { outcome: 'stay' }
  if (member.die === 'd4') return { outcome: 'ko' }
  return { outcome: 'shrink', newDie: stepDie(member.die, -1) }
}

/** The save for a minion or a lieutenant. */
export const save = (kind: 'minions' | 'lieutenants', member: { die: Die }, damage: number, roll: number) => (kind === 'minions' ? minionSave(member, damage, roll) : lieutenantSave(member, damage, roll))
