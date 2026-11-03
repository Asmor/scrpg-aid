/**
 * Shared session types: the table log's lines (kept in games, ../game/model.ts) and the last game
 * a player joined. The game table's messages are in ./protocol.ts.
 */
import { object, oneOf, nonEmptyString, string, type Check } from '../shape'

/** The most log lines a game keeps (older ones drop off). */
export const FEED_LIMIT = 200

/** A line in a table log: what happened, who did it, and the details under it. */
export interface FeedEntry {
  id: string
  at: string
  /** Who did it: a character's name, or "GM". */
  by: string
  text: string
  details?: string[]
}

/** The version of what a device saves about its sessions. */
export const SAVED_VERSION = 1

/** The last game joined, remembered after leaving so joining again needs no typing. */
export interface LastGame {
  v: typeof SAVED_VERSION
  room: string
  /** When it was joined (ISO 8601), for "Last game: K7QX-2M, 3 days ago". Older saves have none. */
  at?: string
}

const text = (max: number): Check => (v, path) => string(v, path) ?? ((v as string).length > max ? `${path} is too long` : undefined)
const lastGame = object({ v: oneOf(SAVED_VERSION), room: nonEmptyString, 'at?': text(40) })

/** A stored last game, or undefined if it's malformed or from another version. */
export function readLastGame(value: unknown): LastGame | undefined {
  return lastGame(value, 'saved') ? undefined : (value as LastGame)
}
