/**
 * Open display view on the GM's own device (scrpg-aid-designs/game-table/spec.md, section 13): the GM's
 * table and a display window opened from it talk over a `BroadcastChannel`, with no network and
 * no hosting. The table sends the observer projection after every change, so the window never
 * holds anything a player couldn't see; the window asks for it when it opens.
 *
 * Messages are checked on arrival like anything else from outside the page.
 */
import { tableViewProblem } from '../session/protocol'
import { isRecord } from '../shape'
import type { TableView } from './project'

/** The channel for one game's display. */
export const displayChannelName = (gameId: string) => `scrpg-display:${gameId}`

export type DisplayMessage =
  /** The display window asks for the table. */
  | { type: 'ask' }
  /** The table as observers see it, and the game's code while it's hosted. */
  | { type: 'state'; table: TableView; room?: string }
  /** The GM's table was closed: the window keeps what it has. */
  | { type: 'closed' }

/** A display message, or undefined if it isn't one. */
export function readDisplayMessage(value: unknown): DisplayMessage | undefined {
  if (!isRecord(value)) return undefined
  if (value.type === 'ask' || value.type === 'closed') return { type: value.type }
  if (value.type !== 'state' || tableViewProblem(value.table)) return undefined
  if (value.room !== undefined && (typeof value.room !== 'string' || value.room.length > 40)) return undefined
  return { type: 'state', table: value.table as TableView, ...(typeof value.room === 'string' ? { room: value.room } : {}) }
}

/** A channel, or undefined where the browser has none. */
export function openDisplayChannel(gameId: string): BroadcastChannel | undefined {
  return typeof BroadcastChannel === 'function' ? new BroadcastChannel(displayChannelName(gameId)) : undefined
}
