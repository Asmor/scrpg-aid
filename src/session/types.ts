/**
 * Peer-to-peer game sessions (Phase 4): what a session holds and the messages peers send.
 * The GM's browser is the authority: players send it requests, and it sends everyone the
 * whole session state after each change. Messages come from other people's browsers, so
 * they're untrusted and checked here before anything acts on them.
 */
import type { PlayMod, PlayTwist } from '../hero/model'
import type { PlayZone } from '../play/state'
import type { Zone } from '../rules/types'
import { arrayOf, boolean, integer, nonEmptyString, object, oneOf, type Check } from '../shape'

/** The message format's version; peers ignore messages of another version. */
export const SESSION_VERSION = 1

/** The most feed entries a session keeps (older ones drop off). */
export const FEED_LIMIT = 200
/** The most players a session takes, and mods it holds for them; the GM refuses more. */
export const MEMBER_LIMIT = 50
export const INBOX_LIMIT = 200
/** The most history entries in one feed message; a player sends more in several. */
export const FEED_BATCH = 50

/** What the table sees of a player's hero. */
export interface HeroSummary {
  name: string
  health?: number
  maxHealth?: number
  zone?: PlayZone
  mods: PlayMod[]
  twists: PlayTwist[]
}

/** A player in the session, known by a client id that stays the same across reloads. */
export interface Member {
  clientId: string
  hero?: HeroSummary
  connected: boolean
}

/** Something that happened at the table: a player's history entry, or the GM's doing. */
export interface FeedEntry {
  id: string
  at: string
  /** Who did it: a hero's name, or "GM". */
  by: string
  text: string
  details?: string[]
}

/** A bonus or penalty given to a player, kept until their browser says it has added it. */
export interface InboxMod {
  id: string
  /** The recipient's client id. */
  to: string
  /** The giver's name: a hero's name, or "GM". */
  from: string
  mod: Omit<PlayMod, 'id'>
}

export interface SessionState {
  room: string
  scene: Zone
  members: Member[]
  feed: FeedEntry[]
  inbox: InboxMod[]
}

/** A history entry a player shares with the table. */
export interface SharedEntry {
  id: string
  at: string
  text: string
  details?: string[]
}

export type PlayerMessage =
  | { v: 1; type: 'hello'; clientId: string; hero?: HeroSummary }
  | { v: 1; type: 'hero'; hero: HeroSummary }
  | { v: 1; type: 'feed'; entries: SharedEntry[] }
  | { v: 1; type: 'giveMod'; id: string; to: string; mod: Omit<PlayMod, 'id'> }
  | { v: 1; type: 'ack'; ids: string[] }

export type GmMessage = { v: 1; type: 'state'; state: SessionState }

// Limits, so one peer can't flood the others.
const MAX_TEXT = 2000
const MAX_LIST = 200

const text =
  (max = MAX_TEXT): Check =>
  (v, path) =>
    typeof v !== 'string' ? `${path} should be text` : v.length > max ? `${path} is too long` : undefined
const id: Check = (v, path) => nonEmptyString(v, path) ?? text(100)(v, path)
const list =
  (item: Check, max = MAX_LIST): Check =>
  (v, path) =>
    arrayOf(item)(v, path) ?? ((v as unknown[]).length > max ? `${path} is too long` : undefined)
const modValue: Check = (v, path) => integer(v, path) ?? (v === 0 || Math.abs(v as number) > 12 ? `${path} is out of range` : undefined)

const zone = oneOf('green', 'yellow', 'red')
const mod = object({ label: text(200), value: modValue, 'persistent?': oneOf(true), 'exclusive?': oneOf(true) })
const heroSummary = object({
  name: text(200),
  'health?': integer,
  'maxHealth?': integer,
  'zone?': oneOf('green', 'yellow', 'red', 'out'),
  mods: list(object({ id, label: text(200), value: modValue, 'persistent?': oneOf(true), 'exclusive?': oneOf(true) })),
  twists: list(object({ id, kind: oneOf('minor', 'major'), text: text() })),
})
const sharedEntry = object({ id, at: text(40), text: text(), 'details?': list(text(), 50) })

