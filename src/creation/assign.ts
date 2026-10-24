/**
 * Matching a step's dice to the hero's recorded assignments, for the editor. A step's
 * assignments don't record which die they came from (only sizes matter, p. 44), so each
 * die is paired with the first unused assignment of the same size, in order.
 */
import type { TraitRef } from '../rules/catalog'
import type { Die } from '../rules/types'
import type { TraitAssignment } from '../hero/model'

export interface DieRow {
  die: Die
  /** The assignment using this die, if any. */
  assignment?: TraitAssignment
}

/** One row per die, each with the assignment it's paired with. Assignments with no matching die are left out. */
export function dieRows(dice: readonly Die[], assignments: readonly TraitAssignment[]): DieRow[] {
  const used = new Set<number>()
  return dice.map((die) => {
    const index = assignments.findIndex((a, i) => !used.has(i) && a.die === die)
    if (index < 0) return { die }
    used.add(index)
    return { die, assignment: assignments[index] }
  })
}

/** Assignments whose die isn't one of the step's dice (e.g. after changing to an entry with other dice). */
export function strayAssignments(dice: readonly Die[], assignments: readonly TraitAssignment[]): TraitAssignment[] {
  const paired = new Set(dieRows(dice, assignments).flatMap((r) => (r.assignment ? [r.assignment] : [])))
  return assignments.filter((a) => !paired.has(a))
}

/**
 * Puts a trait on the die in row `index` (or clears that row with `trait` undefined),
 * keeping every other row's assignment. Stray assignments are dropped.
 */
export function assignRow(
  dice: readonly Die[],
  assignments: readonly TraitAssignment[],
  index: number,
  trait: TraitRef | undefined,
  upgrades = false,
): TraitAssignment[] {
  const rows = dieRows(dice, assignments)
  const row = rows[index]
  if (!row) return [...assignments]
  return rows.flatMap((r, i) => {
    if (i !== index) return r.assignment ? [r.assignment] : []
    if (!trait) return []
    return [upgrades ? { trait, die: row.die, upgrades: true as const } : { trait, die: row.die }]
  })
}
