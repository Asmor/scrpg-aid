/**
 * The library's backup reminder, downloads of chosen items, and its empty state's ways to start.
 * Backing up everything and importing later are on the Settings page.
 */
import { useRef, useState, type ReactNode } from 'react'
import { heroPath, navigate } from '../app/route'
import { ImportControl, type ImportHandle } from '../components/ImportControl'
import type { Game } from '../game/model'
import { exampleHero } from '../hero/example'
import type { Hero } from '../hero/model'
import { downloadFile } from '../transfer/download'
import { backupJson } from '../transfer/files'
import type { Villain } from '../villain/model'
import { templateListsOf } from './send-text'
import { backupStatus, type BackupTimeStore } from './backup-time'
import { heroType, type LibraryItem, type LibraryStores, type LibraryType } from './registry'
import type { SavedSearch } from './saved-searches'
import type { LibraryState } from './useLibraryData'

/** Downloads items in the backup format, with any games and saved searches. */
export function downloadItems(list: readonly LibraryItem[], fileName: string, extras: { games: readonly Game[]; savedSearches: readonly SavedSearch[] }) {
  const of = (key: LibraryType['backupKey']) => list.filter((i) => i.type.backupKey === key).map((i) => i.doc)
  const contents = { heroes: of('heroes') as unknown as Hero[], villains: of('villains') as unknown as Villain[], games: [...extras.games], savedSearches: [...extras.savedSearches], templates: templateListsOf(of) }
  downloadFile(fileName, backupJson(contents), 'application/json')
}

/** What the header needs to know about backups: read once, as a page opens. */
export function useBackupStatus(docs: readonly { updatedAt: string }[], backupTime: BackupTimeStore, now: Date) {
  const [lastBackupAt] = useState(() => backupTime.load())
  return backupStatus(docs, lastBackupAt, now)
}

interface LibraryStartOptions {
  stores: LibraryStores
  /** The library, once it has loaded. */
  ready: Extract<LibraryState, { status: 'ready' }> | undefined
  /** The page is busy with something else. */
  busy: boolean
  /** Runs an action, showing "Couldn't <what>" if it fails. */
  run: (what: string, action: () => Promise<void>) => Promise<void>
  onImported: () => void
}

/** The empty library's ways to start: an example hero, or importing a file. Settings has the same for later. */
export function useLibraryStart({ stores, ready, busy, run, onImported }: LibraryStartOptions): { start: LibraryStart; importControl: ReactNode } {
  const [importing, setImporting] = useState(false)
  const importer = useRef<ImportHandle>(null)
  const items = ready ? [...ready.items.values()] : []
  const addExample = () =>
    void run('add the example hero', async () => {
      const hero = exampleHero()
      await heroType.save(stores, hero)
      navigate(heroPath(hero.id))
    })

  const heroIds = (list: readonly { type: LibraryType; id: string }[]) => list.filter((i) => i.type.key === 'hero').map((i) => i.id)
  const importControl = ready && (
    <ImportControl
      ref={importer}
      hideButton
      savedIds={new Set([...heroIds(items.map((i) => ({ type: i.type, id: i.doc.id }))), ...heroIds(ready.unreadable)])}
      unreadableIds={new Set(heroIds(ready.unreadable))}
      disabled={busy}
      onBusyChange={setImporting}
      onImported={onImported}
    />
  )
  return { start: { busy: busy || importing || !ready, importFile: () => importer.current?.open(), addExample }, importControl }
}

export interface LibraryStart {
  busy: boolean
  importFile: () => void
  addExample: () => void
}
