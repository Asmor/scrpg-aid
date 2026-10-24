/**
 * Where a table step's Guided roll is kept. A roll made before choosing is saved in
 * hero.pendingRolls, so it survives leaving the step; once an entry is chosen the roll
 * lives on the choice.
 */
import type { Hero, RollRecord, TableStep } from '../hero/model'

/** The step's current roll: the choice's, or a pending one if nothing is chosen yet. */
export function stepRoll(hero: Hero, step: TableStep): RollRecord | undefined {
  return hero[step]?.roll ?? hero.pendingRolls?.[step]
}

/** Records a roll (or reroll) for the step, on the choice if there is one. Changes `hero` in place. */
export function setStepRoll(hero: Hero, step: TableStep, roll: RollRecord): void {
  const choice = hero[step]
  if (choice) choice.roll = roll
  else hero.pendingRolls = { ...hero.pendingRolls, [step]: roll }
}

/**
 * Takes the step's pending roll for a new choice, removing it from hero.pendingRolls.
 * Changes `hero` in place.
 */
export function takePendingRoll(hero: Hero, step: TableStep): RollRecord | undefined {
  const roll = hero.pendingRolls?.[step]
  if (!hero.pendingRolls || !roll) return undefined
  delete hero.pendingRolls[step]
  if (Object.keys(hero.pendingRolls).length === 0) delete hero.pendingRolls
  return roll
}
