/**
 * Planning a scene, or editing the current one (docs/design/scenes/spec.md, section 4). It works
 * on a draft (./scenes.ts): nothing reaches the game until Save.
 */
import { useId, useState } from 'react'
import { Modal } from '../components/Modal'
import { countsText, presetOf, TRACKER_PRESETS, type TrackerCounts } from '../rules/trackers'
import type { Zone } from '../rules/types'
import { ConfirmDialog, NameDialog } from './dialogs'
import { MAX_BOXES, sceneNumber, sceneOnTable, trackerFromCounts, type Game, type SceneItem } from './model'
import { draftOfCurrent, findItem, hasChanged, itemKind, itemTitle, refKey, sameRef, sourceText, type SceneDraft } from './scenes'
import { TrackerBoxes } from './ScenesTab'
import { boxLabel, newEnvironment } from './table'
import { validCounts } from './validate'
import type { Clock } from '../play/state'

const ZONES: { zone: Zone; label: string }[] = [
  { zone: 'green', label: 'GREEN' },
  { zone: 'yellow', label: 'YELLOW' },
  { zone: 'red', label: 'RED' },
]

/** The tracker's four cards, Custom's steppers, and a preview. */
function TrackerPicker({ counts, onChange }: { counts: TrackerCounts; onChange: (c: TrackerCounts) => void }) {
  const id = useId()
  const [picked, setPicked] = useState<'custom' | undefined>(presetOf(counts) ? undefined : 'custom')
  const custom = picked === 'custom'
  const preset = custom ? undefined : presetOf(counts)
  const total = counts.green + counts.yellow + counts.red
  const valid = validCounts(counts)
  return (
    <section aria-labelledby={`${id}-head`} className="gt-editor__section">
      <div className="gt-row">
        <h3 id={`${id}-head`}>Scene tracker</h3>
        <span className="gt-sub">The book's three, or your own. Standard is the default.</span>
      </div>
      <div className="gt-presets" role="radiogroup" aria-labelledby={`${id}-head`}>
        {TRACKER_PRESETS.map((p) => (
          <label key={p.id} className={preset?.id === p.id ? 'gt-preset gt-preset--on' : 'gt-preset'}>
            <input
              type="radio"
              className="visually-hidden"
              name={`${id}-preset`}
              checked={preset?.id === p.id}
              onChange={() => {
                setPicked(undefined)
                onChange({ ...p.counts })
              }}
            />
            <strong>{p.name}</strong>
            <span className="gt-sub">{countsText(p.counts)}</span>
            <TrackerBoxes tracker={p.counts} />
          </label>
        ))}
        <label className={custom ? 'gt-preset gt-preset--on' : 'gt-preset'}>
          <input type="radio" className="visually-hidden" name={`${id}-preset`} checked={custom} onChange={() => setPicked('custom')} />
          <strong>Custom</strong>
          <span className="gt-sub">{countsText(counts)}</span>
          <TrackerBoxes tracker={counts} />
        </label>
      </div>
      {custom && (
        <div className="gt-steppers">
          {ZONES.map(({ zone, label }) => (
            <div key={zone} className="gt-stepper-row">
              <span className={`gt-zone-label zone-${zone}`} id={`${id}-${zone}`}>
                {label}
              </span>
              <div className="stepper" role="group" aria-labelledby={`${id}-${zone}`} {...(valid ? {} : { 'aria-invalid': true })}>
                <button type="button" aria-label={`Fewer ${zone} boxes`} disabled={counts[zone] <= 0} onClick={() => onChange({ ...counts, [zone]: counts[zone] - 1 })}>
                  −
                </button>
                <output aria-live="polite">{counts[zone]}</output>
                <button type="button" aria-label={`More ${zone} boxes`} disabled={counts[zone] >= MAX_BOXES} onClick={() => onChange({ ...counts, [zone]: counts[zone] + 1 })}>
                  +
                </button>
              </div>
            </div>
          ))}
          {!valid && (
            <p role="alert" className="error">
              A tracker needs at least one box.
            </p>
          )}
        </div>
      )}
      <div className="gt-row">
        <span role="img" aria-label={`Tracker: ${counts.green} green, ${counts.yellow} yellow, ${counts.red} red`}>
          <TrackerBoxes tracker={counts} large />
        </span>
        <span className="gt-sub">
          {total} {total === 1 ? 'box' : 'boxes'} · starts at the first
        </span>
      </div>
    </section>
  )
}

function OppositionRow({ game, draft, row, label, onHidden, onRemove }: { game: Game; draft: SceneDraft; row: SceneItem; label: string; onHidden: (hidden: boolean) => void; onRemove: () => void }) {
  const item = findItem(game, row.ref, draft.copies)
  if (!item) return null
  const name = itemTitle(item, row.ref)
  return (
    <li className={row.startHidden ? 'gt-opp-row gt-opp-row--hidden' : 'gt-opp-row'}>
      <span className="gt-grow">
        <strong>{name}</strong> <span className="gt-sub">{itemKind(item, row.ref)}</span>
      </span>
      <span className="tag">{sourceText(row.source)}</span>
      <label className="checkbox">
        <input type="checkbox" checked={row.startHidden} onChange={(e) => onHidden(e.target.checked)} />
        {label}
      </label>
      <button type="button" className="icon-button" aria-label={`Remove ${name} from this scene`} onClick={onRemove}>
        ✕
      </button>
    </li>
  )
}

