/**
 * Planning a scene, or editing the current one (docs/design/scenes/spec.md, section 4). It works
 * on a draft (./scenes.ts): nothing reaches the game until Save.
 */
import { useId, useState } from 'react'
import { useOptionalTemplateStores } from '../app/template-store-context'
import { Modal } from '../components/Modal'
import type { LibraryItem } from '../library/registry'
import { countsText, presetOf, TRACKER_PRESETS, type TrackerCounts } from '../rules/trackers'
import type { Zone } from '../rules/types'
import { challengeFromTemplate, groupFromTemplate, templateFromChallenge, templateFromGroup } from '../template/to-table'
import type { ChallengeTemplate, EnvironmentTemplate, MinionTemplate } from '../template/model'
import type { Villain } from '../villain/model'
import { AddChallengeDialog, AddGroupDialog, ConfirmDialog, NameDialog } from './dialogs'
import { environmentFromTemplate } from './environment'
import { BringInTab, type BringIn, type QuickAddKind } from './GmScreen'
import { MAX_BOXES, sceneNumber, sceneOnTable, trackerFromCounts, type Game, type SceneItem, type SceneItemSource } from './model'
import { asideChips, draftAddChallenge, draftAddGroup, draftAddVillain, draftOfCurrent, draftOfNew, draftOfPlanned, draftSetEnvironment, findItem, hasChanged, itemKind, itemTitle, refKey, sameRef, sourceText, type SceneDraft } from './scenes'
import { TrackerBoxes } from './ScenesTab'
import { boxLabel, newEnvironment } from './table'
import { foundAttached, useLibraryItems } from './useLibraryItems'
import { validCounts } from './validate'
import { BringInVillainDialog } from './VillainDialogs'
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

/** Which scene the editor is for. */
export type EditorTarget = { kind: 'current' } | { kind: 'planned'; sceneId: string } | { kind: 'new' }

export interface SceneEditorProps {
  game: Game
  target: EditorTarget
  clock: () => Clock
  /** `restart`: the tracker goes back to its first box (the current scene only). */
  onSave: (draft: SceneDraft, restart: boolean) => void
  onDelete?: () => void
  onClose: () => void
}

