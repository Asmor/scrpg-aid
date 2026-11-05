/**
 * The game table's messages (docs/design/game-table/spec.md, section 10), version 8. The GM's
 * device hosts a game; players and observers say hello with their role, players send each
 * action as its own message and get a result, and the GM's device sends each peer its
 * projection of the game (../game/project.ts) after every change.
 *
 * Messages come from other people's devices, so they're untrusted: every reader here checks the
 * shape and the limits before anything acts on them, and returns undefined for anything else.
 */
import type { HeroAction } from '../game/actions'
import { VIEW_HISTORY, type TableView } from '../game/project'
import type { Hero } from '../hero/model'
import { normalizeRoomCode } from './code'
import { die, heroShape, playStateShape } from '../hero/validate'
import { groupActions } from '../game/validate'
import { arrayOf, boolean, integer, isRecord, nonEmptyString, object, oneOf, type Check } from '../shape'

export const PROTOCOL_VERSION = 9

/** The most observers a game takes (section 10). */
export const OBSERVER_LIMIT = 20
/** The most players a game takes. */
export const PLAYER_LIMIT = 20

export const MAX_TEXT = 2000
export const MAX_NAME = 200
export const MAX_ID = 100
export const MAX_LIST = 200
/** The largest message read, as JSON: sheets inside hellos and sync requests have no limits of their own. */
export const MAX_MESSAGE = 1_000_000
/** The most log lines a projection carries. */
export const VIEW_FEED = 200

export type ClientMessage =
  /** `gameId` when reconnecting a saved game: the GM checks the code and the game match. */
  | { v: 9; type: 'hello'; role: 'player'; clientId: string; name: string; heroSourceId: string; sheet: Hero; gameId?: string }
  | { v: 9; type: 'hello'; role: 'observer'; clientId: string; screenName: string }
  | { v: 9; type: 'action'; id: string; heroId: string; action: HeroAction; basedOn: number }
  | { v: 9; type: 'syncRequest'; heroId: string; sheet: Hero }
  | { v: 9; type: 'syncCancel'; heroId: string }
  /** What a player did about a back issue, for the GM's list (docs/design/issues/spec.md, section 3). Only ever information. */
  | { v: 9; type: 'issueAck'; issueId: string; heroId: string; status: 'added' | 'later'; count?: number }

/** Who a state message is for: a player's own hero in the game, and when it first joined. */
export interface YouAre {
  heroId: string
  since: string
}

export type HostMessage =
  | { v: 9; type: 'state'; room: string; version: number; table: TableView; gm: string; you?: YouAre }
  /** `notes`: lines for the player as toasts (a save against their Attack). */
  | { v: 9; type: 'result'; id: string; ok: true; notes?: string[] }
  | { v: 9; type: 'result'; id: string; ok: false; reason: string }
  | { v: 9; type: 'syncResult'; heroId: string; approved: boolean; adjustments: string[] }
  | { v: 9; type: 'refused'; reason: RefusedReason }
  /** The GM got a new code for the game: kept peers move to it (docs/design/game-table/game-table-spec-addendum-game-codes.md). */
  | { v: 9; type: 'codeChanged'; code: string }
  /** The GM removed this peer from the game (Remove, or left behind by a new code). */
  | { v: 9; type: 'removed'; reason?: string }
  /** The GM is about to start the next issue, and this player's hero has hero points left. */
  | { v: 9; type: 'spendReminder' }

/**
 * Why the GM's device won't take a peer: another version of the app, a full game, the hero is
 * being played on another device, the GM removed them, or the code now belongs to another game.
 */
export type RefusedReason = 'version' | 'full' | 'taken' | 'removed' | 'wrongGame'

// ---- Checks ----

const text =
  (max = MAX_TEXT): Check =>
  (v, path) =>
    typeof v !== 'string' ? `${path} should be text` : v.length > max ? `${path} is too long` : undefined
