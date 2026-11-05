/** Settings' Data section (docs/design/settings/spec.md, section 7). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../app/game-store-context'
import { useOptionalJoinedStore } from '../app/joined-store-context'
import { useOptionalSavedSearchStore } from '../app/saved-search-context'
import { useStore } from '../app/store-context'
import { useOptionalTemplateStores } from '../app/template-store-context'
import { useVillainStore } from '../app/villain-store-context'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../game/dialogs'
import { isSoloGameId } from '../game/solo'
import type { GameList } from '../game/store'
import { formatFull } from '../play/time'
import { backupFileName } from '../transfer/files'
import { downloadFile } from '../transfer/download'
import { useSettings } from './context'
import { DEFAULT_SETTINGS } from './model'
import { alreadyHere, backupText, byteLength, contentCounts, countText, readEverything, readRestoreFile, restoreAdd, restoreReplace, storageLine, type Contents, type DataStores } from './data'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function RestoreDialog({ contents, stores, skipped, onDone, onClose }: { contents: Contents; stores: DataStores; skipped: number; onDone: (text: string) => void; onClose: () => void }) {
  const { update } = useSettings()
  const [here, setHere] = useState<{ label: string; name: string }[] | null>(null)
  const [useSettingsToo, setUseSettingsToo] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [what, setWhat] = useState<{ label: string; count: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void alreadyHere(contents, stores).then((list) => live && setHere(list))
    void readEverything(stores, DEFAULT_SETTINGS).then((c) => live && setWhat(contentCounts(c)))
    return () => {
      live = false
    }
  }, [contents, stores])
  const add = async () => {
    try {
      const added = await restoreAdd(contents, stores)
      if (useSettingsToo && contents.settings) {
        const chosen = contents.settings
        update(() => chosen)
      }
      onDone(`Added ${added} ${added === 1 ? 'item' : 'items'} from the backup.`)
    } catch (e) {
      setError(errorText(e))
    }
  }
  const replace = async () => {
    try {
      await restoreReplace(contents, stores)
      if (contents.settings) {
        const chosen = contents.settings
        update(() => chosen)
      }
      onDone('Replaced everything on this device with the backup.')
    } catch (e) {
      setError(errorText(e))
    }
  }
  const counts = contentCounts(contents)
  return (
    <Modal title="Restore from a backup" onClose={onClose}>
      <p>This backup holds:</p>
      {counts.length ? (
        <ul>
          {counts.map((c) => (
            <li key={c.label}>
              {countText(c)}
            </li>
          ))}
          {contents.settings && <li>This device's settings</li>}
        </ul>
      ) : (
        <p className="muted">Nothing but settings.</p>
      )}
      {skipped > 0 && <p className="hint">{skipped === 1 ? 'One item in it' : `${skipped} items in it`} couldn't be read and will be left out.</p>}
      {here && here.length > 0 && (
        <>
          <p>Adding skips what's already here:</p>
          <ul>
            {here.map((h, i) => (
              <li key={i}>
                {h.name} <span className="muted">({h.label})</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {contents.settings && (
        <label className="checkbox">
          <input type="checkbox" checked={useSettingsToo} onChange={(e) => setUseSettingsToo(e.target.checked)} />
          Also use the backup's settings
        </label>
      )}
      {error && (
        <p role="alert" className="error">
          Couldn't restore: {error}
        </p>
      )}
      <div className="button-row gt-dialog-actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button button--danger" onClick={() => setConfirming(true)}>
          Replace everything…
        </button>
        <button type="button" className="button button--primary" disabled={!here} onClick={() => void add()}>
          Add to what's here
        </button>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Replace everything on this device?"
          text={`This deletes everything here first${what.length ? `: ${what.map(countText).join(', ')}` : ''}. It can't be undone.`}
          confirm="Yes, replace everything"
          onConfirm={() => void replace()}
          onClose={() => setConfirming(false)}
        />
      )}
    </Modal>
  )
}

export function DataSection() {
  const { settings } = useSettings()
  const heroes = useStore()
  const villains = useVillainStore()
  const games = useGameStore()
  const templates = useOptionalTemplateStores()
  const searches = useOptionalSavedSearchStore()
  const joined = useOptionalJoinedStore()
  const stores = useMemo<DataStores>(() => ({ heroes, villains, games, templates, searches, joined }), [heroes, villains, games, templates, searches, joined])
  const [line, setLine] = useState('')
  const [unreadable, setUnreadable] = useState<GameList['unreadable']>([])
  const [deleting, setDeleting] = useState<GameList['unreadable'][number] | null>(null)
  const [restoring, setRestoring] = useState<{ contents: Contents; skipped: number } | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const settingsNow = useRef(settings)
  useEffect(() => {
    settingsNow.current = settings
  })

  const refresh = useCallback(async () => {
    const contents = await readEverything(stores, settingsNow.current)
    setLine(storageLine(contents, byteLength(backupText(contents))))
    setUnreadable((await stores.games.list()).unreadable)
  }, [stores])
  useEffect(() => {
    refresh().catch((e: unknown) => setError(errorText(e)))
  }, [refresh])

  const backUp = async () => {
    setError(null)
    try {
      downloadFile(backupFileName(), backupText(await readEverything(stores, settings)), 'application/json')
    } catch (e) {
      setError(`Couldn't make the backup: ${errorText(e)}`)
    }
  }
  const chosen = async (picked: File) => {
    setError(null)
    const read = readRestoreFile(await picked.text())
    if (read.ok) setRestoring(read)
    else setError(read.error)
  }
  return (
    <section className="card settings__section" aria-labelledby="settings-data">
      <h2 id="settings-data">Data</h2>
      <p className="muted">{line}</p>
      <div className="settings__row">
        <button type="button" className="button" onClick={() => void backUp()}>
          Back up everything
        </button>
        <button type="button" className="button" onClick={() => file.current?.click()}>
          Restore from a backup…
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
