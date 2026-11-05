/**
 * Structural checks for a game read from storage or an imported file, which are untrusted.
 * Shape only, like ../hero/validate.ts.
 */
import { arrayOf, boolean, integer, nonEmptyString, object, oneOf, positiveInteger, string, type Check } from '../shape'
import { die, heroShape, playStateShape } from '../hero/validate'
import { villainPlayShape, villainShape } from '../villain/validate'
import { MAX_BOXES, type Game, type TrackerCounts } from './model'

const zone = oneOf('green', 'yellow', 'red')
const actor = object({ kind: oneOf('hero', 'villain', 'group', 'environment'), id: nonEmptyString })
const mod = object({ id: nonEmptyString, label: string, value: integer, 'persistent?': oneOf(true), 'exclusive?': oneOf(true) })
/** 'any', or a list of basic actions. */
export const groupActions: Check = (v, path) => (v === 'any' ? undefined : arrayOf(oneOf('attack', 'defend', 'boost', 'hinder', 'overcome'))(v, path))
const position: Check = (v, path) => integer(v, path) ?? ((v as number) < 0 ? `${path} should be at least 0` : undefined)

const environmentShape = object({
  id: nonEmptyString,
  'templateId?': nonEmptyString,
  name: string,
  hidden: boolean,
  'description?': string,
  'aspects?': arrayOf(object({ name: string, die })),
  'twists?': arrayOf(object({ id: nonEmptyString, zone, kind: oneOf('minor', 'major'), 'name?': string, text: string, 'used?': object({ round: position }) })),
  'attached?': arrayOf(object({ kind: oneOf('minion', 'lieutenant'), templateId: nonEmptyString, name: string, die, actions: groupActions, groupSize: integer })),
})
const villainInGame = object({ id: nonEmptyString, sourceId: nonEmptyString, sheet: villainShape, play: villainPlayShape, hidden: boolean, playersSee: oneOf('name', 'status', 'health'), 'statusOverride?': object({ 'die?': die, 'count?': integer }) })
const groupShape = object({
  id: nonEmptyString,
  'templateId?': nonEmptyString,
  kind: oneOf('minions', 'lieutenants'),
  name: string,
  hidden: boolean,
  owner: object({ kind: oneOf('gm', 'environment') }),
  actions: groupActions,
  'abilities?': arrayOf(object({ name: string, type: oneOf('A', 'R', 'I'), text: string, 'saveBonus?': positiveInteger })),
  members: arrayOf(object({ id: nonEmptyString, n: integer, die, mods: arrayOf(mod), acted: boolean, 'defenses?': arrayOf(object({ id: nonEmptyString, value: integer, from: string })) })),
})
const challengeShape = object({ id: nonEmptyString, 'templateId?': nonEmptyString, name: string, hidden: boolean, steps: arrayOf(boolean), 'labels?': arrayOf(string), 'description?': string, 'whenDone?': string, 'linkedVillainId?': nonEmptyString })
const opposition = object({ kind: oneOf('villain', 'group', 'challenge', 'environment'), id: nonEmptyString })
const sceneItem = object({
  ref: opposition,
  startHidden: boolean,
  source: object({ kind: oneOf('library', 'quick', 'tag', 'aside'), 'tag?': string, 'afterScene?': integer }),
})
const sceneShape = object({
  id: nonEmptyString,
  name: string,
  tracker: object({ green: integer, yellow: integer, red: integer }),
  position,
  'environmentId?': nonEmptyString,
  'environmentHidden?': boolean,
  opposition: arrayOf(sceneItem),
  notes: string,
  state: oneOf('planned', 'now', 'done'),
  'summary?': string,
})

const gameShape = object({
  id: nonEmptyString,
  createdAt: string,
  updatedAt: string,
  tags: arrayOf(string),
  name: string,
  'solo?': object({ kind: oneOf('hero', 'villain'), sourceId: nonEmptyString }),
  scenes: arrayOf(sceneShape),
  currentSceneId: nonEmptyString,
  aside: arrayOf(object({ ref: opposition, 'afterScene?': integer })),
  offTable: object({ villains: arrayOf(villainInGame), groups: arrayOf(groupShape), challenges: arrayOf(challengeShape), environments: arrayOf(environmentShape) }),
  'environment?': environmentShape,
  round: position,
  turn: object({ order: arrayOf(actor), acted: arrayOf(actor), 'current?': actor }),
  heroes: arrayOf(object({ id: nonEmptyString, sourceId: nonEmptyString, sheet: heroShape, play: playStateShape, 'player?': object({ clientId: nonEmptyString, name: string, 'since?': string }) })),
  villains: arrayOf(villainInGame),
  groups: arrayOf(groupShape),
  challenges: arrayOf(challengeShape),
  pendingSyncs: arrayOf(object({ heroId: nonEmptyString, sheet: heroShape, at: string })),
  'pendingHits?': arrayOf(object({ id: nonEmptyString, heroId: nonEmptyString, by: string, amount: integer, at: string, 'gmOnly?': oneOf(true) })),
  notes: string,
  'code?': nonEmptyString,
  feed: arrayOf(object({ id: nonEmptyString, at: string, by: string, text: string, 'details?': arrayOf(string), 'gmOnly?': oneOf(true), 'statusOf?': nonEmptyString })),
})

/** Each zone 0–MAX_BOXES, and at least one box. */
export function validCounts(counts: TrackerCounts): boolean {
  const all = [counts.green, counts.yellow, counts.red]
  return all.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_BOXES) && all.some((n) => n > 0)
}

/** Returns a description of the first structural problem, or undefined if the game is well formed. */
export function gameProblem(value: unknown): string | undefined {
  const problem = gameShape(value, 'game')
  if (problem) return problem
  const { scenes, currentSceneId } = value as Pick<Game, 'scenes' | 'currentSceneId'>
  const now = scenes.filter((s) => s.state === 'now')
  if (now.length !== 1 || now[0]!.id !== currentSceneId) return 'game.scenes should have exactly one current scene, game.currentSceneId'
  if (new Set(scenes.map((s) => s.id)).size !== scenes.length) return 'game.scenes has two scenes with one id'
  for (const scene of scenes) {
    if (!validCounts(scene.tracker)) return `scene ${scene.id} has box counts out of range`
    if (scene.position >= scene.tracker.green + scene.tracker.yellow + scene.tracker.red) return `scene ${scene.id}'s position is past the last box`
  }
  return undefined
}
