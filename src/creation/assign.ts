/**
 * Matching a step's dice to the hero's recorded assignments, for the editor. A step's
 * assignments don't record which die they came from (only sizes matter, p. 44), so each
 * die is paired with the first unused assignment of the same size, in order.
 */
import { traitKey, type TraitRef } from '../rules/catalog'
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

/** A die freed by an upgrade, and the trait it came from. */
export interface FreedDie {
  die: Die
  from: TraitRef
}

/**
 * The dice freed by upgrades in a step (p. 44): putting a bigger die on a trait from an
 * earlier step frees its old die, which joins the step's dice to assign elsewhere.
 * `earlier` is the hero's traits before the step.
 */
export function freedDice(assignments: readonly TraitAssignment[], earlier: readonly { trait: TraitRef; die: Die }[]): FreedDie[] {
  return assignments.flatMap((a) => {
    const old = a.upgrades && earlier.find((t) => traitKey(t.trait) === traitKey(a.trait))
    return old ? [{ die: old.die, from: old.trait }] : []
  })
}

/** The step's dice followed by the dice its upgrades free. */
export function stepDice(pool: readonly Die[], assignments: readonly TraitAssignment[], earlier: readonly { trait: TraitRef; die: Die }[]): Die[] {
  return [...pool, ...freedDice(assignments, earlier).map((f) => f.die)]
}

/**
 * assignRow over the step's dice and the dice its upgrades free. Undoing an upgrade takes
 * away the die it freed, so whatever was on that die is dropped too.
 */
export function assignStepRow(
  pool: readonly Die[],
  earlier: readonly { trait: TraitRef; die: Die }[],
  assignments: readonly TraitAssignment[],
  index: number,
  trait: TraitRef | undefined,
  upgrades = false,
): TraitAssignment[] {
  let next = assignRow(stepDice(pool, assignments, earlier), assignments, index, trait, upgrades)
  // Dropping one assignment may undo another upgrade, so repeat until nothing is left over.
  for (;;) {
    const stray = strayAssignments(stepDice(pool, next, earlier), next)
    if (stray.length === 0) return next
    next = next.filter((a) => !stray.includes(a))
  }
}
