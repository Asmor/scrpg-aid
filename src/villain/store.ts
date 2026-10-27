/**
 * Where villains are saved: the same database as heroes (../store/records.ts), in its own
 * object store, each record holding the versioned SavedVillain envelope from ./serialize.
 */
import { IndexedDbRecords, MemoryRecords, readAll, type StoredRecord } from '../store/records'
import type { Villain } from './model'
import { parseSavedVillain, villainToSaved } from './serialize'

export interface VillainList {
  villains: Villain[]
  /** Saved records that couldn't be read. */
  unreadable: { id: string; error: string }[]
}

export type VillainGetResult = { status: 'found'; villain: Villain } | { status: 'missing' } | { status: 'unreadable'; error: string }

export interface VillainStore {
  list(): Promise<VillainList>
  get(id: string): Promise<VillainGetResult>
  save(villain: Villain): Promise<void>
  remove(id: string): Promise<void>
}

const parse = (saved: unknown) => {
  const result = parseSavedVillain(saved)
  return result.ok ? { ok: true as const, doc: result.villain } : result
}

function readRecords(records: readonly StoredRecord[]): VillainList {
  const { docs, unreadable } = readAll(records, parse)
  return { villains: docs, unreadable }
}

function readOne(record: StoredRecord | undefined): VillainGetResult {
  if (!record) return { status: 'missing' }
  const result = parseSavedVillain(record.saved)
  return result.ok ? { status: 'found', villain: result.villain } : { status: 'unreadable', error: result.error }
}

export class MemoryVillainStore extends MemoryRecords implements VillainStore {
  async list(): Promise<VillainList> {
    return readRecords(await this.allRecords())
  }

  async get(id: string): Promise<VillainGetResult> {
    return readOne(await this.getRecord(id))
  }

  async save(villain: Villain): Promise<void> {
    await this.putRecord({ id: villain.id, saved: villainToSaved(villain) })
  }

  async remove(id: string): Promise<void> {
    await this.deleteRecord(id)
  }
}

export class IndexedDbVillainStore extends IndexedDbRecords implements VillainStore {
  constructor(factory: IDBFactory, dbName?: string) {
    super(factory, 'villains', dbName)
  }

  async list(): Promise<VillainList> {
    return readRecords(await this.allRecords())
  }

  async get(id: string): Promise<VillainGetResult> {
    return readOne(await this.getRecord(id))
  }

  async save(villain: Villain): Promise<void> {
    await this.putRecord({ id: villain.id, saved: villainToSaved(villain) })
  }

  async remove(id: string): Promise<void> {
    await this.deleteRecord(id)
  }
}

/** The store the app uses: IndexedDB when the browser has it, otherwise memory (nothing persists). */
export function createDefaultVillainStore(factory: IDBFactory | undefined = globalThis.indexedDB): VillainStore {
  return factory ? new IndexedDbVillainStore(factory) : new MemoryVillainStore()
}
