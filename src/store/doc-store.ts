/**
 * A store for one kind of library document kept in its own object store (./records.ts), each
 * record holding the document's versioned envelope. Heroes and villains have stores of their
 * own; newer kinds (the NPC templates) share this one.
 */
import { IndexedDbRecords, MemoryRecords, readAll, type ObjectStoreName, type StoredRecord } from './records'

export interface DocList<T> {
  docs: T[]
  /** Saved records that couldn't be read. */
  unreadable: { id: string; error: string }[]
}

export type DocGetResult<T> = { status: 'found'; doc: T } | { status: 'missing' } | { status: 'unreadable'; error: string }

export interface DocStore<T> {
  list(): Promise<DocList<T>>
  get(id: string): Promise<DocGetResult<T>>
  save(doc: T): Promise<void>
  remove(id: string): Promise<void>
}

/** How a kind of document is wrapped for storage and read back. */
export interface DocEnvelope<T> {
  toSaved(doc: T): unknown
  parse(saved: unknown): { ok: true; doc: T } | { ok: false; error: string }
}

type Doc = { id: string; updatedAt: string }

function readOne<T>(envelope: DocEnvelope<T>, record: StoredRecord | undefined): DocGetResult<T> {
  if (!record) return { status: 'missing' }
  const result = envelope.parse(record.saved)
  return result.ok ? { status: 'found', doc: result.doc } : { status: 'unreadable', error: result.error }
}

export class MemoryDocStore<T extends Doc> extends MemoryRecords implements DocStore<T> {
  private readonly envelope: DocEnvelope<T>
  constructor(envelope: DocEnvelope<T>) {
    super()
    this.envelope = envelope
  }
  async list(): Promise<DocList<T>> {
    return readAll(await this.allRecords(), (s) => this.envelope.parse(s))
  }
  async get(id: string): Promise<DocGetResult<T>> {
    return readOne(this.envelope, await this.getRecord(id))
  }
  async save(doc: T): Promise<void> {
    await this.putRecord({ id: doc.id, saved: this.envelope.toSaved(doc) })
  }
  async remove(id: string): Promise<void> {
    await this.deleteRecord(id)
  }
}

export class IndexedDbDocStore<T extends Doc> extends IndexedDbRecords implements DocStore<T> {
  private readonly envelope: DocEnvelope<T>
  constructor(factory: IDBFactory, store: ObjectStoreName, envelope: DocEnvelope<T>, dbName?: string) {
    super(factory, store, dbName)
    this.envelope = envelope
  }
  async list(): Promise<DocList<T>> {
    return readAll(await this.allRecords(), (s) => this.envelope.parse(s))
  }
  async get(id: string): Promise<DocGetResult<T>> {
    return readOne(this.envelope, await this.getRecord(id))
  }
  async save(doc: T): Promise<void> {
    await this.putRecord({ id: doc.id, saved: this.envelope.toSaved(doc) })
  }
  async remove(id: string): Promise<void> {
    await this.deleteRecord(id)
  }
}

/** IndexedDB when the browser has it, otherwise memory (nothing persists). */
export function createDocStore<T extends Doc>(store: ObjectStoreName, envelope: DocEnvelope<T>, factory: IDBFactory | undefined = globalThis.indexedDB): DocStore<T> {
  return factory ? new IndexedDbDocStore(factory, store, envelope) : new MemoryDocStore(envelope)
}
