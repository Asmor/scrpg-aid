/**
 * The dice pad's rules (docs/design/settings/spec.md, section 3). Which die rolled which number
 * doesn't matter, so the pad only asks for the numbers, and these check that the dice could show them.
 */
import { dieSize } from '../rules/dice'
import type { Die } from '../rules/types'

const ascending = (a: number, b: number) => a - b
const WORDS = ['No', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const word = (n: number) => WORDS[n] ?? String(n)
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The numbers on the pad. */
export const PAD_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

/** Whether these numbers can come from these dice: sorted, each is no more than its die. */
export function fitsDice(values: readonly number[], dice: readonly Die[]): boolean {
  if (values.length !== dice.length) return false
  const sizes = dice.map(dieSize).sort(ascending)
  return [...values].sort(ascending).every((v, i) => v <= sizes[i]!)
}

/** Why they can't: "Two numbers above 6, but only one die (d8) goes that high." Undefined when they can, or there aren't enough yet. */
export function whyNotFits(values: readonly number[], dice: readonly Die[]): string | undefined {
  if (values.length !== dice.length || fitsDice(values, dice)) return undefined
  const sizes = dice.map(dieSize).sort(ascending)
  const sorted = [...values].sort(ascending)
  const limit = sizes[sorted.findIndex((v, i) => v > sizes[i]!)]!
  const above = sorted.filter((v) => v > limit).length
  const high = dice.filter((d) => dieSize(d) > limit)
  const names = high.map((d) => d).join(' and ')
  const these = high.length === 0 ? 'no die goes that high' : `only ${word(high.length)} ${high.length === 1 ? 'die' : 'dice'} (${names}) ${high.length === 1 ? 'goes' : 'go'} that high`
  return `${capital(word(above))} ${above === 1 ? 'number' : 'numbers'} above ${limit}, but ${these}.`
}

/** Why a number is off: "No d12 in this roll". Undefined when some die can show it. */
export function keyOffReason(n: number, dice: readonly Die[]): string | undefined {
  if (dice.some((d) => dieSize(d) >= n)) return undefined
  const smallest = n <= 4 ? 'd4' : n <= 6 ? 'd6' : n <= 8 ? 'd8' : n <= 10 ? 'd10' : 'd12'
  return `No ${smallest} in this roll`
}

/** Adds a tapped number; when the slots are full, the oldest drops off. */
export const tapNumber = (values: readonly number[], n: number, slots: number): number[] => [...values, n].slice(-slots)

/**
 * Each die's value, in the dice's own order, matching largest value to largest die. Only for
 * numbers that fit: each is then shown with a die that could have rolled it.
 */
export function assignToDice(values: readonly number[], dice: readonly Die[]): number[] {
  const order = dice.map((d, i) => ({ size: dieSize(d), i })).sort((a, b) => a.size - b.size || a.i - b.i)
  const sorted = [...values].sort(ascending)
  const out = new Array<number>(dice.length)
  order.forEach(({ i }, rank) => {
    out[i] = sorted[rank]!
  })
  return out
}

/** "9, 6, 2": entered numbers as the log says them, largest first. */
export const enteredText = (values: readonly number[]) => [...values].sort((a, b) => b - a).join(', ')

/** The key that taps a number: 1 to 9, then 0, - and = for 10, 11 and 12. */
export function keyNumber(key: string): number | undefined {
  if (/^[1-9]$/.test(key)) return Number(key)
  return { '0': 10, '-': 11, '=': 12 }[key]
}
