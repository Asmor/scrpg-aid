/**
 * The browser's IndexedDB database the app saves its documents in: one object store per
 * kind of document (heroes, villains, minions, the library's saved searches, games, and games joined as a player), each holding `{ id, saved }` records, where `saved` is
 * the document's versioned envelope. ../hero/store.ts, ../villain/store.ts, and ../minion/store.ts build on this.
 */

export const DB_NAME = 'scrpg-aid'
/** Version 2 added the villains store, version 3 the minions store, version 4 the saved searches store, version 5 the games store, and version 6 the joined games store. */
export const DB_VERSION = 6
export const OBJECT_STORES = ['heroes', 'villains', 'minions', 'savedSearches', 'games', 'joined'] as const
export type ObjectStoreName = (typeof OBJECT_STORES)[number]

/** A stored record: the document's id next to its saved envelope. */
export interface StoredRecord {
  id: string
  saved: unknown
}

/** Reads every record, sorting the documents that parse by most recently updated. */
export function readAll<T extends { updatedAt: string }>(
  records: readonly StoredRecord[],
  parse: (saved: unknown) => { ok: true; doc: T } | { ok: false; error: string },
): { docs: T[]; unreadable: { id: string; error: string }[] } {
  const docs: T[] = []
  const unreadable: { id: string; error: string }[] = []
  for (const record of records) {
    const result = parse(record.saved)
    if (result.ok) docs.push(result.doc)
    else unreadable.push({ id: record.id, error: result.error })
  }
  docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { docs, unreadable }
}

/** Keeps records in memory. Used in tests, and as a fallback when IndexedDB is unavailable. */
export class MemoryRecords {
  private records = new Map<string, StoredRecord>()

  protected async allRecords(): Promise<StoredRecord[]> {
    return [...this.records.values()]
  }

  protected async getRecord(id: string): Promise<StoredRecord | undefined> {
    return this.records.get(id)
  }

  protected async putRecord(record: StoredRecord): Promise<void> {
    // Round-trip through JSON so callers can't mutate what's stored.
    this.records.set(record.id, JSON.parse(JSON.stringify(record)) as StoredRecord)
  }

  protected async deleteRecord(id: string): Promise<void> {
    this.records.delete(id)
  }
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Records in one of the database's object stores. */
export class IndexedDbRecords {
  private db: Promise<IDBDatabase> | undefined
  private readonly factory: IDBFactory
  private readonly dbName: string
  private readonly store: ObjectStoreName

  constructor(factory: IDBFactory, store: ObjectStoreName, dbName: string = DB_NAME) {
    this.factory = factory
    this.store = store
    this.dbName = dbName
  }

  private open(): Promise<IDBDatabase> {
    if (this.db) return this.db
    let settled = false
    const attempt: Promise<IDBDatabase> = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.dbName, DB_VERSION)
      request.onupgradeneeded = () => {
        for (const name of OBJECT_STORES) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' })
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
        reject(new Error('the database is in use by an older copy of the app; close other tabs and reload'))
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
    const tx = db.transaction(this.store, mode)
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    const [result] = await Promise.all([promisify(run(tx.objectStore(this.store))), done])
    return result
  }

  protected async allRecords(): Promise<StoredRecord[]> {
    return this.request('readonly', (s) => s.getAll() as IDBRequest<StoredRecord[]>)
  }

  protected async getRecord(id: string): Promise<StoredRecord | undefined> {
    return this.request('readonly', (s) => s.get(id) as IDBRequest<StoredRecord | undefined>)
  }

  protected async putRecord(record: StoredRecord): Promise<void> {
    await this.request('readwrite', (s) => s.put(record))
  }

  protected async deleteRecord(id: string): Promise<void> {
    await this.request('readwrite', (s) => s.delete(id))
  }

  /** Closes the connection (used by tests). */
  async close(): Promise<void> {
    if (this.db) (await this.db).close()
    this.db = undefined
  }
}
