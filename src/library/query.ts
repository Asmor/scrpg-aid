/**
 * Filtering and sorting the library (scrpg-aid-designs/library/spec.md). Pure, so the library table,
 * saved searches' counts, and later the GM table ("add everything tagged scene-3") all use the
 * same rules: a case-insensitive name search, any of the chosen types, and every chosen tag,
 * combined with AND.
 */
import { compareText, hasTag, normalizeTag, tagKey } from './tags'

/** What the library is filtered by. Empty text, types or tags don't filter. */
export interface LibraryQuery {
  text: string
  /** Type keys ("hero", "villain"); an item of any of them matches. */
  types: string[]
  /** An item must have every one (ignoring case). */
  tags: string[]
}

export const emptyQuery = (): LibraryQuery => ({ text: '', types: [], tags: [] })

/** Whether the query filters anything. */
export function isFiltered(q: LibraryQuery): boolean {
  return q.text.trim() !== '' || q.types.length > 0 || q.tags.length > 0
}

/** What a query looks at in an item. */
export interface Matchable {
  type: string
  name: string
  tags: readonly string[]
}

export function matches(item: Matchable, q: LibraryQuery): boolean {
  const text = q.text.trim().toLocaleLowerCase()
  if (text && !item.name.toLocaleLowerCase().includes(text)) return false
  if (q.types.length && !q.types.includes(item.type)) return false
  return q.tags.every((tag) => hasTag(item.tags, tag))
}

export function filterItems<T extends Matchable>(items: readonly T[], q: LibraryQuery): T[] {
  return items.filter((item) => matches(item, q))
}

/** Whether two queries filter the same way (text trimmed; types and tags in any order, tags ignoring case). */
export function sameQuery(a: LibraryQuery, b: LibraryQuery): boolean {
  const set = (list: readonly string[]) => [...new Set(list)].sort().join('\n')
  return a.text.trim().toLocaleLowerCase() === b.text.trim().toLocaleLowerCase() && set(a.types) === set(b.types) && set(a.tags.map(tagKey)) === set(b.tags.map(tagKey))
}

/** The query with the tag added to its filter (once, ignoring case). */
export function withFilterTag(q: LibraryQuery, tag: string): LibraryQuery {
  return hasTag(q.tags, tag) ? q : { ...q, tags: [...q.tags, tag] }
}

/** How many type and tag filters are on (the phone's Filters button count). */
export const filterCount = (q: LibraryQuery): number => q.types.length + q.tags.length

/** The name Save search suggests: the tags joined by " + ", or else the types, or else "My search". */
export function defaultSearchName(q: LibraryQuery, plural: (type: string) => string): string {
  if (q.tags.length) return q.tags.join(' + ')
  if (q.types.length) return q.types.map(plural).join(' + ')
  return 'My search'
}

/** The no-matches message under "Nothing matches". */
export function noMatchText(q: LibraryQuery): string {
  if (q.tags.length) return `Nothing has all of these tags: ${q.tags.join(', ')}. Remove a tag to widen the search.`
  return 'No names match your search.'
}

export type SortKey = 'name' | 'type' | 'changed'
export interface Sort {
  key: SortKey
  dir: 'asc' | 'desc'
}

/** Changed, newest first. */
export const DEFAULT_SORT: Sort = { key: 'changed', dir: 'desc' }

/** Clicking a sort header: the same column flips direction; another starts ascending (Changed starts newest first). */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: key === 'changed' ? 'desc' : 'asc' }
}

/** What sorting looks at in a row. */
export interface Sortable {
  name: string
  typeLabel: string
  updatedAt: string
}

/** The rows in the sort's order; ties keep their order. */
export function sortItems<T extends Sortable>(items: readonly T[], sort: Sort): T[] {
  const compare: Record<SortKey, (a: T, b: T) => number> = {
    name: (a, b) => compareText(a.name, b.name),
    type: (a, b) => compareText(a.typeLabel, b.typeLabel),
    changed: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
  }
  const sign = sort.dir === 'asc' ? 1 : -1
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => sign * compare[sort.key](a.item, b.item) || a.index - b.index)
    .map(({ item }) => item)
}

/** The library's view: everything, a saved search, or unsaved filters. */
export type LibraryView = { kind: 'all' } | { kind: 'saved'; id: string } | { kind: 'query'; query: LibraryQuery }

/**
 * Reads the view from the hash's query string (scrpg-aid-designs/library/spec.md, "URL"):
 * "" for All, "s=<id>" for a saved search, "q=<text>&type=hero,villain&tag=a&tag=b" for filters.
 */
export function parseView(search: string): LibraryView {
  const params = new URLSearchParams(search)
  const saved = params.get('s')
  if (saved) return { kind: 'saved', id: saved }
  const query: LibraryQuery = {
    text: params.get('q') ?? '',
    types: [...new Set((params.get('type') ?? '').split(',').filter(Boolean))],
    tags: params.getAll('tag').flatMap((raw) => {
      const tag = normalizeTag(raw)
      return tag ? [tag] : []
    }).filter((tag, i, all) => all.findIndex((t) => tagKey(t) === tagKey(tag)) === i),
  }
  return isFiltered(query) ? { kind: 'query', query } : { kind: 'all' }
}

/** The hash for a view: "#/", "#/?s=<id>", or "#/?q=…&type=…&tag=…". */
export function viewHash(view: LibraryView): string {
  const params = new URLSearchParams()
  if (view.kind === 'saved') params.set('s', view.id)
  if (view.kind === 'query') {
    const { text, types, tags } = view.query
    if (text) params.set('q', text)
    if (types.length) params.set('type', types.join(','))
    for (const tag of tags) params.append('tag', tag)
  }
  const search = params.toString()
  return search ? `#/?${search}` : '#/'
}
