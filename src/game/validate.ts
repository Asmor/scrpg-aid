/**
 * Structural checks for a game read from storage or an imported file, which are untrusted.
 * Shape only, like ../hero/validate.ts.
 */
import { arrayOf, boolean, integer, nonEmptyString, object, oneOf, string, type Check } from '../shape'
import { die, heroShape, playStateShape } from '../hero/validate'
import { villainPlayShape, villainShape } from '../villain/validate'

const zone = oneOf('green', 'yellow', 'red')
const actor = object({ kind: oneOf('hero', 'villain', 'group', 'environment'), id: nonEmptyString })
const mod = object({ id: nonEmptyString, label: string, value: integer, 'persistent?': oneOf(true), 'exclusive?': oneOf(true) })
const position: Check = (v, path) => integer(v, path) ?? ((v as number) < 0 ? `${path} should be at least 0` : undefined)

const gameShape = object({
  id: nonEmptyString,
  createdAt: string,
  updatedAt: string,
  tags: arrayOf(string),
  name: string,
  'solo?': object({ kind: oneOf('hero', 'villain'), sourceId: nonEmptyString }),
  scene: object({ name: string, tracker: arrayOf(zone), position }),
  'environment?': object({ id: nonEmptyString, name: string, hidden: boolean }),
  round: position,
  turn: object({ order: arrayOf(actor), acted: arrayOf(actor), 'current?': actor }),
  heroes: arrayOf(object({ id: nonEmptyString, sourceId: nonEmptyString, sheet: heroShape, play: playStateShape, 'player?': object({ clientId: nonEmptyString, name: string, 'since?': string }) })),
  villains: arrayOf(object({ id: nonEmptyString, sourceId: nonEmptyString, sheet: villainShape, play: villainPlayShape, hidden: boolean, playersSee: oneOf('name', 'status', 'health') })),
  groups: arrayOf(
    object({
      id: nonEmptyString,
      kind: oneOf('minions', 'lieutenants'),
      name: string,
      hidden: boolean,
      members: arrayOf(object({ id: nonEmptyString, n: integer, die, mods: arrayOf(mod) })),
    }),
  ),
  challenges: arrayOf(object({ id: nonEmptyString, name: string, hidden: boolean, steps: arrayOf(boolean) })),
  pendingSyncs: arrayOf(object({ heroId: nonEmptyString, sheet: heroShape, at: string })),
  notes: string,
  'code?': nonEmptyString,
  feed: arrayOf(object({ id: nonEmptyString, at: string, by: string, text: string, 'details?': arrayOf(string), 'gmOnly?': oneOf(true) })),
})

/** Returns a description of the first structural problem, or undefined if the game is well formed. */
export function gameProblem(value: unknown): string | undefined {
  const problem = gameShape(value, 'game')
  if (problem) return problem
  const game = value as { scene: { tracker: unknown[]; position: number } }
  if (game.scene.tracker.length === 0) return 'game.scene.tracker has no boxes'
  if (game.scene.position >= game.scene.tracker.length) return 'game.scene.position is past the last box'
  return undefined
}
