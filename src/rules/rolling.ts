/**
 * Guided creation: rolling a step's dice and finding the table entries they reach.
 * After rolling, the player may pick the entry matching any single die, or the sum of
 * any two dice (data/rules/hero-creation.md, "Choosing from a table by rolling").
 */
import { dieSize } from './dice'
import type { Die } from './types'

/** Dice rolled to pick a table entry, in app or typed in by the player. */
export interface RollRecord {
  dice: Die[]
  results: number[]
  manual: boolean
  /** Each step allows one reroll (see canReroll). */
  rerolled?: boolean
}

/** Returns a number in [0, 1). Injectable so tests can roll known values. */
export type Random = () => number

export function rollDie(die: Die, random: Random = Math.random): number {
  return Math.floor(random() * dieSize(die)) + 1
}

export function rollDice(dice: readonly Die[], random: Random = Math.random): number[] {
  return dice.map((d) => rollDie(d, random))
}

/** How a table entry was reached: one die (by index), or the sum of two. */
export type RollSource = { die: number } | { sum: [number, number] }

/** Every value the results can reach, with each way of reaching it. */
export function reachableValues(results: readonly number[]): Map<number, RollSource[]> {
  const reach = new Map<number, RollSource[]>()
  const add = (value: number, source: RollSource) => reach.set(value, [...(reach.get(value) ?? []), source])
  results.forEach((r, i) => add(r, { die: i }))
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) add(results[i]! + results[j]!, { sum: [i, j] })
  }
  return reach
}

export interface TableOption<T> {
  entry: T
  sources: RollSource[]
}

/** The entries of a roll table (backgrounds, power sources, ...) the results allow, in table order. */
export function tableOptions<T extends { roll: number }>(table: readonly T[], results: readonly number[]): TableOption<T>[] {
  const reach = reachableValues(results)
  return [...table]
    .sort((a, b) => a.roll - b.roll)
    .flatMap((entry) => {
      const sources = reach.get(entry.roll)
      return sources ? [{ entry, sources }] : []
    })
}

/**
 * Checks typed-in results against the dice. A d10's 0 face counts as 10, so 0 is
 * accepted for a d10 and normalized. Returns the normalized results, or an error.
 */
export function checkManualResults(
  dice: readonly Die[],
  results: readonly number[],
): { ok: true; results: number[] } | { ok: false; error: string } {
  if (results.length !== dice.length) {
    return { ok: false, error: `Enter ${dice.length} result${dice.length === 1 ? '' : 's'}, one per die.` }
  }
  const normalized: number[] = []
  for (const [i, die] of dice.entries()) {
    let value = results[i]!
    if (die === 'd10' && value === 0) value = 10
    if (!Number.isInteger(value) || value < 1 || value > dieSize(die)) {
      return { ok: false, error: `A ${die} can't roll ${results[i]}.` }
    }
    normalized.push(value)
  }
  return { ok: true, results: normalized }
}

/** Records a roll. Results must already be checked (rollDice, or checkManualResults for typed-in rolls). */
export function newRoll(dice: readonly Die[], results: readonly number[], manual: boolean): RollRecord {
  return { dice: [...dice], results: [...results], manual }
}

/**
 * Whether a roll was made on these dice. A step's dice can depend on an earlier choice (the
 * power source rolls the background's dice), so changing that choice can leave a roll made
 * on the old dice: it no longer says which entries can be chosen.
 */
export function rolledOn(roll: RollRecord, dice: readonly Die[]): boolean {
  return roll.dice.length === dice.length && roll.dice.every((d, i) => d === dice[i])
}

/**
 * A step allows one reroll if nothing fits (data/rules/hero-creation.md, "Methods", p. 46).
 * The user ruled that "nothing fits" means the player doesn't like the options, so the
 * reroll is available whether or not the roll reached any entry.
 */
export function canReroll(roll: RollRecord | undefined): boolean {
  return roll !== undefined && !roll.rerolled
}

/**
 * Replaces a roll with a reroll of the same dice, marking the step's reroll as used.
 * Results must already be checked, as for newRoll. Throws if the reroll was already used.
 */
export function reroll(roll: RollRecord, results: readonly number[], manual: boolean): RollRecord {
  if (!canReroll(roll)) throw new Error('This step has already used its reroll.')
  return { dice: [...roll.dice], results: [...results], manual, rerolled: true }
}