const playerChecks: Record<PlayerMessage['type'], Check> = {
  hello: object({ clientId: id, 'hero?': heroSummary }),
  hero: object({ hero: heroSummary }),
  feed: object({ entries: list(sharedEntry, FEED_BATCH) }),
  giveMod: object({ id, to: id, mod }),
  ack: object({ ids: list(id) }),
}

const stateCheck = object({
  room: id,
  scene: zone,
  members: list(object({ clientId: id, 'hero?': heroSummary, connected: boolean }), MEMBER_LIMIT),
  feed: list(object({ id, at: text(40), by: text(200), text: text(), 'details?': list(text(), 50) }), FEED_LIMIT),
  inbox: list(object({ id, to: id, from: text(200), mod }), INBOX_LIMIT),
})

const envelope = object({ v: oneOf(SESSION_VERSION), type: nonEmptyString })

/** A message from a player, or undefined if it's malformed (or from another version). */
export function readPlayerMessage(value: unknown): PlayerMessage | undefined {
  if (envelope(value, 'message')) return undefined
  const type = (value as { type: string }).type
  // Only the message types above; not "constructor" or other inherited keys.
  if (!Object.hasOwn(playerChecks, type)) return undefined
  return playerChecks[type as PlayerMessage['type']](value, 'message') ? undefined : (value as PlayerMessage)
}

/** A message from the GM, or undefined if it's malformed (or from another version). */
export function readGmMessage(value: unknown): GmMessage | undefined {
  if (envelope(value, 'message') || (value as { type: string }).type !== 'state') return undefined
  return stateCheck((value as { state?: unknown }).state, 'message.state') ? undefined : (value as GmMessage)
}

/** The version of what a browser saves to resume a session after a reload. */
export const SAVED_VERSION = 1

/** What the GM's browser saves to resume a session after a reload. */
export interface GmSaved {
  v: typeof SAVED_VERSION
  room: string
  password?: string
  state: SessionState
}

/** What a player's browser saves to rejoin after a reload. */
export interface PlayerSaved {
  v: typeof SAVED_VERSION
  room: string
  password?: string
  clientId: string
  heroId: string
  /**
   * The last history entry shared with the table. Set it to the hero's last entry when
   * joining, so the hero's history from before the session isn't shared.
   */
  sharedUpTo?: string
  /** Mods from others already added (so one the player removed doesn't come back). */
  applied: string[]
}

const gmSaved = object({ v: oneOf(SAVED_VERSION), room: id, 'password?': text(200), state: stateCheck })
const playerSaved = object({ v: oneOf(SAVED_VERSION), room: id, 'password?': text(200), clientId: id, heroId: nonEmptyString, 'sharedUpTo?': id, applied: list(id, INBOX_LIMIT) })

/** A stored GM session, or undefined if it's malformed or from another version. */
export function readGmSaved(value: unknown): GmSaved | undefined {
  return gmSaved(value, 'saved') ? undefined : (value as GmSaved)
}

/** A stored player session, or undefined if it's malformed or from another version. */
export function readPlayerSaved(value: unknown): PlayerSaved | undefined {
  return playerSaved(value, 'saved') ? undefined : (value as PlayerSaved)
}

/** The last game a player joined, remembered after leaving so joining again needs no typing. */
export interface LastGame {
  v: typeof SAVED_VERSION
  room: string
  password?: string
}

const lastGame = object({ v: oneOf(SAVED_VERSION), room: id, 'password?': text(200) })

/** A stored last game, or undefined if it's malformed or from another version. */
export function readLastGame(value: unknown): LastGame | undefined {
  return lastGame(value, 'saved') ? undefined : (value as LastGame)
}
