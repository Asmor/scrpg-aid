/**
 * The header's Data menu (docs/design/library/spec.md, "Page layout"): the backup reminder, Back up
 * everything, Import from a file, and Add an example hero. The Library and Games pages share the
 * header, so both use this.
 */
import { useRef, useState, type ReactNode } from 'react'
import { heroPath, navigate } from '../app/route'
import { ImportControl, type ImportHandle } from '../components/ImportControl'
import type { Game } from '../game/model'
import { exampleHero } from '../hero/example'
import type { Hero } from '../hero/model'
import { downloadFile } from '../transfer/download'
import { backupFileName, backupJson } from '../transfer/files'
import type { Villain } from '../villain/model'
import { backupStatus, type BackupTimeStore } from './backup-time'
import type { DataActions } from './LibraryHeader'
import { heroType, type LibraryItem, type LibraryStores, type LibraryType } from './registry'
import type { SavedSearch } from './saved-searches'
import type { LibraryState } from './useLibraryData'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The time of a backup, as it's made. */
const timestamp = () => new Date().toISOString()

/** Downloads items in the backup format, with any games and saved searches. */
export function downloadItems(list: readonly LibraryItem[], fileName: string, extras: { games: readonly Game[]; savedSearches: readonly SavedSearch[] }) {
  const of = (key: LibraryType['backupKey']) => list.filter((i) => i.type.backupKey === key).map((i) => i.doc)
  const contents = { heroes: of('heroes') as unknown as Hero[], villains: of('villains') as unknown as Villain[], games: [...extras.games], savedSearches: [...extras.savedSearches] }
  downloadFile(fileName, backupJson(contents), 'application/json')
}

interface DataMenuOptions {
  stores: LibraryStores
  /** The library, once it has loaded. */
  ready: Extract<LibraryState, { status: 'ready' }> | undefined
  /** The listed games (a backup of everything has them; solo games belong to their characters' Play pages). */
  games: readonly Game[]
  backupTime: BackupTimeStore
  now: Date
  /** The page is busy with something else. */
  busy: boolean
  /** Runs an action, showing "Couldn't <what>" if it fails. */
  run: (what: string, action: () => Promise<void>) => Promise<void>
  setError: (message: string | null) => void
  onImported: () => void
}

export function useDataMenu({ stores, ready, games, backupTime, now, busy, run, setError, onImported }: DataMenuOptions): { dataActions: DataActions; importControl: ReactNode } {
  const [importing, setImporting] = useState(false)
  const [lastBackupAt, setLastBackupAt] = useState(() => backupTime.load())
  const importer = useRef<ImportHandle>(null)
  const items = ready ? [...ready.items.values()] : []
  const status = backupStatus(items.map((i) => i.doc), lastBackupAt, now)

  const backUp = () => {
    setError(null)
    try {
      downloadItems(items, backupFileName(), { games, savedSearches: ready?.searches ?? [] })
      const at = timestamp()
      backupTime.save(at)
      setLastBackupAt(at)
    } catch (e) {
      setError(`Couldn't make the backup: ${errorText(e)}`)
    }
  }
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

  const dataActions: DataActions = { status, busy: busy || importing || !ready, backUp, importFile: () => importer.current?.open(), addExample }
  return { dataActions, importControl }
}
