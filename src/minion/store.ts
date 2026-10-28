/**
 * Where minions are saved: the same database as heroes (../store/records.ts), in its own
 * object store, each record holding the versioned SavedMinion envelope from ./serialize.
 */
import { IndexedDbRecords, MemoryRecords, readAll, type StoredRecord } from '../store/records'
import type { Minion } from './model'
import { parseSavedMinion, minionToSaved } from './serialize'

export interface MinionList {
  minions: Minion[]
  /** Saved records that couldn't be read. */
  unreadable: { id: string; error: string }[]
}

export type MinionGetResult = { status: 'found'; minion: Minion } | { status: 'missing' } | { status: 'unreadable'; error: string }

export interface MinionStore {
  list(): Promise<MinionList>
  get(id: string): Promise<MinionGetResult>
  save(minion: Minion): Promise<void>
  remove(id: string): Promise<void>
}

const parse = (saved: unknown) => {
  const result = parseSavedMinion(saved)
  return result.ok ? { ok: true as const, doc: result.minion } : result
}

function readRecords(records: readonly StoredRecord[]): MinionList {
  const { docs, unreadable } = readAll(records, parse)
  return { minions: docs, unreadable }
}

function readOne(record: StoredRecord | undefined): MinionGetResult {
  if (!record) return { status: 'missing' }
  const result = parseSavedMinion(record.saved)
  return result.ok ? { status: 'found', minion: result.minion } : { status: 'unreadable', error: result.error }
}

export class MemoryMinionStore extends MemoryRecords implements MinionStore {
  async list(): Promise<MinionList> {
    return readRecords(await this.allRecords())
  }

  async get(id: string): Promise<MinionGetResult> {
    return readOne(await this.getRecord(id))
  }

  async save(minion: Minion): Promise<void> {
    await this.putRecord({ id: minion.id, saved: minionToSaved(minion) })
  }

  async remove(id: string): Promise<void> {
    await this.deleteRecord(id)
  }
}

export class IndexedDbMinionStore extends IndexedDbRecords implements MinionStore {
  constructor(factory: IDBFactory, dbName?: string) {
    super(factory, 'minions', dbName)
  }

  async list(): Promise<MinionList> {
    return readRecords(await this.allRecords())
  }

  async get(id: string): Promise<MinionGetResult> {
    return readOne(await this.getRecord(id))
  }

  async save(minion: Minion): Promise<void> {
    await this.putRecord({ id: minion.id, saved: minionToSaved(minion) })
  }

  async remove(id: string): Promise<void> {
    await this.deleteRecord(id)
  }
}

/** The store the app uses: IndexedDB when the browser has it, otherwise memory (nothing persists). */
export function createDefaultMinionStore(factory: IDBFactory | undefined = globalThis.indexedDB): MinionStore {
  return factory ? new IndexedDbMinionStore(factory) : new MemoryMinionStore()
}
