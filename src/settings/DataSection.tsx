/** Settings' Data section (scrpg-aid-designs/settings/spec.md, section 7). */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../app/game-store-context'
import { useOptionalJoinedStore } from '../app/joined-store-context'
import { useOptionalSavedSearchStore } from '../app/saved-search-context'
import { useStore } from '../app/store-context'
import { useOptionalTemplateStores } from '../app/template-store-context'
import { useVillainStore } from '../app/villain-store-context'
import { heroPath, navigate } from '../app/route'
import { ImportControl, type ImportHandle } from '../components/ImportControl'
import { Modal } from '../components/Modal'
import { useMediaQuery } from '../components/useMediaQuery'
import { exampleHero } from '../hero/example'
import { backupStatus, localBackupTime, type BackupTimeStore } from '../library/backup-time'
import { TEMPLATE_LIST_KEYS } from '../template/lists'
import { ConfirmDialog } from '../game/dialogs'
import { isSoloGameId } from '../game/solo'
import type { GameList } from '../game/store'
import { formatFull } from '../play/time'
import { useTick } from '../play/useTick'
import { backupFileName } from '../transfer/files'
import { downloadFile } from '../transfer/download'
import { useSettings } from './context'
import { DEFAULT_SETTINGS } from './model'
import { alreadyHere, backupText, byteLength, readEverything, readRestoreFile, replaceWarning, restoreAdd, restoreReplace, restoreRows, sizeText, storageLine, type Contents, type DataStores } from './data'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** "made Nov 5", with the year when it isn't this one. */
function madeText(iso: string, now = new Date()): string {
  const at = new Date(iso)
  return `made ${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(at.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}) })}`
}

interface RestoreProps {
  contents: Contents
  stores: DataStores
  /** Items in the file that couldn't be read. */
  skipped: number
  /** The file's name and size, and when the backup was made. */
  file: { name: string; size: number; exportedAt?: string }
  onBackUp: () => Promise<void>
  onDone: (text: string) => void
  onClose: () => void
}

/**
 * Restore from a backup (scrpg-aid-designs/settings/spec.md, section 7; restore.dc.html): what's in the
 * backup and what's already here, kind by kind, then Add to what's here or Replace everything. Replace
 * goes to a second step naming what will be deleted, with Back up first. On phones it's a full-screen
 * sheet and the table is a list (section 7a).
 */
