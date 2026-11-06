/**
 * Saved searches (docs/design/library/spec.md, "Saved searches"): a named library query,
 * kept in the database's savedSearches store in a versioned envelope like every other saved
 * document, and included in backups.
 */
import { newId } from '../hero/model'
import { readEnvelope } from '../saved'
import { arrayOf, nonEmptyString, object, string } from '../shape'
import { IndexedDbRecords, MemoryRecords, type StoredRecord } from '../store/records'
import type { LibraryQuery } from './query'
import { cleanTags, compareText } from './tags'

export interface SavedSearch {
  id: string
  name: string
  query: LibraryQuery
  createdAt: string
}

export const SEARCH_FORMAT = 'scrpg-saved-search'
export const SEARCH_VERSION = 1

export interface SavedSearchEnvelope {
  format: typeof SEARCH_FORMAT
  version: number
  search: SavedSearch
}

const searchShape = object({
  id: nonEmptyString,
  name: nonEmptyString,
  query: object({ text: string, types: arrayOf(string), tags: arrayOf(string) }),
  createdAt: string,
})

export function searchToSaved(search: SavedSearch): SavedSearchEnvelope {
  return { format: SEARCH_FORMAT, version: SEARCH_VERSION, search }
}

export type SearchParseResult = { ok: true; search: SavedSearch } | { ok: false; error: string }

/** Reads a saved search (from storage or a backup, so untrusted). */
export function parseSavedSearch(value: unknown): SearchParseResult {
  const result = readEnvelope<SavedSearch>(value, { format: SEARCH_FORMAT, key: 'search', currentVersion: SEARCH_VERSION, problem: (doc) => searchShape(doc, 'search') })
  if (!result.ok) return result
  const search = result.doc
  const name = checkName(search.name)
  if (!name.ok) return { ok: false, error: `search.name: ${name.error}` }
  return { ok: true, search: { ...search, name: name.name, query: { ...search.query, tags: cleanTags(search.query.tags) } } }
}

export const MAX_SEARCH_NAME = 60

/** A name's length and content, before uniqueness. */
function checkName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim()
  if (!name) return { ok: false, error: 'Give the search a name.' }
  if ([...name].length > MAX_SEARCH_NAME) return { ok: false, error: `Use ${MAX_SEARCH_NAME} characters or fewer.` }
  return { ok: true, name }
}

/**
 * Checks a saved search's name: 1–60 characters after trimming, and unique among `existing`
 * ignoring case (`exceptId` is the search being renamed).
 */
export function checkSearchName(raw: string, existing: readonly SavedSearch[], exceptId?: string): { ok: true; name: string } | { ok: false; error: string } {
  const result = checkName(raw)
  if (!result.ok) return result
  const key = result.name.toLocaleLowerCase()
  if (existing.some((s) => s.id !== exceptId && s.name.toLocaleLowerCase() === key)) return { ok: false, error: 'You already have a saved search with that name.' }
  return result
}

/** A new saved search. `id` and `now` are injectable for tests. */
export function createSavedSearch(name: string, query: LibraryQuery, options: { id?: string; now?: Date } = {}): SavedSearch {
  return { id: options.id ?? newId(), name, query: structuredClone(query), createdAt: (options.now ?? new Date()).toISOString() }
}

/** Saved searches in the order the rail lists them: by name. */
export function sortSearches(searches: readonly SavedSearch[]): SavedSearch[] {
  return [...searches].sort((a, b) => compareText(a.name, b.name))
}

/**
 * The saved searches to store when restoring a backup: one with an id that's already saved
 * replaces it; one whose name another saved search already uses (ignoring case) gets " (2)",
 * " (3)", and so on, so names stay unique.
 */
export function searchesToRestore(incoming: readonly SavedSearch[], existing: readonly SavedSearch[]): SavedSearch[] {
  const byId = new Map(existing.map((s) => [s.id, s]))
  const out: SavedSearch[] = []
  for (const search of incoming) {
    if (out.some((s) => s.id === search.id)) continue
    byId.delete(search.id)
    const taken = new Set([...byId.values(), ...out].map((s) => s.name.toLocaleLowerCase()))
    let name = search.name
    for (let n = 2; taken.has(name.toLocaleLowerCase()); n++) {
      const suffix = ` (${n})`
      name = [...search.name].slice(0, MAX_SEARCH_NAME - suffix.length).join('') + suffix
    }
    out.push({ ...search, name })
  }
  return out
}

export interface SavedSearchList {
  searches: SavedSearch[]
  unreadable: { id: string; error: string }[]
}

export interface SavedSearchStore {
  list(): Promise<SavedSearchList>
  save(search: SavedSearch): Promise<void>
  remove(id: string): Promise<void>
}

function readRecords(records: readonly StoredRecord[]): SavedSearchList {
  const searches: SavedSearch[] = []
  const unreadable: { id: string; error: string }[] = []
  for (const record of records) {
    const result = parseSavedSearch(record.saved)
    if (result.ok) searches.push(result.search)
    else unreadable.push({ id: record.id, error: result.error })
  }
  return { searches: sortSearches(searches), unreadable }
}

export class MemorySavedSearchStore extends MemoryRecords implements SavedSearchStore {
  async list(): Promise<SavedSearchList> {
    return readRecords(await this.allRecords())
  }

  async save(search: SavedSearch): Promise<void> {
    await this.putRecord({ id: search.id, saved: searchToSaved(search) })
  }

  async remove(id: string): Promise<void> {
    await this.deleteRecord(id)
  }
}

export class IndexedDbSavedSearchStore extends IndexedDbRecords implements SavedSearchStore {
  constructor(factory: IDBFactory, dbName?: string) {
    super(factory, 'savedSearches', dbName)
  }

  async list(): Promise<SavedSearchList> {
    return readRecords(await this.allRecords())
  }

  async save(search: SavedSearch): Promise<void> {
    await this.putRecord({ id: search.id, saved: searchToSaved(search) })
  }

  async remove(id: string): Promise<void> {
    await this.deleteRecord(id)
  }
}

/** The store the app uses: IndexedDB when the browser has it, otherwise memory. */
export function createDefaultSavedSearchStore(factory: IDBFactory | undefined = globalThis.indexedDB): SavedSearchStore {
  return factory ? new IndexedDbSavedSearchStore(factory) : new MemorySavedSearchStore()
}