type EditorDialog =
  | { kind: 'keepBox' }
  | { kind: 'quickEnvironment' }
  | { kind: 'library' }
  | { kind: 'libraryEnvironment' }
  | { kind: 'quick'; which: QuickAddKind }
  | { kind: 'remove'; row: SceneItem; name: string }
  | { kind: 'delete' }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function SceneEditor({ game, target, clock, onSave, onDelete, onClose }: SceneEditorProps) {
  const id = useId()
  const current = target.kind === 'current'
  const [draft, setDraft] = useState<SceneDraft>(() => (current ? draftOfCurrent(game) : target.kind === 'planned' ? draftOfPlanned(game, target.sceneId) : draftOfNew(game)))
  const [dialog, setDialog] = useState<EditorDialog | null>(null)
  const [tag, setTag] = useState('')
  // A villain being added: its dialog opens over the library list, which keeps its search.
  const [adding, setAdding] = useState<Villain | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const { items } = useLibraryItems()
  const templates = useOptionalTemplateStores()
  const change = (patch: Partial<SceneDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const number = target.kind === 'planned' ? sceneNumber(game, target.sceneId) : current ? sceneNumber(game, game.currentSceneId) : game.scenes.length + 1
  const table = sceneOnTable(game)
  const valid = validCounts(draft.tracker)
  const hiddenWord = current ? 'Hidden' : 'Starts hidden'
  const hiddenCount = draft.rows.filter((r) => r.startHidden).length
  const removeRow = (row: SceneItem) => change({ rows: draft.rows.filter((r) => !sameRef(r.ref, row.ref)) })
  const askRemove = (row: SceneItem) => {
    const item = findItem(game, row.ref, draft.copies)
    if (item && row.source.kind !== 'aside' && hasChanged(item, row.ref)) setDialog({ kind: 'remove', row, name: itemTitle(item, row.ref) })
    else removeRow(row)
  }
  const envId = draft.environment?.id ?? ''
  const environments = [...game.offTable.environments, ...draft.copies.environments]
  const save = () => {
    if (!valid) return
    const moved = trackerFromCounts(draft.tracker).join() !== table.tracker.join()
    if (current && moved && table.position > 0) setDialog({ kind: 'keepBox' })
    else onSave(draft, false)
  }
  const keptBox = Math.min(table.position, trackerFromCounts(draft.tracker).length - 1)

  // ---- Adding ----

  const libraryKinds = (key: string) => key !== 'hero' && key !== 'environment'
  // Every villain and template with the tag: an environment fills the scene's, if it has none.
  const tagged = (tagName: string) => (items ?? []).filter((i) => i.type.key !== 'hero' && i.doc.tags.includes(tagName))
  const tags = [...new Set((items ?? []).filter((i) => i.type.key !== 'hero').flatMap((i) => i.doc.tags))].sort((a, b) => a.localeCompare(b))
  /** A library item, as a row with this source: a villain's existing copy if the game has one. */
  const added = (d: SceneDraft, item: LibraryItem, source: SceneItemSource, count?: number): SceneDraft => {
    switch (item.type.key) {
      case 'villain':
        return draftAddVillain(game, d, item.doc as unknown as Villain, { heroCount: Math.max(1, game.heroes.length), source, hidden: true }, clock())
      case 'minion':
      case 'lieutenant': {
        const t = item.doc as unknown as MinionTemplate
        return draftAddGroup(d, groupFromTemplate(t, item.type.key === 'minion' ? 'minions' : 'lieutenants', count ?? t.groupSize, true), source, clock())
      }
      case 'challenge':
        return draftAddChallenge(d, challengeFromTemplate(item.doc as unknown as ChallengeTemplate, true), source, clock())
      default:
        return d
    }
  }
  const chooseLibraryEnvironment = async (t: EnvironmentTemplate) => {
    const made = newEnvironment(environmentFromTemplate(t, await foundAttached(t, templates)), clock())
    setDraft((d) => draftSetEnvironment(d, made))
  }
  const bring: BringIn = {
    only: libraryKinds,
    verb: 'Add',
    placeOf: (item) => {
      if (item.type.key === 'villain') {
        const copy = [...game.villains, ...game.offTable.villains, ...draft.copies.villains].find((v) => v.sourceId === item.doc.id)
        if (copy && draft.rows.some((r) => sameRef(r.ref, { kind: 'villain', id: copy.id }))) return 'added'
        return 'absent'
      }
      return 'absent'
    },
    bringIn: (item, count, quick = false) => {
      const hasCopy = item.type.key === 'villain' && [...game.villains, ...game.offTable.villains, ...draft.copies.villains].some((v) => v.sourceId === item.doc.id)
      if (item.type.key === 'villain' && !quick && !hasCopy) setAdding(item.doc as unknown as Villain)
      else setDraft((d) => added(d, item, { kind: 'library' }, count))
    },
    update: () => {},
  }
  const bringEnvironment: BringIn = {
    only: (key) => key === 'environment',
    verb: 'Use',
    placeOf: () => 'absent',
    bringIn: (item) => {
      setDialog(null)
      void chooseLibraryEnvironment(item.doc as unknown as EnvironmentTemplate)
    },
    update: () => {},
  }
  const saveTemplate = (save: Promise<unknown> | undefined) => {
    setSaveError(null)
    save?.catch((e: unknown) => setSaveError(errorText(e)))
  }
  const aside = asideChips(game).filter((c) => c.ref.kind !== 'environment' && !draft.rows.some((r) => sameRef(r.ref, c.ref)))
  const asideEnvironments = asideChips(game).filter((c) => c.ref.kind === 'environment')

  return (
    <Modal title={current ? `Edit scene ${number}` : `Plan scene ${number}`} onClose={onClose} wide>
      {!current && <p className="gt-sub">Players see nothing here until you start it.</p>}
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
                if (value === 'library') return setDialog({ kind: 'libraryEnvironment' })
                const { environment: _, ...rest } = draft
                const known = value === game.environment?.id ? game.environment : environments.find((x) => x.id === value)
                setDraft(value ? { ...rest, environment: { id: value, hidden: known?.hidden ?? true } } : rest)
              }}
            >
              <option value="">None</option>
              {game.environment && <option value={game.environment.id}>Keep the current one: {game.environment.name}</option>}
              {environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.templateId ? ' (from your library)' : ''}
                  {asideEnvironments.some((c) => c.ref.id === e.id) ? ' (set aside)' : ''}
                </option>
              ))}
              <option value="library">Choose from library…</option>
              <option value="quick">Quick environment (name only)…</option>
            </select>
            {draft.environment && (
              <label className="checkbox">
                <input type="checkbox" checked={draft.environment.hidden} onChange={(e) => change({ environment: { id: envId, hidden: e.target.checked } })} />
                {hiddenWord}
              </label>
            )}
          </div>
        </section>

        <section aria-labelledby={`${id}-opp`} className="gt-editor__section">
          <div className="gt-row">
            <h3 id={`${id}-opp`}>Opposition</h3>
            <span className="gt-sub">
              {draft.rows.length} in the opposition · {hiddenCount} {current ? 'hidden' : 'start hidden'}
            </span>
          </div>
          {draft.rows.length > 0 && (
            <ul className="gt-opp" aria-labelledby={`${id}-opp`}>
              {draft.rows.map((row) => (
                <OppositionRow key={refKey(row.ref)} game={game} draft={draft} row={row} label={hiddenWord} onHidden={(startHidden) => change({ rows: draft.rows.map((r) => (sameRef(r.ref, row.ref) ? { ...r, startHidden } : r)) })} onRemove={() => askRemove(row)} />
              ))}
            </ul>
          )}
          <div className="gt-editor__adds">
            <button type="button" className="button button--small" onClick={() => setDialog({ kind: 'library' })}>
              From library…
            </button>
            <span className="gt-row">
              <select aria-label="Add everything tagged" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">Add everything tagged…</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t} ({tagged(t).length})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button button--small"
                disabled={!tag}
                onClick={() => {
                  setDraft((d) => tagged(tag).reduce((x, item) => added(x, item, { kind: 'tag', tag }), d))
                  const environment = draft.environment ? undefined : tagged(tag).find((i) => i.type.key === 'environment')
                  if (environment) void chooseLibraryEnvironment(environment.doc as unknown as EnvironmentTemplate)
                  setTag('')
                }}
              >
                Add
              </button>
            </span>
            <button type="button" className="button button--small" onClick={() => setDialog({ kind: 'quick', which: 'minions' })}>
              + Minion
            </button>
            <button type="button" className="button button--small" onClick={() => setDialog({ kind: 'quick', which: 'lieutenants' })}>
              + Lieutenant
            </button>
            <button type="button" className="button button--small" onClick={() => setDialog({ kind: 'quick', which: 'challenge' })}>
              + Challenge
            </button>
          </div>
          {game.aside.length > 0 && (
            <div className="gt-editor__adds">
              <span className="gt-sub">Set aside:</span>
              {aside.map((c) => (
                <button
                  key={refKey(c.ref)}
                  type="button"
                  className="gt-scene-chip gt-scene-chip--add"
                  onClick={() => change({ rows: [...draft.rows, { ref: c.ref, startHidden: false, source: { kind: 'aside', ...(c.afterScene ? { afterScene: c.afterScene } : {}) } }] })}
                >
                  + {c.text}
                </button>
              ))}
              {aside.length === 0 && <span className="gt-sub">nothing left</span>}
            </div>
          )}
          {saveError && (
            <p role="alert" className="error">
              Couldn't save it to your library: {saveError}
            </p>
          )}
          {!current && <p className="hint">Library items are copied into this game when you save, and wait off the table until the scene starts.</p>}
        </section>

        <label className="field" htmlFor={`${id}-notes`}>
          <span>Notes · only you</span>
          <textarea id={`${id}-notes`} rows={2} value={draft.notes} onChange={(e) => change({ notes: e.target.value })} />
        </label>
      </div>
      <div className="button-row gt-dialog-actions">
        {onDelete && (
          <button type="button" className="button button--danger gt-editor__delete" onClick={() => setDialog({ kind: 'delete' })}>
            Delete scene…
          </button>
        )}
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
      {dialog?.kind === 'delete' && onDelete && <ConfirmDialog title={`Delete scene ${number}?`} text="The scene goes, with anything only it was holding. Anything set aside stays set aside." confirm="Delete" onConfirm={onDelete} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'quickEnvironment' && <NameDialog title="Quick environment" label="Name" placeholder="Environment" submit="Use this environment" onSubmit={(name) => setDraft((d) => draftSetEnvironment(d, newEnvironment({ name, hidden: true }, clock())))} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'libraryEnvironment' && (
        <Modal title="Choose an environment" onClose={() => setDialog(null)} wide>
          <BringInTab bring={bringEnvironment} />
        </Modal>
      )}
      {dialog?.kind === 'library' && (
        <Modal title="Add from your library" onClose={() => setDialog(null)} wide>
          <BringInTab bring={bring} />
          <div className="button-row gt-dialog-actions">
            <button type="button" className="button button--primary" onClick={() => setDialog(null)}>
              Done
            </button>
          </div>
          {adding && (
            <BringInVillainDialog
              villain={adding}
              heroes={game.heroes.length}
              onClose={() => setAdding(null)}
              onBring={(heroCount, picks) => {
                setAdding(null)
                setDraft((d) => picks.reduce((x, p) => draftAddGroup(x, groupFromTemplate(p.template, p.attachment.kind === 'minion' ? 'minions' : 'lieutenants', p.count, true), { kind: 'library' }, clock()), draftAddVillain(game, d, adding, { heroCount, source: { kind: 'library' }, hidden: true }, clock())))
              }}
            />
          )}
        </Modal>
      )}
      {dialog?.kind === 'quick' &&
        (dialog.which === 'challenge' ? (
          <AddChallengeDialog
            canSave={Boolean(templates)}
            submit="Add to scene"
            onAdd={(c, save) => {
              const t = save && templates ? templateFromChallenge(c) : undefined
              setDraft((d) => draftAddChallenge(d, { ...c, ...(t ? { templateId: t.id } : {}) }, { kind: t ? 'library' : 'quick' }, clock()))
              if (t) saveTemplate(templates?.challenges.save(t))
            }}
            onClose={() => setDialog(null)}
          />
        ) : (
          <AddGroupDialog
            kind={dialog.which}
            canSave={Boolean(templates)}
            submit="Add to scene"
            onAdd={(g, save) => {
              const t = save && templates ? templateFromGroup(g) : undefined
              setDraft((d) => draftAddGroup(d, { ...g, ...(t ? { templateId: t.id } : {}) }, { kind: t ? 'library' : 'quick' }, clock()))
              if (t) saveTemplate((g.kind === 'minions' ? templates?.minions : templates?.lieutenants)?.save(t as never))
            }}
            onClose={() => setDialog(null)}
          />
        ))}
    </Modal>
  )
}
