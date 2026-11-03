/**
 * The home screen: the library (docs/design/library/spec.md). One table of everything the user
 * has made, filtered by name, type and tags, with saved searches in the rail. The rows shown
 * are a snapshot of the view (./useLibraryView.ts), so editing an item never moves rows.
 */
import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../app/route'
import { useNewHeroes } from '../app/new-heroes'
import { useStore } from '../app/store-context'
import { useVillainStore } from '../app/villain-store-context'
import { useGameStore } from '../app/game-store-context'
import { gamesHolding, useListedGames } from '../game/useGameEditor'
import { Modal } from '../components/Modal'
import { useMediaQuery } from '../components/useMediaQuery'
import { useTick } from '../play/useTick'
import type { ThemePreference } from '../theme/theme'
import { downloadFile } from '../transfer/download'
import { localBackupTime, type BackupTimeStore } from './backup-time'
import { LibraryHeader } from './LibraryHeader'
import { PopoverGroup } from './Popover'
import { defaultSearchName, isFiltered, matches, type LibraryQuery } from './query'
import { itemFields, LIBRARY_TYPES, libraryType, type LibraryItem, type LibraryStores, type LibraryType } from './registry'
import { checkSearchName, createSavedSearch, type SavedSearch, type SavedSearchStore } from './saved-searches'
import { allTags, withoutTag, withTag } from './tags'
import { itemKey, useLibraryData } from './useLibraryData'
import { downloadItems, useDataMenu } from './useDataMenu'
import { useLibraryView } from './useLibraryView'
import { DesktopLibrary } from './DesktopLibrary'
import { PhoneLibrary } from './PhoneLibrary'
import { exportFileName, nameList } from './names'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** A deletion waiting for confirmation: one item or the selection. */
interface PendingDelete {
  keys: string[]
}

export interface LibraryProps {
  theme: ThemePreference
  setTheme: (t: ThemePreference) => void
  searchStore: SavedSearchStore
  backupTime?: BackupTimeStore
}

/** Everything the desktop and phone layouts share. */
export type LibraryModel = ReturnType<typeof useLibraryModel>

