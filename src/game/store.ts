/**
 * Where games are saved: the same database as heroes (../store/records.ts), in its own
 * object store, each record holding the versioned SavedGame envelope from ./serialize.
 */
import { isRecord } from '../shape'
import { IndexedDbRecords, MemoryRecords, readAll, type StoredRecord } from '../store/records'
import type { Game } from './model'
import { parseSavedGame, gameToSaved } from './serialize'

export interface GameList {
  games: Game[]
  /** Saved records that couldn't be read, with what can still be made out of them. */
  unreadable: { id: string; error: string; name?: string; updatedAt?: string }[]
}

export type GameGetResult = { status: 'found'; game: Game } | { status: 'missing' } | { status: 'unreadable'; error: string }

export interface GameStore {
  list(): Promise<GameList>
  get(id: string): Promise<GameGetResult>
  save(game: Game): Promise<void>
  remove(id: string): Promise<void>
}

const parse = (saved: unknown) => {
  const result = parseSavedGame(saved)
  return result.ok ? { ok: true as const, doc: result.game } : result
}

function readRecords(records: readonly StoredRecord[]): GameList {
  const { docs, unreadable } = readAll(records, parse)
  return {
    games: docs,
    unreadable: unreadable.map((u) => {
      const saved = records.find((r) => r.id === u.id)?.saved
      const game = isRecord(saved) && isRecord(saved.game) ? saved.game : {}
      return { ...u, ...(typeof game.name === 'string' && game.name ? { name: game.name } : {}), ...(typeof game.updatedAt === 'string' ? { updatedAt: game.updatedAt } : {}) }
    }),
  }
}

function readOne(record: StoredRecord | undefined): GameGetResult {
  if (!record) return { status: 'missing' }
  const result = parseSavedGame(record.saved)
  return result.ok ? { status: 'found', game: result.game } : { status: 'unreadable', error: result.error }
}

export class MemoryGameStore extends MemoryRecords implements GameStore {
  async list(): Promise<GameList> {
    return readRecords(await this.allRecords())
  }

  async get(id: string): Promise<GameGetResult> {
    return readOne(await this.getRecord(id))
  }

  async save(game: Game): Promise<void> {
    await this.putRecord({ id: game.id, saved: gameToSaved(game) })
  }

  async remove(id: string): Promise<void> {
    await this.deleteRecord(id)
  }
}

export class IndexedDbGameStore extends IndexedDbRecords implements GameStore {
  constructor(factory: IDBFactory, dbName?: string) {
    super(factory, 'games', dbName)
  }

  async list(): Promise<GameList> {
    return readRecords(await this.allRecords())
  }

  async get(id: string): Promise<GameGetResult> {
    return readOne(await this.getRecord(id))
  }

  async save(game: Game): Promise<void> {
    await this.putRecord({ id: game.id, saved: gameToSaved(game) })
  }

  async remove(id: string): Promise<void> {
    await this.deleteRecord(id)
  }
}

/** The store the app uses: IndexedDB when the browser has it, otherwise memory (nothing persists). */
export function createDefaultGameStore(factory: IDBFactory | undefined = globalThis.indexedDB): GameStore {
  return factory ? new IndexedDbGameStore(factory) : new MemoryGameStore()
}