function RestoreDialog({ contents, stores, skipped, file, onBackUp, onDone, onClose }: RestoreProps) {
  const { update } = useSettings()
  const phone = useMediaQuery('(max-width: 759.98px)', false)
  const [here, setHere] = useState<{ label: string; name: string }[] | null>(null)
  const [device, setDevice] = useState<Contents | null>(null)
  const [mode, setMode] = useState<'add' | 'replace'>('add')
  const [step, setStep] = useState<'choose' | 'confirm'>('choose')
  const [useSettingsToo, setUseSettingsToo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  useEffect(() => {
    let live = true
    void alreadyHere(contents, stores).then((list) => live && setHere(list))
    void readEverything(stores, DEFAULT_SETTINGS).then((c) => live && setDevice(c))
    return () => {
      live = false
    }
  }, [contents, stores])
  const applyBackupSettings = () => {
    if (!useSettingsToo || !contents.settings) return
    const chosen = contents.settings
    update(() => chosen)
  }
  const rows = here ? restoreRows(contents, here) : []
  const total = rows.reduce((n, r) => n + r.inBackup, 0)
  const adds = total - (here?.length ?? 0)
  const add = async () => {
    try {
      const added = await restoreAdd(contents, stores)
      applyBackupSettings()
      const passed = here?.length ? ` Already here, so skipped: ${here.map((h) => h.name).join(', ')}.` : ''
      onDone(`Added ${added} ${added === 1 ? 'item' : 'items'} from the backup.${passed}`)
    } catch (e) {
      setError(errorText(e))
    }
  }
  const replace = async () => {
    try {
      await restoreReplace(contents, stores)
      applyBackupSettings()
      onDone('Replaced everything on this device with the backup.')
    } catch (e) {
      setError(errorText(e))
    }
  }
  const made = file.exportedAt ? madeText(file.exportedAt) : ''
  const about = [file.name, sizeText(file.size), made].filter(Boolean).join(' · ')
  const failed = error && (
    <p role="alert" className="error">
      Couldn't restore: {error}
    </p>
  )
  if (step === 'confirm') {
    return (
      <Modal title="Replace everything on this device?" onClose={onClose} wide={phone}>
        <p className="muted">{about}</p>
        <p role="alert" className="settings__warn">
          {device ? replaceWarning(contents, device) : 'Reading what\'s on this device…'}
        </p>
        <p>Back up first if you might want them.</p>
        {failed}
        <div className="button-row gt-dialog-actions">
          <button type="button" className="button settings__first" onClick={() => void onBackUp()}>
            Back up first
          </button>
          <button type="button" className="button" onClick={() => setStep('choose')}>
            Back
          </button>
          <button type="button" className="button button--danger" disabled={!device} onClick={() => void replace()}>
            Replace everything
          </button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Restore from a backup" onClose={onClose} wide={phone}>
      <p className="muted">{about}</p>
      {!here ? (
        <p className="muted">Reading what's already here…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Nothing but settings.</p>
      ) : phone ? (
        <ul className="settings__kinds" aria-label="What's in the backup">
          {rows.map((r) => (
            <li key={r.label}>
              <strong>{r.label}</strong>
              <span className="muted">
                {r.inBackup} in the backup · {r.here} already here
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <table className="settings__table" aria-label="What's in the backup">
          <thead>
            <tr>
              <th scope="col">Kind</th>
              <th scope="col">In the backup</th>
              <th scope="col">Already here</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.inBackup}</td>
                <td>{r.here}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {skipped > 0 && <p className="hint">{skipped === 1 ? 'One item in it' : `${skipped} items in it`} couldn't be read and will be left out.</p>}
      <div role="radiogroup" aria-label="How to restore" className="settings__cards settings__cards--stack">
        <label className={mode === 'add' ? 'settings__card settings__card--on' : 'settings__card'}>
          <input type="radio" name={`${id}-mode`} checked={mode === 'add'} onChange={() => setMode('add')} />
          <span>
            <strong>Add to what's here</strong>
            <br />
            <span className="muted">
              {here && here.length > 0 ? `Adds ${adds} ${adds === 1 ? 'item' : 'items'}. ${here.length} ${here.length === 1 ? 'is' : 'are'} already here (same id) and ${here.length === 1 ? 'is' : 'are'} skipped; they're listed after.` : `Adds ${adds} ${adds === 1 ? 'item' : 'items'}.`}
            </span>
          </span>
        </label>
        <label className={mode === 'replace' ? 'settings__card settings__card--on' : 'settings__card'}>
          <input type="radio" name={`${id}-mode`} checked={mode === 'replace'} onChange={() => setMode('replace')} />
          <span>
            <strong>Replace everything</strong>
            <br />
            <span className="muted">Deletes what's on this device first, then restores the backup.</span>
          </span>
        </label>
      </div>
      {contents.settings && (
        <label className="checkbox">
          <input type="checkbox" checked={useSettingsToo} onChange={(e) => setUseSettingsToo(e.target.checked)} />
          Also use the backup's settings
        </label>
      )}
      {failed}
      <div className="button-row gt-dialog-actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        {mode === 'add' ? (
          <button type="button" className="button button--primary" disabled={!here} onClick={() => void add()}>
            {here ? `Add ${adds} ${adds === 1 ? 'item' : 'items'}` : 'Add'}
          </button>
        ) : (
          <button type="button" className="button button--primary" onClick={() => setStep('confirm')}>
            Replace…
          </button>
        )}
      </div>
    </Modal>
  )
}

export function DataSection({ backupTime }: { backupTime?: BackupTimeStore }) {
  const { settings } = useSettings()
  const [backups] = useState(() => backupTime ?? localBackupTime())
  const heroes = useStore()
  const villains = useVillainStore()
  const games = useGameStore()
  const templates = useOptionalTemplateStores()
  const searches = useOptionalSavedSearchStore()
  const joined = useOptionalJoinedStore()
  const stores = useMemo<DataStores>(() => ({ heroes, villains, games, templates, searches, joined }), [heroes, villains, games, templates, searches, joined])
  const [line, setLine] = useState('')
  const [lastBackup, setLastBackup] = useState(() => backups.load())
  const [libraryDocs, setLibraryDocs] = useState<readonly { updatedAt: string }[]>([])
  const [heroIds, setHeroIds] = useState<{ saved: string[]; unreadable: string[] }>({ saved: [], unreadable: [] })
  const importer = useRef<ImportHandle>(null)
  const [unreadable, setUnreadable] = useState<GameList['unreadable']>([])
  const [deleting, setDeleting] = useState<GameList['unreadable'][number] | null>(null)
  const [restoring, setRestoring] = useState<{ contents: Contents; skipped: number; file: RestoreProps['file'] } | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const now = useTick()
  const backup = backupStatus(libraryDocs, lastBackup, now)
  const settingsNow = useRef(settings)
  useEffect(() => {
    settingsNow.current = settings
  })

  const refresh = useCallback(async () => {
    const contents = await readEverything(stores, settingsNow.current)
    setLine(storageLine(contents, byteLength(backupText(contents))))
    setLibraryDocs([...contents.heroes, ...contents.villains, ...TEMPLATE_LIST_KEYS.flatMap((key): readonly { updatedAt: string }[] => contents.templates[key])])
    const heroList = await stores.heroes.list()
    setHeroIds({ saved: [...heroList.heroes.map((h) => h.id), ...heroList.unreadable.map((u) => u.id)], unreadable: heroList.unreadable.map((u) => u.id) })
    setUnreadable((await stores.games.list()).unreadable)
  }, [stores])
  useEffect(() => {
    refresh().catch((e: unknown) => setError(errorText(e)))
  }, [refresh])

  const backUp = async () => {
    setError(null)
    try {
      downloadFile(backupFileName(), backupText(await readEverything(stores, settings)), 'application/json')
      const at = new Date().toISOString()
      backups.save(at)
      setLastBackup(at)
    } catch (e) {
      setError(`Couldn't make the backup: ${errorText(e)}`)
    }
  }
  const addExample = async () => {
    setError(null)
    try {
      const hero = exampleHero()
      await stores.heroes.save(hero)
      navigate(heroPath(hero.id))
    } catch (e) {
      setError(`Couldn't add the example hero: ${errorText(e)}`)
    }
  }
  const chosen = async (picked: File) => {
    setError(null)
    const read = readRestoreFile(await picked.text())
    if (read.ok) setRestoring({ ...read, file: { name: picked.name, size: picked.size, ...(read.exportedAt ? { exportedAt: read.exportedAt } : {}) } })
    else setError(read.error)
  }
  return (
    <section className="card settings__section" aria-labelledby="settings-data">
      <h2 id="settings-data">Data</h2>
      <p className="muted">{line}</p>
      <p className={backup.remind ? 'settings__reminder' : 'muted'}>{backup.text}</p>
      <div className="settings__row">
        <button type="button" className="button" onClick={() => void backUp()}>
          Back up everything
        </button>
        <button type="button" className="button" onClick={() => file.current?.click()}>
          Restore from a backup…
        </button>
        <button type="button" className="button" disabled={importing} onClick={() => importer.current?.open()}>
          Import from a file…
        </button>
        <button type="button" className="button" onClick={() => void addExample()}>
          Add an example hero
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          aria-label="Backup file"
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0]
            e.target.value = ''
            if (picked) void chosen(picked)
          }}
        />
      </div>
      <p className="hint">Import adds one hero, villain, template, game or backup to what's here, asking about anything you already have.</p>
      <ImportControl
        ref={importer}
        hideButton
        savedIds={new Set(heroIds.saved)}
        unreadableIds={new Set(heroIds.unreadable)}
        disabled={false}
        onBusyChange={setImporting}
        onImported={() => {
          refresh().catch((e: unknown) => setError(errorText(e)))
        }}
      />
      <p role="status" className="settings__saved">
        {status}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {unreadable.length > 0 && (
        <div className="settings__field">
          <h3 className="settings__label">Games this version can't read</h3>
          <ul className="settings__list">
            {unreadable.map((u) => (
              <li key={u.id} className="settings__row">
                <span className="settings__grow">
                  <strong>{unreadableName(u)}</strong>
                  <br />
                  <span className="muted">
                    {u.updatedAt ? `Last changed ${formatFull(u.updatedAt)} · ` : ''}
                    {u.error}
                  </span>
                </span>
                <button type="button" className="button button--danger" aria-label={`Delete ${unreadableName(u)}`} onClick={() => setDeleting(u)}>
                  Delete…
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${unreadableName(deleting)}?`}
          text="It can't be read, so nothing in it can be got back."
          confirm="Delete"
          onConfirm={() => {
            void stores.games
              .remove(deleting.id)
              .then(refresh)
              .catch((e: unknown) => setError(errorText(e)))
          }}
          onClose={() => setDeleting(null)}
        />
      )}
      {restoring && (
        <RestoreDialog
          contents={restoring.contents}
          skipped={restoring.skipped}
          file={restoring.file}
          onBackUp={backUp}
          stores={stores}
          onClose={() => setRestoring(null)}
          onDone={(text) => {
            setRestoring(null)
            setStatus(text)
            refresh().catch((e: unknown) => setError(errorText(e)))
          }}
        />
      )}
    </section>
  )
}

const unreadableName = (u: GameList['unreadable'][number]) => {
  const name = u.name ?? 'A game'
  return isSoloGameId(u.id) ? `Solo play · ${u.name ?? 'a character'}` : name
}
