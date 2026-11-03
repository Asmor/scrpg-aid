/**
 * Games a player has joined, cached on their device (docs/design/game-table/spec.md, section 11):
 * the latest projection the GM's device sent for each, so the game can be opened later without
 * the GM, read-only. Only what the player was allowed to see is ever here. "Leave and remove from
 * this device" removes the cache; the hero stays in the GM's game.
 *
 * Each record is a versioned envelope `{ v: 1, joined }` in the database's `joined` store, keyed
 * by the game's id.
 */
import { tableViewProblem } from '../session/protocol'
import { heroShape } from '../hero/validate'
import { integer, isRecord, nonEmptyString, object, oneOf, string } from '../shape'
import { IndexedDbRecords, MemoryRecords, readAll, type StoredRecord } from '../store/records'
import type { Hero } from '../hero/model'
import type { TableView } from './project'
import type { Received } from '../session/client'

export const JOINED_VERSION = 1

export interface JoinedGame {
  /** The game's id (the GM's). */
  id: string
  /** The code it was last joined with. */
  room: string
  /** The GM's name. */
  gm: string
  /** The player's hero in the game, and the library hero it was copied from. */
  heroId: string
  heroSourceId: string
  /** The library sheet joined with, to join again from the Games page. */
  sheet: Hero
  /** The player's name at the table. */
  name: string
  /** When the hero first joined this game, and when this was last heard from the GM (ISO 8601). */
  since: string
  updatedAt: string
  version: number
  table: TableView
}

const joinedShape = object({
  id: nonEmptyString,
  room: nonEmptyString,
  gm: string,
  heroId: nonEmptyString,
  heroSourceId: nonEmptyString,
  sheet: heroShape,
  name: string,
  since: string,
  updatedAt: string,
  version: integer,
  table: (v, path) => tableViewProblem(v) && `${path} is malformed`,
})

/** A cached game as the state it was last received in, to show until the GM answers. */
export function receivedFrom(j: JoinedGame): Received {
  return { room: j.room, version: j.version, table: j.table, gm: j.gm, you: { heroId: j.heroId, since: j.since }, at: j.updatedAt }
}

export function joinedToSaved(joined: JoinedGame): unknown {
  return { v: JOINED_VERSION, joined }
}

export function parseSavedJoined(saved: unknown): { ok: true; doc: JoinedGame } | { ok: false; error: string } {
  if (!isRecord(saved) || oneOf(JOINED_VERSION)(saved.v, 'v')) return { ok: false, error: 'not a saved joined game of this version' }
  const problem = joinedShape(saved.joined, 'joined')
  return problem ? { ok: false, error: problem } : { ok: true, doc: saved.joined as JoinedGame }
}

export interface JoinedStore {
  list(): Promise<JoinedGame[]>
  get(id: string): Promise<JoinedGame | undefined>
  save(joined: JoinedGame): Promise<void>
  remove(id: string): Promise<void>
}

const listOf = (records: readonly StoredRecord[]) => readAll(records, parseSavedJoined).docs
const one = (record: StoredRecord | undefined) => {
  const r = record ? parseSavedJoined(record.saved) : undefined
  return r?.ok ? r.doc : undefined
}

export class MemoryJoinedStore extends MemoryRecords implements JoinedStore {
  async list() {
    return listOf(await this.allRecords())
  }
  async get(id: string) {
    return one(await this.getRecord(id))
  }
  async save(joined: JoinedGame) {
    await this.putRecord({ id: joined.id, saved: joinedToSaved(joined) })
  }
  async remove(id: string) {
    await this.deleteRecord(id)
  }
}

export class IndexedDbJoinedStore extends IndexedDbRecords implements JoinedStore {
  constructor(factory: IDBFactory, dbName?: string) {
    super(factory, 'joined', dbName)
  }
  async list() {
    return listOf(await this.allRecords())
  }
  async get(id: string) {
    return one(await this.getRecord(id))
  }
  async save(joined: JoinedGame) {
    await this.putRecord({ id: joined.id, saved: joinedToSaved(joined) })
  }
  async remove(id: string) {
    await this.deleteRecord(id)
  }
}

/** The store the app uses: IndexedDB when the browser has it, otherwise memory (nothing persists). */
export function createDefaultJoinedStore(factory: IDBFactory | undefined = globalThis.indexedDB): JoinedStore {
  return factory ? new IndexedDbJoinedStore(factory) : new MemoryJoinedStore()
}
