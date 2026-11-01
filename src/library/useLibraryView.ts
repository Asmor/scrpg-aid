/**
 * The library's view (docs/design/library/spec.md): which view is current (All, a saved
 * search, or unsaved filters), kept in the URL; the snapshot of rows it shows, retaken only on
 * the events the spec lists under Stability; the sort; and the selection.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { emptyQuery, isFiltered, matches, parseView, sameQuery, viewHash, type LibraryQuery, type LibraryView, DEFAULT_SORT, type Sort, sortItems } from './query'
import { itemFields, type LibraryItem } from './registry'
import type { SavedSearch } from './saved-searches'

/** The view's query string from the current address, or undefined when the address isn't the library. */
function currentSearch(): string | undefined {
  const path = window.location.hash.replace(/^#/, '') || '/'
  if (path === '/') return ''
  if (path.startsWith('/?')) return path.slice(2)
  return undefined
}

/** The query a view filters by. A saved search that's gone filters nothing. */
export function viewQuery(view: LibraryView, searches: readonly SavedSearch[]): LibraryQuery {
  if (view.kind === 'query') return view.query
  if (view.kind === 'saved') return searches.find((s) => s.id === view.id)?.query ?? emptyQuery()
  return emptyQuery()
}

/** The keys of the items a query matches, in their stored order. */
function keysMatching(items: ReadonlyMap<string, LibraryItem>, query: LibraryQuery): string[] {
  return [...items.entries()].filter(([, item]) => matches(itemFields(item), query)).map(([key]) => key)
}

/** The keys in the sort's order, by the items as they are now. */
function ordered(keys: readonly string[], list: ReadonlyMap<string, LibraryItem>, by: Sort): string[] {
  return sortItems(
    keys.flatMap((key) => {
      const item = list.get(key)
      return item ? [{ key, ...itemFields(item) }] : []
    }),
    by,
  ).map((r) => r.key)
}

export function useLibraryView(items: ReadonlyMap<string, LibraryItem> | undefined, searches: readonly SavedSearch[] | undefined) {
  const [view, setViewState] = useState<LibraryView>(() => parseView(currentSearch() ?? ''))
  const [snapshot, setSnapshot] = useState<string[] | null>(null)
  const [sort, setSortState] = useState<Sort>(DEFAULT_SORT)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  // A count that goes up each time the snapshot is retaken, for the live region.
  const [refreshes, setRefreshes] = useState(0)
  const query = useMemo(() => viewQuery(view, searches ?? []), [view, searches])

  const latest = useRef({ view, items, searches, sort })
  useEffect(() => {
    latest.current = { view, items, searches, sort }
  })



  /** Takes a new snapshot of the rows for a view (now, or once the items load). */
  const retake = useCallback((forView: LibraryView, list = latest.current.items, saved = latest.current.searches) => {
    if (!list || !saved) return
    setSnapshot(ordered(keysMatching(list, viewQuery(forView, saved)), list, latest.current.sort))
    setRefreshes((n) => n + 1)
  }, [])

  // The first snapshot, once everything has loaded. A saved search in the address that's gone shows All.
  const loaded = items !== undefined && searches !== undefined
  if (loaded && snapshot === null) {
    const start: LibraryView = view.kind === 'saved' && !searches.some((s) => s.id === view.id) ? { kind: 'all' } : view
    if (start !== view) setViewState(start)
    setSnapshot(ordered(keysMatching(items, viewQuery(start, searches)), items, sort))
    setRefreshes((n) => n + 1)
  }
  // ...and puts All's address in place of the missing search's.
  useEffect(() => {
    const search = currentSearch()
    if (view.kind === 'all' && search !== undefined && parseView(search).kind === 'saved') history.replaceState(history.state, '', viewHash(view))
  }, [view])

  /** Sets up a view: clears the selection and retakes the snapshot. `push` adds a history entry; otherwise the current one is replaced. */
  const apply = useCallback(
    (next: LibraryView, push: boolean) => {
      setViewState(next)
      setSelected(new Set())
      retake(next)
      const hash = viewHash(next)
      if (push) {
        if (window.location.hash !== hash) window.location.hash = hash
      } else if (window.location.hash !== hash) {
        history.replaceState(history.state, '', hash)
      }
    },
    [retake],
  )

  // Back, Forward, or a link to another view of the library (a tag on a sheet) sets up that view.
  useEffect(() => {
    const onHash = () => {
      const search = currentSearch()
      if (search === undefined) return
      const next = parseView(search)
      if (viewHash(next) === viewHash(latest.current.view)) return
      setViewState(next)
      setSelected(new Set())
      retake(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [retake])

  /** Changes the filters. No filters at all is All; otherwise unsaved filters (even if they started as a saved search). */
  const setQuery = useCallback(
    (next: LibraryQuery) => {
      const current = latest.current
      if (sameQuery(next, viewQuery(current.view, current.searches ?? []))) return
      apply(isFiltered(next) ? { kind: 'query', query: next } : { kind: 'all' }, false)
    },
    [apply],
  )

  const showAll = useCallback(() => apply({ kind: 'all' }, true), [apply])
  const showSaved = useCallback((id: string) => apply({ kind: 'saved', id }, true), [apply])
  /** After saving the current filters: the new search becomes the view (same rows, so no new snapshot). */
  const becameSaved = useCallback((id: string) => {
    const next: LibraryView = { kind: 'saved', id }
    setViewState(next)
    history.replaceState(history.state, '', viewHash(next))
  }, [])
  /** Retakes the snapshot for the current view (Refresh), or with items just loaded (after an import). */
  const refresh = useCallback(
    (list?: ReadonlyMap<string, LibraryItem>, saved?: readonly SavedSearch[]) => retake(latest.current.view, list ?? latest.current.items, saved ?? latest.current.searches),
    [retake],
  )
  /** Adds new items to the rows shown (a duplicate, right after its original). */
  const addToSnapshot = useCallback((key: string, after?: string) => {
    setSnapshot((keys) => {
      if (!keys || keys.includes(key)) return keys
      const at = after ? keys.indexOf(after) : -1
      return at < 0 ? [key, ...keys] : [...keys.slice(0, at + 1), key, ...keys.slice(at + 1)]
    })
  }, [])

  /**
   * Sorting reorders the rows shown, without filtering again. The order is set when the
   * snapshot is taken or the sort changes, so an edit (a new Changed time) doesn't move rows.
   */
  const setSort = useCallback((next: Sort) => {
    setSortState(next)
    const list = latest.current.items
    if (list) setSnapshot((keys) => keys && ordered(keys, list, next))
  }, [])

  // Rows: the snapshot's items that still exist (deleted ones leave at once), in its order.
  const rows = useMemo(() => {
    if (!snapshot || !items) return []
    return snapshot.flatMap((key) => {
      const item = items.get(key)
      return item ? [{ key, item, ...itemFields(item) }] : []
    })
  }, [snapshot, items])
  const stale = useMemo(() => rows.filter((r) => !matches(r, query)).length, [rows, query])

  // The selection only holds rows that are shown.
  const shownSelected = useMemo(() => new Set(rows.filter((r) => selected.has(r.key)).map((r) => r.key)), [rows, selected])

  return {
    view,
    query,
    rows,
    stale,
    ready: snapshot !== null,
    refreshes,
    sort,
    setSort,
    selected: shownSelected,
    setSelected,
    setQuery,
    showAll,
    showSaved,
    becameSaved,
    refresh,
    addToSnapshot,
  }
}
