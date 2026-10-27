/**
 * Where heroes are saved. The app talks to the HeroStore interface only, so other
 * backends (cloud storage, for example) can be added later without touching the UI.
 * Every backend stores the versioned SavedHero envelope from ./serialize.
 */
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

/** A stored record: the hero's id next to its saved envelope. */
interface StoredRecord {
  id: string
  saved: unknown
}

/** Turns stored records into heroes, most recently updated first. */
function readRecords(records: readonly StoredRecord[]): HeroList {
  const heroes: Hero[] = []
  const unreadable: UnreadableHero[] = []
  for (const record of records) {
    const result = parseSaved(record.saved)
    if (result.ok) heroes.push(result.hero)
    else unreadable.push({ id: record.id, error: result.error })
  }
  heroes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { heroes, unreadable }
}

function readOne(record: StoredRecord | undefined): GetResult {
  if (!record) return { status: 'missing' }
  const result = parseSaved(record.saved)
  return result.ok ? { status: 'found', hero: result.hero } : { status: 'unreadable', error: result.error }
}

/** Keeps heroes in memory. Used in tests, and as a fallback when IndexedDB is unavailable. */
export class MemoryHeroStore implements HeroStore {
  private records = new Map<string, StoredRecord>()

  async list(): Promise<HeroList> {
    return readRecords([...this.records.values()])
  }

  async get(id: string): Promise<GetResult> {
    return readOne(this.records.get(id))
  }

  async save(hero: Hero): Promise<void> {
    // Round-trip through JSON so callers can't mutate what's stored.
    this.records.set(hero.id, { id: hero.id, saved: JSON.parse(JSON.stringify(toSaved(hero))) })
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id)
  }
}

const DB_NAME = 'scrpg-aid'
const DB_VERSION = 1
const STORE = 'heroes'

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Saves heroes in the browser's IndexedDB. */
export class IndexedDbHeroStore implements HeroStore {
  private db: Promise<IDBDatabase> | undefined
  private readonly factory: IDBFactory
  private readonly dbName: string

  constructor(factory: IDBFactory, dbName: string = DB_NAME) {
    this.factory = factory
    this.dbName = dbName
  }

  private open(): Promise<IDBDatabase> {
    if (this.db) return this.db
    let settled = false
    const attempt: Promise<IDBDatabase> = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.dbName, DB_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => {
        const db = request.result
        if (settled) {
          // We already gave up on this attempt (it was blocked), so don't leak the connection.
          db.close()
          return
        }
        settled = true
        // Let a newer tab upgrade the database, and recover if the browser closes the connection.
        // Only forget the cached connection if it's still this one.
        db.onversionchange = () => {
          db.close()
          if (this.db === attempt) this.db = undefined
        }
        db.onclose = () => {
          if (this.db === attempt) this.db = undefined
        }
        resolve(db)
      }
      request.onerror = () => {
        settled = true
        reject(request.error)
      }
      request.onblocked = () => {
        settled = true
        reject(new Error('the hero database is in use by an older copy of the app; close other tabs and reload'))
      }
    }).catch((error: unknown) => {
      // Forget the failed attempt so the next call tries again.
      if (this.db === attempt) this.db = undefined
      throw error
    })
    this.db = attempt
    return attempt
  }

  private async request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open()
    const tx = db.transaction(STORE, mode)
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    const [result] = await Promise.all([promisify(run(tx.objectStore(STORE))), done])
    return result
  }

  async list(): Promise<HeroList> {
    return readRecords(await this.request('readonly', (s) => s.getAll() as IDBRequest<StoredRecord[]>))
  }

  async get(id: string): Promise<GetResult> {
    return readOne(await this.request('readonly', (s) => s.get(id) as IDBRequest<StoredRecord | undefined>))
  }

  async save(hero: Hero): Promise<void> {
    const record: StoredRecord = { id: hero.id, saved: toSaved(hero) }
    await this.request('readwrite', (s) => s.put(record))
  }

  async remove(id: string): Promise<void> {
    await this.request('readwrite', (s) => s.delete(id))
  }

  /** Closes the connection (used by tests). */
  async close(): Promise<void> {
    if (this.db) (await this.db).close()
    this.db = undefined
  }
}

/** The store the app uses: IndexedDB when the browser has it, otherwise memory (nothing persists). */
export function createDefaultStore(factory: IDBFactory | undefined = globalThis.indexedDB): HeroStore {
  return factory ? new IndexedDbHeroStore(factory) : new MemoryHeroStore()
}
