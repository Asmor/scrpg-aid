/**
 * The library's data: every item of every type (./registry.ts), the records that couldn't be
 * read, and the saved searches. Changes save straight away and update the items in place.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LibraryItem, LibraryStores, LibraryType, LibraryDoc } from './registry'
import { LIBRARY_TYPES, toItem } from './registry'
import type { SavedSearch, SavedSearchStore } from './saved-searches'

/** An item's key in the library: "<type>:<id>". */
export const itemKey = (type: string, id: string) => `${type}:${id}`

export interface UnreadableItem {
  type: LibraryType
  id: string
  error: string
}

export type LibraryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ReadonlyMap<string, LibraryItem>; unreadable: UnreadableItem[]; searches: SavedSearch[] }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useLibraryData(stores: LibraryStores, searchStore: SavedSearchStore) {
  const [state, setState] = useState<LibraryState>({ status: 'loading' })
  // The latest items, for changes made between renders.
  const latest = useRef<LibraryState>(state)
  const set = useCallback((next: LibraryState) => {
    latest.current = next
    setState(next)
  }, [])

  const load = useCallback(async (): Promise<LibraryState> => {
    try {
      const lists = await Promise.all(LIBRARY_TYPES.map(async (type) => ({ type, ...(await type.list(stores)) })))
      const { searches } = await searchStore.list()
      const items = new Map<string, LibraryItem>()
      const unreadable: UnreadableItem[] = []
      for (const { type, docs, unreadable: bad } of lists) {
        for (const doc of docs) items.set(itemKey(type.key, doc.id), toItem(type, doc))
        for (const u of bad) unreadable.push({ type, ...u })
      }
      return { status: 'ready', items, unreadable, searches }
    } catch (e) {
      return { status: 'error', message: errorText(e) }
    }
  }, [stores, searchStore])

  /** Reads everything again (after an import). Resolves with the new state. */
  const reload = useCallback(async () => {
    const next = await load()
    set(next)
    return next
  }, [load, set])

  useEffect(() => {
    let live = true
    void load().then((next) => live && set(next))
    return () => {
      live = false
    }
  }, [load, set])

  const ready = () => {
    const now = latest.current
    if (now.status !== 'ready') throw new Error('the library is still loading')
    return now
  }

  /** Saves a document (new or changed) and shows it. */
  const saveDoc = useCallback(
    async (type: LibraryType, doc: LibraryDoc) => {
      await type.save(stores, doc)
      const now = ready()
      const items = new Map(now.items)
      items.set(itemKey(type.key, doc.id), toItem(type, doc))
      set({ ...now, items })
    },
    [stores, set],
  )

  const removeDoc = useCallback(
    async (type: LibraryType, id: string) => {
      await type.remove(stores, id)
      const now = ready()
      const items = new Map(now.items)
      items.delete(itemKey(type.key, id))
      set({ ...now, items, unreadable: now.unreadable.filter((u) => !(u.type === type && u.id === id)) })
    },
    [stores, set],
  )

  const saveSearch = useCallback(
    async (search: SavedSearch) => {
      await searchStore.save(search)
      const now = ready()
      set({ ...now, searches: [...now.searches.filter((s) => s.id !== search.id), search] })
    },
    [searchStore, set],
  )

  const removeSearch = useCallback(
    async (id: string) => {
      await searchStore.remove(id)
      const now = ready()
      set({ ...now, searches: now.searches.filter((s) => s.id !== id) })
    },
    [searchStore, set],
  )

  /** The latest ready state, including changes not rendered yet. */
  const current = useCallback(() => (latest.current.status === 'ready' ? latest.current : undefined), [])

  return { state, current, reload, saveDoc, removeDoc, saveSearch, removeSearch }
}
