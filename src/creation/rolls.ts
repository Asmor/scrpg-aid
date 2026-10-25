/**
 * Where a table step's Guided roll is kept. A roll made before choosing is saved in
 * hero.pendingRolls, so it survives leaving the step; once an entry is chosen the roll
 * lives on the choice. Divided and Modular's second archetype has a roll of its own,
 * kept on hero.archetype.secondary (rulings 45–47).
 */
import type { Hero, RollRecord, RollSlot } from '../hero/model'

function choiceFor(hero: Hero, slot: RollSlot): { roll?: RollRecord } | null | undefined {
  return slot === 'secondaryArchetype' ? hero.archetype?.secondary : hero[slot]
}

/** The step's current roll: the choice's, or a pending one if nothing is chosen yet. */
export function stepRoll(hero: Hero, slot: RollSlot): RollRecord | undefined {
  return choiceFor(hero, slot)?.roll ?? hero.pendingRolls?.[slot]
}

/** Records a roll (or reroll) for the step, on the choice if there is one. Changes `hero` in place. */
export function setStepRoll(hero: Hero, slot: RollSlot, roll: RollRecord): void {
  const choice = choiceFor(hero, slot)
  if (choice) choice.roll = roll
  else hero.pendingRolls = { ...hero.pendingRolls, [slot]: roll }
}

/**
 * Takes the step's pending roll for a new choice, removing it from hero.pendingRolls.
 * Changes `hero` in place.
 */
export function takePendingRoll(hero: Hero, slot: RollSlot): RollRecord | undefined {
  const roll = hero.pendingRolls?.[slot]
  if (!hero.pendingRolls || !roll) return undefined
  delete hero.pendingRolls[slot]
  if (Object.keys(hero.pendingRolls).length === 0) delete hero.pendingRolls
  return roll
}