const id: Check = (v, path) => nonEmptyString(v, path) ?? text(MAX_ID)(v, path)
const list =
  (item: Check, max = MAX_LIST): Check =>
  (v, path) =>
    arrayOf(item)(v, path) ?? ((v as unknown[]).length > max ? `${path} is too long` : undefined)
const range =
  (min: number, max: number): Check =>
  (v, path) =>
    integer(v, path) ?? ((v as number) < min || (v as number) > max ? `${path} is out of range` : undefined)
const optionalNumber: Check = (v, path) => (v === undefined ? undefined : range(-1000, 1000)(v, path))

const modValue: Check = (v, path) => range(-12, 12)(v, path) ?? (v === 0 ? `${path} can't be 0` : undefined)
const modInput = object({ label: text(MAX_NAME), value: modValue, 'persistent?': oneOf(true), 'exclusive?': oneOf(true) })
const mod = object({ id, label: text(MAX_NAME), value: modValue, 'persistent?': oneOf(true), 'exclusive?': oneOf(true), 'source?': oneOf('heroPoint') })
const basicAction = oneOf('attack', 'defend', 'boost', 'hinder', 'overcome')
const action = oneOf('attack', 'defend', 'boost', 'hinder', 'overcome', 'recover')
const effectUse = oneOf('max', 'mid', 'min', 'max+mid', 'max+min', 'mid+min', 'max+mid+min', 'single', 'damage', 'other')
const actor = object({ kind: oneOf('hero', 'villain', 'group', 'environment'), id })
const newMinion = object({ name: text(MAX_NAME), die, action: oneOf('attack', 'defend', 'boost', 'hinder', 'overcome', 'any'), 'form?': text(MAX_NAME), 'needsForm?': oneOf(true) })
const target: Check = (v, path) => {
  if (!isRecord(v)) return `${path} should be an object`
  if (v.kind === 'member') return object({ kind: oneOf('member'), groupId: id, memberId: id })(v, path)
  if (v.kind === 'heroMinion') return object({ kind: oneOf('heroMinion'), heroId: id, minionId: id })(v, path)
  return object({ kind: oneOf('hero', 'villain'), id })(v, path)
}
const rollRecord = object({
  title: text(MAX_NAME),
  rolled: list(object({ label: text(MAX_NAME), die, value: range(1, 12) }), 10),
  results: list(object({ action, use: effectUse, base: optionalNumber, mods: list(mod, 20), total: optionalNumber }), 10),
  manual: boolean,
  'made?': list(object({ label: text(MAX_NAME), base: range(0, 100), mods: list(mod, 20), total: range(-100, 100), die }), 5),
})
const rollAction = object({
  subject: (v, path) => (isRecord(v) && v.kind === 'ability' ? object({ kind: oneOf('ability'), name: text(MAX_NAME) })(v, path) : object({ kind: oneOf('basic'), 'action?': basicAction })(v, path)),
  record: rollRecord,
  'formChoice?': text(MAX_ID),
  selfMods: list(modInput, 20),
  minionMods: list(object({ minionId: id, mod: modInput }), 20),
  others: list(object({ to: target, mod: modInput }), 20),
  made: list(newMinion, 5),
  attacks: list(object({ result: range(0, 9), to: target }), 10),
  defends: list(object({ result: range(0, 9), 'to?': target }), 10),
})

const ACTIONS: Record<HeroAction['kind'], Check> = {
  health: object({ by: range(-1000, 1000) }),
  setHealth: object({ value: range(0, 1000) }),
  addMod: object({ mod: modInput }),
  removeMod: object({ modId: id }),
  addTwist: object({ twist: object({ kind: oneOf('minor', 'major'), text: text() }) }),
  removeTwist: object({ twistId: id }),
  buyHeroPointBonus: object({ size: range(1, 5) }),
  returnHeroPointBonus: object({ buyId: id }),
  reaction: object({ used: boolean }),
  form: object({ key: text(MAX_ID) }),
  dividedForm: object({ form: oneOf('civilian', 'heroic') }),
  roll: object({ roll: rollAction }),
  makeMinion: object({ minion: newMinion }),
  removeMinion: object({ minionId: id }),
  shrinkMinion: object({ minionId: id }),
  minionMod: object({ minionId: id, mod: modInput }),
  removeMinionMod: object({ minionId: id, modId: id }),
  chooseDefense: object({ hitId: id, defenseId: id }),
  minionRoll: object({ minionId: id, roll: object({ action: basicAction, value: range(1, 12), mods: list(mod, 20) }) }),
  minionForm: object({ minionId: id, form: text(MAX_NAME) }),
  handOff: object({ to: actor }),
  startRound: object({ first: actor }),
  overcomeChallenge: object({ challengeId: id, total: range(-100, 100), 'trait?': text(MAX_NAME) }),
}

