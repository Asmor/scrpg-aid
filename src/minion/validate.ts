/**
 * Structural checks for a minion read from storage or an imported file, which are untrusted.
 * Shape only, like ../hero/validate.ts: rule problems are warnings (a later stage).
 */
import { arrayOf, boolean, integer, object, oneOf, nonEmptyString, string } from '../shape'
import { die } from '../hero/validate'
import { MINION_BONUS_TARGETS } from './model'

const minionShape = object({
  id: nonEmptyString,
  createdAt: string,
  updatedAt: string,
  name: string,
  lieutenant: boolean,
  die,
  count: string,
  description: string,
  abilities: arrayOf(object({ name: string, text: string, 'bonus?': object({ amount: integer, actions: arrayOf(oneOf(...MINION_BONUS_TARGETS)) }) })),
  tactics: string,
  'notes?': string,
})

/** Returns a description of the first structural problem, or undefined if the minion is well formed. */
export function minionProblem(value: unknown): string | undefined {
  return minionShape(value, 'minion')
}