export interface SceneEditorProps {
  game: Game
  clock: () => Clock
  /** `restart`: the tracker goes back to its first box. */
  onSave: (draft: SceneDraft, restart: boolean) => void
  onClose: () => void
}

export function SceneEditor({ game, clock, onSave, onClose }: SceneEditorProps) {
  const id = useId()
  const [draft, setDraft] = useState<SceneDraft>(() => draftOfCurrent(game))
  const [dialog, setDialog] = useState<{ kind: 'keepBox' } | { kind: 'quickEnvironment' } | { kind: 'remove'; row: SceneItem; name: string } | null>(null)
  const change = (patch: Partial<SceneDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const number = sceneNumber(game, game.currentSceneId)
  const table = sceneOnTable(game)
  const valid = validCounts(draft.tracker)
  const hiddenCount = draft.rows.filter((r) => r.startHidden).length
  const removeRow = (row: SceneItem) => change({ rows: draft.rows.filter((r) => !sameRef(r.ref, row.ref)) })
  const askRemove = (row: SceneItem) => {
    const item = findItem(game, row.ref, draft.copies)
    if (item && row.source.kind !== 'aside' && hasChanged(item, row.ref)) setDialog({ kind: 'remove', row, name: itemTitle(item, row.ref) })
    else removeRow(row)
  }
  const envId = draft.environment?.id ?? ''
  const newEnv = draft.copies.environments.find((e) => e.id === envId)
  const save = () => {
    if (!valid) return
    const moved = trackerFromCounts(draft.tracker).join() !== table.tracker.join()
    if (moved && table.position > 0) setDialog({ kind: 'keepBox' })
    else onSave(draft, false)
  }
  const keptBox = Math.min(table.position, trackerFromCounts(draft.tracker).length - 1)
  return (
    <Modal title={`Edit scene ${number}`} onClose={onClose} wide>
      <div className="gt-editor">
        <label className="field" htmlFor={`${id}-name`}>
          <span>Name</span>
          <input id={`${id}-name`} type="text" value={draft.name} onChange={(e) => change({ name: e.target.value })} />
        </label>

        <TrackerPicker counts={draft.tracker} onChange={(tracker) => change({ tracker })} />

        <section aria-labelledby={`${id}-env`} className="gt-editor__section">
          <h3 id={`${id}-env`}>Environment</h3>
          <div className="gt-row">
            <select
              aria-labelledby={`${id}-env`}
              value={envId}
              onChange={(e) => {
                const value = e.target.value
                if (value === 'quick') return setDialog({ kind: 'quickEnvironment' })
                const { environment: _, ...rest } = draft
                setDraft(value ? { ...rest, environment: { id: value, hidden: draft.environment?.hidden ?? true } } : rest)
              }}
            >
              <option value="">None</option>
              {game.environment && <option value={game.environment.id}>Keep the current one: {game.environment.name}</option>}
              {newEnv && <option value={newEnv.id}>{newEnv.name} (quick)</option>}
              <option value="quick">Quick environment (name only)…</option>
            </select>
            {draft.environment && (
              <label className="checkbox">
                <input type="checkbox" checked={draft.environment.hidden} onChange={(e) => change({ environment: { id: envId, hidden: e.target.checked } })} />
                Hidden
              </label>
            )}
          </div>
        </section>

        <section aria-labelledby={`${id}-opp`} className="gt-editor__section">
          <div className="gt-row">
            <h3 id={`${id}-opp`}>Opposition</h3>
            <span className="gt-sub">
              {draft.rows.length} in the opposition · {hiddenCount} hidden
            </span>
          </div>
          {draft.rows.length > 0 && (
            <ul className="gt-opp" aria-labelledby={`${id}-opp`}>
              {draft.rows.map((row) => (
                <OppositionRow key={refKey(row.ref)} game={game} draft={draft} row={row} label="Hidden" onHidden={(startHidden) => change({ rows: draft.rows.map((r) => (sameRef(r.ref, row.ref) ? { ...r, startHidden } : r)) })} onRemove={() => askRemove(row)} />
              ))}
            </ul>
          )}
        </section>

        <label className="field" htmlFor={`${id}-notes`}>
          <span>Notes · only you</span>
          <textarea id={`${id}-notes`} rows={2} value={draft.notes} onChange={(e) => change({ notes: e.target.value })} />
        </label>
      </div>
      <div className="button-row gt-dialog-actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button button--primary" disabled={!valid} onClick={save}>
          Save
        </button>
      </div>
      {dialog?.kind === 'keepBox' && (
        <Modal title={`Keep the tracker at ${boxLabel(trackerFromCounts(draft.tracker), keptBox)}?`} onClose={() => setDialog(null)}>
          <div className="button-row gt-dialog-actions">
            <button type="button" className="button" onClick={() => onSave(draft, true)}>
              Start over at the first box
            </button>
            <button type="button" className="button button--primary" onClick={() => onSave(draft, false)}>
              Keep
            </button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'remove' && <ConfirmDialog title={`Remove ${dialog.name}?`} text="It has changed since it came in, and those changes go with it." confirm="Remove" onConfirm={() => removeRow(dialog.row)} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'quickEnvironment' && (
        <NameDialog
          title="Quick environment"
          label="Name"
          placeholder="Environment"
          submit="Use this environment"
          onSubmit={(name) => {
            const made = newEnvironment({ name, hidden: true }, clock())
            setDraft({ ...draft, copies: { ...draft.copies, environments: [...draft.copies.environments.filter((e) => e.id !== envId), made] }, environment: { id: made.id, hidden: true } })
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </Modal>
  )
}