const heroAction: Check = (v, path) => {
  if (!isRecord(v) || typeof v.kind !== 'string' || !Object.hasOwn(ACTIONS, v.kind)) return `${path} isn't an action`
  return ACTIONS[v.kind as HeroAction['kind']](v, path)
}

const CLIENT: Record<string, Check> = {
  hello: (v, path) =>
    isRecord(v) && v.role === 'observer'
      ? object({ role: oneOf('observer'), clientId: id, screenName: text(MAX_NAME) })(v, path)
      : object({ role: oneOf('player'), clientId: id, name: text(MAX_NAME), heroSourceId: id, sheet: heroShape, 'gameId?': id })(v, path),
  action: object({ id, heroId: id, action: heroAction, basedOn: integer }),
  syncRequest: object({ heroId: id, sheet: heroShape }),
  syncCancel: object({ heroId: id }),
  issueAck: object({ issueId: id, heroId: id, status: oneOf('added', 'later'), 'count?': range(0, 6) }),
}

/** Whether a message is over MAX_MESSAGE as JSON (or can't be measured). */
function tooBig(value: unknown): boolean {
  try {
    return JSON.stringify(value).length > MAX_MESSAGE
  } catch {
    return true
  }
}

/** The message's version, if it has one: a peer on another version is told to update. */
export function messageVersion(value: unknown): number | undefined {
  return isRecord(value) && typeof value.v === 'number' ? value.v : undefined
}

function read<T>(value: unknown, checks: Record<string, Check>): T | undefined {
  if (!isRecord(value) || value.v !== PROTOCOL_VERSION || typeof value.type !== 'string' || !Object.hasOwn(checks, value.type)) return undefined
  if (tooBig(value)) return undefined
  return checks[value.type]!(value, 'message') ? undefined : (value as T)
}

/** A message from a player or observer, or undefined if it's malformed or from another version. */
export function readClientMessage(value: unknown): ClientMessage | undefined {
  return read<ClientMessage>(value, CLIENT)
}

const zone = oneOf('green', 'yellow', 'red')
const playZone = oneOf('green', 'yellow', 'red', 'out')
const position: Check = (v, path) => range(0, 1000)(v, path)
const twist = object({ id, kind: oneOf('minor', 'major'), text: text() })
const feedEntry = object({ id, at: text(40), by: text(MAX_NAME), text: text(), 'details?': list(text(), 50), 'gmOnly?': oneOf(true), 'forHero?': id })

const issueView = object({
  id,
  number: range(1, 1000),
  'title?': text(MAX_NAME),
  'summary?': text(MAX_TEXT),
  state: oneOf('now', 'finished'),
  'finishedAt?': text(40),
  'offeredTo?': list(object({ heroId: id, sourceId: id, name: text(MAX_NAME) }), 30),
  sceneCount: range(0, 1000),
})

