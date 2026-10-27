/**
 * Where heroes are saved. The app talks to the HeroStore interface only, so other
 * backends (cloud storage, for example) can be added later without touching the UI.
 * Every backend stores the versioned SavedHero envelope from ./serialize.
 */
import { IndexedDbRecords, MemoryRecords, readAll, type StoredRecord } from '../store/records'
import type { Hero } from './model'
import { parseSaved, toSaved } from './serialize'

export interface UnreadableHero {
  id: string
  error: string
}

export interface HeroList {
  heroes: Hero[]
  /** Saved records that couldn't be read, so the UI can say so instead of hiding them. */
  unreadable: UnreadableHero[]
}

/** The result of looking up one hero, distinguishing "not there" from "there but unreadable". */
export type GetResult = { status: 'found'; hero: Hero } | { status: 'missing' } | { status: 'unreadable'; error: string }

export interface HeroStore {
  list(): Promise<HeroList>
  get(id: string): Promise<GetResult>
  save(hero: Hero): Promise<void>
  remove(id: string): Promise<void>
}

const parse = (saved: unknown) => {
  const result = parseSaved(saved)
  return result.ok ? { ok: true as const, doc: result.hero } : result
}

/** Turns stored records into heroes, most recently updated first. */
function readRecords(records: readonly StoredRecord[]): HeroList {
  const { docs, unreadable } = readAll(records, parse)
  return { heroes: docs, unreadable }
}

function readOne(record: StoredRecord | undefined): GetResult {
  if (!record) return { status: 'missing' }
  const result = parseSaved(record.saved)
  return result.ok ? { status: 'found', hero: result.hero } : { status: 'unreadable', error: result.error }
}

/** Keeps heroes in memory. Used in tests, and as a fallback when IndexedDB is unavailable. */
export class MemoryHeroStore extends MemoryRecords implements HeroStore {
  async list(): Promise<HeroList> {
    return readRecords(await this.allRecords())
  }

  async get(id: string): Promise<GetResult> {
    return readOne(await this.getRecord(id))
  }

  async save(hero: Hero): Promise<void> {
    await this.putRecord({ id: hero.id, saved: toSaved(hero) })
  }

  async remove(id: string): Promise<void> {
    await this.deleteRecord(id)
  }
}

/** Saves heroes in the browser's IndexedDB. */
export class IndexedDbHeroStore extends IndexedDbRecords implements HeroStore {
  constructor(factory: IDBFactory, dbName?: string) {
    super(factory, 'heroes', dbName)
  }

  async list(): Promise<HeroList> {
    return readRecords(await this.allRecords())
  }

  async get(id: string): Promise<GetResult> {
    return readOne(await this.getRecord(id))
  }

  async save(hero: Hero): Promise<void> {
    await this.putRecord({ id: hero.id, saved: toSaved(hero) })
  }

  async remove(id: string): Promise<void> {
    await this.deleteRecord(id)
  }
}

/** The store the app uses: IndexedDB when the browser has it, otherwise memory (nothing persists). */
export function createDefaultStore(factory: IDBFactory | undefined = globalThis.indexedDB): HeroStore {
  return factory ? new IndexedDbHeroStore(factory) : new MemoryHeroStore()
}
