import type { Die, Zone } from './types'

/** The status zones in order of severity (Out is handled separately). */
export const ZONES: readonly Zone[] = ['green', 'yellow', 'red']

/** All die sizes, smallest first. */
export const DICE: readonly Die[] = ['d4', 'd6', 'd8', 'd10', 'd12']

/** The number of faces, which is also the die's maximum value. */
export function dieSize(die: Die): number {
  return Number(die.slice(1))
}

export function isDie(value: unknown): value is Die {
  return typeof value === 'string' && (DICE as readonly string[]).includes(value)
}

/** Negative if a is smaller than b, positive if larger, 0 if the same size. */
export function compareDice(a: Die, b: Die): number {
  return dieSize(a) - dieSize(b)
}

/**
 * Moves a die up (positive steps) or down (negative steps) by size,
 * stopping at `min`/`max` (default d4..d12).
 */
export function stepDie(die: Die, steps: number, bounds: { min?: Die; max?: Die } = {}): Die {
  if (!Number.isInteger(steps)) throw new RangeError(`steps must be an integer, got ${steps}`)
  const lo = DICE.indexOf(bounds.min ?? 'd4')
  const hi = DICE.indexOf(bounds.max ?? 'd12')
  if (lo > hi) throw new RangeError(`min ${bounds.min} is larger than max ${bounds.max}`)
  const index = Math.min(hi, Math.max(lo, DICE.indexOf(die) + steps))
  return DICE[index]!
}

/** Sorts dice smallest first without changing the input. */
export function sortDice(dice: readonly Die[]): Die[] {
  return [...dice].sort(compareDice)
}