const tableViewShape = object({
  id,
  name: text(MAX_NAME),
  issues: list(issueView, 1000),
  'currentIssueId?': id,
  scene: object({ name: text(MAX_NAME), tracker: list(zone, 30), position, number: range(1, 1000) }),
  'environment?': object({ id, name: text(MAX_NAME), hidden: boolean, 'description?': text(MAX_TEXT) }),
  round: position,
  heroPoints: position,
  turn: object({ order: list(actor, 100), acted: list(actor, 100), 'current?': actor }),
  heroes: list(object({ id, sourceId: id, sheet: heroShape, play: (v, path) => playStateShape(v, path) ?? object({ history: list(() => undefined, VIEW_HISTORY) })(v, path), 'player?': object({ name: text(MAX_NAME), 'since?': text(40) }) }), 30),
  villains: list(
    object({
      id,
      name: text(MAX_NAME),
      major: boolean,
      hidden: boolean,
      playersSee: oneOf('name', 'status', 'health'),
      'zone?': playZone,
      'health?': integer,
      'maxHealth?': integer,
      'statusDie?': die,
      'mods?': list(mod),
      'defenses?': list(object({ id, value: integer, from: text(MAX_NAME) }), 20),
      'twists?': list(twist),
    }),
    50,
  ),
  groups: list(
    object({
      id,
      'templateId?': id,
      kind: oneOf('minions', 'lieutenants'),
      name: text(MAX_NAME),
      hidden: boolean,
      owner: object({ kind: oneOf('gm', 'environment') }),
      actions: groupActions,
      members: list(object({ id, n: integer, die, mods: list(mod), acted: boolean, 'defenses?': list(object({ id, value: integer, from: text(MAX_NAME) }), 20) }), 50),
    }),
    50,
  ),
  challenges: list(object({ id, 'templateId?': id, name: text(MAX_NAME), hidden: boolean, owner: object({ kind: oneOf('gm', 'environment') }), steps: list(object({ label: text(MAX_NAME), done: boolean }), 20), requests: list(object({ id, heroId: id, total: range(-100, 100), 'trait?': text(MAX_NAME), at: text(40) }), 50), 'description?': text(MAX_TEXT), 'whenDone?': text(MAX_TEXT) }), 50),
  'pendingHits?': list(object({ id, heroId: id, by: text(MAX_NAME), amount: range(0, 1000), at: text(MAX_NAME), 'gmOnly?': oneOf(true) }), 50),
  feed: list(feedEntry, VIEW_FEED),
})

/** Returns a description of the first problem with a table view, or undefined when it's well formed. */
export function tableViewProblem(value: unknown): string | undefined {
  const problem = tableViewShape(value, 'table')
  if (problem) return problem
  const view = value as TableView
  if (view.scene.tracker.length === 0 || view.scene.position >= view.scene.tracker.length) return 'table.scene.position is past the last box'
  return undefined
}

/** A game code as sent: the same format as ./code.ts makes. */
const roomCode: Check = (v, path) => (typeof v === 'string' && normalizeRoomCode(v) === v ? undefined : `${path} isn't a game code`)

const HOST: Record<string, Check> = {
  state: object({ room: id, version: integer, table: (v, path) => tableViewProblem(v) && `${path} is malformed`, gm: text(MAX_NAME), 'you?': object({ heroId: id, since: text(40) }) }),
  result: (v, path) => (isRecord(v) && v.ok === false ? object({ id, ok: oneOf(false), reason: text(MAX_TEXT) })(v, path) : object({ id, ok: oneOf(true), 'notes?': list(text(MAX_TEXT), 10) })(v, path)),
  syncResult: object({ heroId: id, approved: boolean, adjustments: list(text(), 50) }),
  refused: object({ reason: oneOf('version', 'full', 'taken', 'removed', 'wrongGame') }),
  codeChanged: object({ code: roomCode }),
  removed: object({ 'reason?': text(MAX_TEXT) }),
  spendReminder: object({}),
}

/** A message from the GM's device, or undefined if it's malformed or from another version. */
export function readHostMessage(value: unknown): HostMessage | undefined {
  return read<HostMessage>(value, HOST)
}

/** Keeps a projection within what players accept: the newest log lines only. */
export function fitView(view: TableView): TableView {
  return view.feed.length > VIEW_FEED ? { ...view, feed: view.feed.slice(-VIEW_FEED) } : view
}