function useLibraryModel({ searchStore, backupTime }: { searchStore: SavedSearchStore; backupTime: BackupTimeStore }) {
  const heroes = useStore()
  const villains = useVillainStore()
  const games = useGameStore()
  const stores: LibraryStores = useMemo(() => ({ heroes, villains, games }), [heroes, villains, games])
  const newHeroes = useNewHeroes()
  const data = useLibraryData(stores, searchStore)
  // Games aren't library rows, but rows say which games hold a copy, and backups include them.
  const listed = useListedGames()
  const gameList = listed.games ?? []
  const ready = data.state.status === 'ready' ? data.state : undefined
  const view = useLibraryView(ready?.items, ready?.searches)
  const now = useTick()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const items = useMemo(() => [...(ready?.items.values() ?? [])], [ready])
  const tags = useMemo(() => allTags(items.map((i) => i.doc)), [items])
  const searches = useMemo(() => [...(ready?.searches ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })), [ready])
  const typesInUse = useMemo(() => LIBRARY_TYPES.filter((t) => items.some((i) => i.type === t)), [items])

  const run = async (what: string, action: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (e) {
      setError(`Couldn't ${what}: ${errorText(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const item = (key: string) => ready?.items.get(key)

  /** Changes an item's tags: a change to the document, so it's saved with a new updatedAt. */
  const changeTags = (key: string, change: (tags: string[]) => string[]) => {
    // The latest copy, so two quick edits to one item don't overwrite each other.
    const it = data.current()?.items.get(key)
    if (!it) return Promise.resolve()
    const tagsNow = change(it.doc.tags)
    if (tagsNow.length === it.doc.tags.length && tagsNow.every((t, i) => t === it.doc.tags[i])) return Promise.resolve()
    return data.saveDoc(it.type, { ...it.doc, tags: tagsNow, updatedAt: new Date().toISOString() })
  }
  const addTag = (key: string, tag: string) => void run('add the tag', () => changeTags(key, (t) => withTag(t, tag)))
  const removeTag = (key: string, tag: string) => void run('remove the tag', () => changeTags(key, (t) => withoutTag(t, tag)))
  const bulkAddTag = (tag: string) =>
    void run('add the tag', async () => {
      for (const key of view.selected) await changeTags(key, (t) => withTag(t, tag))
    })
  const bulkRemoveTag = (tag: string) =>
    void run('remove the tag', async () => {
      for (const key of view.selected) await changeTags(key, (t) => withoutTag(t, tag))
    })

  const exportItems = (keys: readonly string[]) => {
    setError(null)
    try {
      const list = keys.flatMap((k) => item(k) ?? [])
      if (list.length === 1) {
        const file = list[0]!.type.exportFile(list[0]!.doc)
        downloadFile(file.name, file.text, 'application/json')
      } else downloadItems(list, exportFileName(), { games: [], savedSearches: [] })
    } catch (e) {
      setError(`Couldn't export: ${errorText(e)}`)
    }
  }

  const duplicate = (key: string) =>
    void run('duplicate it', async () => {
      const it = item(key)
      if (!it) return
      const copy = it.type.duplicate(it.doc)
      await data.saveDoc(it.type, copy)
      view.addToSnapshot(itemKey(it.type.key, copy.id), key)
    })

  const confirmDelete = () =>
    void run('delete', async () => {
      if (!pendingDelete) return
      for (const key of pendingDelete.keys) {
        const it = item(key)
        if (it) await data.removeDoc(it.type, it.doc.id)
      }
      setPendingDelete(null)
      view.setSelected(new Set())
    })

  const create = (type: LibraryType) =>
    void run(`start a new ${type.label.toLowerCase()}`, async () => {
      const path = await type.create!({ stores, newHeroes })
      navigate(path)
    })
  const saveSearch = async (name: string): Promise<string | undefined> => {
    const checked = checkSearchName(name, searches)
    if (!checked.ok) return checked.error
    const search = createSavedSearch(checked.name, view.query)
    try {
      await data.saveSearch(search)
    } catch (e) {
      return `Couldn't save the search: ${errorText(e)}`
    }
    view.becameSaved(search.id)
    return undefined
  }
  const renameSearch = async (search: SavedSearch, name: string): Promise<string | undefined> => {
    const checked = checkSearchName(name, searches, search.id)
    if (!checked.ok) return checked.error
    try {
      await data.saveSearch({ ...search, name: checked.name })
    } catch (e) {
      return `Couldn't rename the search: ${errorText(e)}`
    }
    return undefined
  }
  const deleteSearch = (search: SavedSearch) =>
    void run('delete the search', async () => {
      await data.removeSearch(search.id)
      if (view.view.kind === 'saved' && view.view.id === search.id) view.showAll()
    })
  const removeUnreadable = (type: LibraryType, id: string) => void run('delete it', () => data.removeDoc(type, id))

  const { dataActions, importControl } = useDataMenu({
    stores,
    ready,
    games: gameList,
    backupTime,
    now,
    busy,
    run,
    setError,
    onImported: () => {
      // The new items appear (docs/design/library/spec.md, "Stability").
      void data.reload().then((next) => {
        if (next.status === 'ready') view.refresh(next.items, next.searches)
      })
      listed.reload()
    },
  })

  const heroName = (id: string) => item(itemKey('hero', id))?.row.name

  const title = view.view.kind === 'all' ? 'All' : view.view.kind === 'saved' ? (searches.find((s) => s.id === (view.view as { id: string }).id)?.name ?? 'All') : 'Search results'
  const suggestedName = defaultSearchName(view.query, (t) => libraryType(t)?.plural ?? t)

  // Escape clears the selection (a popover or dialog takes Escape first).
  const { selected, setSelected } = view
  useEffect(() => {
    if (selected.size === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, setSelected])

  const deleteDialog = pendingDelete && (
    <DeleteDialog names={pendingDelete.keys.flatMap((k) => item(k)?.row.name ?? [])} busy={busy} onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} />
  )

  return {
    state: data.state,
    ready,
    view,
    items,
    tags,
    searches,
    typesInUse,
    now,
    busy,
    error,
    title,
    suggestedName,
    dataActions,
    heroName,
    importControl,
    deleteDialog,
    countFor: (query: LibraryQuery) => items.filter((i) => matches(itemFields(i), query)).length,
    /** The games holding a copy of an item (the In games column). */
    inGames: (item: LibraryItem) => gamesHolding(gameList, item.type.inGames, item.doc.id),
    gameCount: listed.games?.length,
    addTag,
    removeTag,
    bulkAddTag,
    bulkRemoveTag,
    exportItems,
    duplicate,
    askDelete: (keys: string[]) => setPendingDelete({ keys }),
    create,
    addExample: dataActions.addExample,
    saveSearch,
    renameSearch,
    deleteSearch,
    removeUnreadable,
    filtered: isFiltered(view.query),
  }
}

/** Confirms deleting one item or several, naming up to five. */
export function DeleteDialog({ names, busy, onConfirm, onCancel }: { names: readonly string[]; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const one = names.length === 1
  return (
    <Modal title={one ? `Delete ${names[0]}?` : `Delete ${names.length} items?`} onClose={onCancel}>
      {!one && <p>{nameList(names)}</p>}
      <p>This can't be undone.</p>
      <div className="button-row">
        <button type="button" className="button button--danger" disabled={busy} onClick={onConfirm}>
          Yes, delete
        </button>
        <button type="button" className="button" disabled={busy} onClick={onCancel}>
          Keep
        </button>
      </div>
    </Modal>
  )
}

export function LibraryPage({ theme, setTheme, searchStore, backupTime }: LibraryProps) {
  const [fallbackTime] = useState(() => backupTime ?? localBackupTime())
  const model = useLibraryModel({ searchStore, backupTime: fallbackTime })
  const phone = useMediaQuery('(max-width: 759.98px)', false)
  return (
    <PopoverGroup>
      <div className="library">
        <LibraryHeader phone={phone} theme={theme} setTheme={setTheme} data={model.dataActions} heroName={model.heroName} now={model.now} section="library" {...(model.gameCount !== undefined ? { gameCount: model.gameCount } : {})} />
        {phone ? <PhoneLibrary model={model} /> : <DesktopLibrary model={model} />}
        {model.deleteDialog}
      </div>
    </PopoverGroup>
  )
}

