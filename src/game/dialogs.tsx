/**
 * The game table's small dialogs: quick add, the environment, the GM's hero
 * changes, a member's mod, fixing the turn order, and Update from library. Each is a Modal (focus in, and back out).
 */
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Modal } from '../components/Modal'
import type { PlayMod, PlayTwist } from '../hero/model'
import { ModForm } from '../play/ModForm'
import { DICE } from '../rules/dice'
import type { Die } from '../rules/types'
import { MAX_GROUP_SIZE, MAX_STEPS, type ActorRef, type Game, type NpcGroup } from './model'
import { actorKey, sameActor } from './table'
import type { DiffSection } from './sheet-diff'
import { MAX_NAME } from '../session/protocol'

function Actions({ submit, onCancel, disabled = false }: { submit: string; onCancel: () => void; disabled?: boolean }) {
  return (
    <div className="button-row gt-dialog-actions">
      <button type="button" className="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="button button--primary" disabled={disabled}>
        {submit}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {children(id)}
    </label>
  )
}

/** A whole number from a field, if it's one within the range. */
function whole(text: string, min: number, max: number): number | undefined {
  const n = Number(text)
  return text.trim() !== '' && Number.isInteger(n) && n >= min && n <= max ? n : undefined
}

const submitWith = (fn: () => void) => (e: FormEvent) => {
  e.preventDefault()
  fn()
}

function HiddenBox({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      Hidden from players until revealed
    </label>
  )
}

/** "Save to library" in a quick-add dialog: shown only where the templates can be saved. */
function SaveBox({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      Save to library
    </label>
  )
}

/** + Minion or + Lieutenant: one group whose members all have the same die. */
export function AddGroupDialog({ kind, onAdd, onClose, canSave = false, submit = 'Add to table' }: { kind: NpcGroup['kind']; onAdd: (group: { kind: NpcGroup['kind']; name: string; die: Die; count: number; hidden: boolean }, save: boolean) => void; onClose: () => void; canSave?: boolean; submit?: string }) {
  const [save, setSave] = useState(false)
  const [name, setName] = useState('')
  const [die, setDie] = useState<Die>(kind === 'minions' ? 'd6' : 'd8')
  const [count, setCount] = useState('3')
  const [hidden, setHidden] = useState(true)
  const n = whole(count, 1, MAX_GROUP_SIZE)
  return (
    <Modal title={kind === 'minions' ? 'Add minions' : 'Add lieutenants'} onClose={onClose}>
      <form className="gt-form" onSubmit={submitWith(() => n !== undefined && (onAdd({ kind, name, die, count: n, hidden }, save), onClose()))}>
        <Field label="Name">{(id) => <input id={id} type="text" value={name} placeholder={kind === 'minions' ? 'Minions' : 'Lieutenants'} onChange={(e) => setName(e.target.value)} />}</Field>
        <div className="gt-form__pair">
          <Field label="Die">
            {(id) => (
              <select id={id} value={die} onChange={(e) => setDie(e.target.value as Die)}>
                {DICE.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="How many">{(id) => <input id={id} type="number" inputMode="numeric" min={1} max={MAX_GROUP_SIZE} value={count} onChange={(e) => setCount(e.target.value)} />}</Field>
        </div>
        {n === undefined && <p className="error">How many should be 1 to {MAX_GROUP_SIZE}.</p>}
        <HiddenBox value={hidden} onChange={setHidden} />
        {canSave && <SaveBox value={save} onChange={setSave} />}
        <Actions submit={submit} onCancel={onClose} disabled={n === undefined} />
      </form>
    </Modal>
  )
}

export function AddChallengeDialog({ onAdd, onClose, canSave = false, submit = 'Add to table' }: { onAdd: (challenge: { name: string; steps: number; hidden: boolean }, save: boolean) => void; onClose: () => void; canSave?: boolean; submit?: string }) {
  const [save, setSave] = useState(false)
  const [name, setName] = useState('')
  const [steps, setSteps] = useState('3')
  const [hidden, setHidden] = useState(true)
  const n = whole(steps, 1, MAX_STEPS)
  return (
    <Modal title="Add a challenge" onClose={onClose}>
      <form className="gt-form" onSubmit={submitWith(() => n !== undefined && (onAdd({ name, steps: n, hidden }, save), onClose()))}>
        <Field label="Name">{(id) => <input id={id} type="text" value={name} placeholder="Challenge" onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Number of steps">{(id) => <input id={id} type="number" inputMode="numeric" min={1} max={MAX_STEPS} value={steps} onChange={(e) => setSteps(e.target.value)} />}</Field>
        {n === undefined && <p className="error">Steps should be 1 to {MAX_STEPS}.</p>}
        <HiddenBox value={hidden} onChange={setHidden} />
        {canSave && <SaveBox value={save} onChange={setSave} />}
        <Actions submit={submit} onCancel={onClose} disabled={n === undefined} />
      </form>
    </Modal>
  )
}

/** ⋯ Edit steps…: renames a challenge's steps. */
export function EditStepsDialog({ name, labels, onSave, onClose }: { name: string; labels: readonly string[]; onSave: (labels: string[]) => void; onClose: () => void }) {
  const [draft, setDraft] = useState([...labels])
  return (
    <Modal title={`Steps of ${name}`} onClose={onClose}>
      <form className="gt-form" onSubmit={submitWith(() => (onSave(draft), onClose()))}>
        {draft.map((label, i) => (
          <Field key={i} label={`Step ${i + 1}`}>
            {(id) => <input id={id} type="text" maxLength={MAX_NAME} value={label} onChange={(e) => setDraft((all) => all.map((l, j) => (j === i ? e.target.value : l)))} />}
          </Field>
        ))}
        <Actions submit="Save" onCancel={onClose} />
      </form>
    </Modal>
  )
}

export function EnvironmentDialog({ current, onSet, onClose }: { current?: string; onSet: (environment: { name: string; hidden: boolean }) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [hidden, setHidden] = useState(true)
  return (
    <Modal title="Set environment" onClose={onClose}>
      <form className="gt-form" onSubmit={submitWith(() => (onSet({ name, hidden }), onClose()))}>
        {current && <p className="hint">This replaces {current}: a game has one environment.</p>}
        <Field label="Name">{(id) => <input id={id} type="text" value={name} placeholder="Environment" onChange={(e) => setName(e.target.value)} />}</Field>
        <HiddenBox value={hidden} onChange={setHidden} />
        <Actions submit="Set environment" onCancel={onClose} />
      </form>
    </Modal>
  )
}

/** Asks for a name: a quick environment in the scene editor. */
export function NameDialog({ title, label, placeholder, submit, onSubmit, onClose }: { title: string; label: string; placeholder?: string; submit: string; onSubmit: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  return (
    <Modal title={title} onClose={onClose}>
      <form className="gt-form" onSubmit={submitWith(() => (onSubmit(name), onClose()))}>
        <Field label={label}>{(id) => <input id={id} type="text" value={name} {...(placeholder ? { placeholder } : {})} onChange={(e) => setName(e.target.value)} />}</Field>
        <Actions submit={submit} onCancel={onClose} />
      </form>
    </Modal>
  )
}

/** A done scene: its summary and notes are all that still change. */
export function SceneRecordDialog({ title, summary, notes, onSave, onClose }: { title: string; summary: string; notes: string; onSave: (record: { summary: string; notes: string }) => void; onClose: () => void }) {
  const [text, setText] = useState(summary)
  const [note, setNote] = useState(notes)
  return (
    <Modal title={title} onClose={onClose}>
      <form className="gt-form" onSubmit={submitWith(() => (onSave({ summary: text, notes: note }), onClose()))}>
        <Field label="Summary">{(id) => <input id={id} type="text" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
        <Field label="Notes · only you">{(id) => <textarea id={id} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <Actions submit="Save" onCancel={onClose} />
      </form>
    </Modal>
  )
}

export function HealthDialog({ name, health, maxHealth, onSet, onClose }: { name: string; health: number; maxHealth?: number; onSet: (value: number) => void; onClose: () => void }) {
  const [value, setValue] = useState(String(health))
  const n = whole(value, 0, maxHealth ?? 999)
  return (
    <Modal title={`Change ${name}'s Health`} onClose={onClose}>
      <form className="gt-form" onSubmit={submitWith(() => n !== undefined && (onSet(n), onClose()))}>
        <Field label={maxHealth !== undefined ? `Health (0 to ${maxHealth})` : 'Health'}>{(id) => <input id={id} type="number" inputMode="numeric" min={0} max={maxHealth} value={value} onChange={(e) => setValue(e.target.value)} />}</Field>
        <Actions submit="Change Health" onCancel={onClose} disabled={n === undefined} />
      </form>
    </Modal>
  )
}

export function ModDialog({ title, onAdd, onClose }: { title: string; onAdd: (mod: Omit<PlayMod, 'id'>) => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <ModForm
        submitLabel="Give"
        onSubmit={(mod) => {
          onAdd(mod)
          onClose()
        }}
      />
    </Modal>
  )
}

export function TwistDialog({ name, onAdd, onClose }: { name: string; onAdd: (twist: Omit<PlayTwist, 'id'>) => void; onClose: () => void }) {
  const [kind, setKind] = useState<PlayTwist['kind']>('minor')
  const [text, setText] = useState('')
  return (
    <Modal title={`Add a twist for ${name}`} onClose={onClose}>
      <form className="gt-form" onSubmit={submitWith(() => text.trim() && (onAdd({ kind, text }), onClose()))}>
        <fieldset className="choice-list">
          <legend>Size</legend>
          {(['minor', 'major'] as const).map((k) => (
            <label key={k} className="checkbox">
              <input type="radio" name="twist-kind" checked={kind === k} onChange={() => setKind(k)} />
              {k === 'minor' ? 'Minor twist' : 'Major twist'}
            </label>
          ))}
        </fieldset>
        <Field label="Twist">{(id) => <input id={id} type="text" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
        <Actions submit="Add twist" onCancel={onClose} disabled={!text.trim()} />
      </form>
    </Modal>
  )
}

export function ConfirmDialog({ title, text, confirm, onConfirm, onClose }: { title: string; text: string; confirm: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p>{text}</p>
      <div className="button-row gt-dialog-actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--danger"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirm}
        </button>
      </div>
    </Modal>
  )
}

/** The GM fixing the turn order: who's acting, who has acted, and the round. */
export function FixTurnDialog({
  part,
  game,
  name,
  onCurrent,
  onActed,
  onRound,
  onClose,
}: {
  part: 'current' | 'acted' | 'round'
  game: Game
  name: (ref: ActorRef) => string
  onCurrent: (ref: ActorRef | undefined) => void
  onActed: (ref: ActorRef, acted: boolean) => void
  onRound: (round: number) => void
  onClose: () => void
}) {
  const [round, setRound] = useState(String(game.round))
  const n = whole(round, 0, 999)
  if (part === 'round') {
    return (
      <Modal title="Set the round number" onClose={onClose}>
        <form className="gt-form" onSubmit={submitWith(() => n !== undefined && (onRound(n), onClose()))}>
          <Field label="Round (0 is before the first round)">{(id) => <input id={id} type="number" inputMode="numeric" min={0} value={round} onChange={(e) => setRound(e.target.value)} />}</Field>
          <Actions submit="Set round" onCancel={onClose} disabled={n === undefined} />
        </form>
      </Modal>
    )
  }
  if (part === 'current') {
    return (
      <Modal title="Set who's acting" onClose={onClose}>
        <p className="hint">This only fixes the turn order: a reaction isn't cleared and the scene tracker doesn't move.</p>
        <div className="gt-choices">
          {game.turn.order.map((ref) => (
            <button key={actorKey(ref)} type="button" className="button" aria-pressed={sameActor(ref, game.turn.current)} onClick={() => (onCurrent(ref), onClose())}>
              {name(ref)}
            </button>
          ))}
          <button type="button" className="button" aria-pressed={!game.turn.current} onClick={() => (onCurrent(undefined), onClose())}>
            Nobody
          </button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Who has acted this round" onClose={onClose}>
      <fieldset className="choice-list">
        <legend>Acted this round</legend>
        {game.turn.order.map((ref) => (
          <label key={actorKey(ref)} className="checkbox">
            <input type="checkbox" checked={game.turn.acted.some((a) => sameActor(a, ref))} onChange={(e) => onActed(ref, e.target.checked)} />
            {name(ref)}
          </label>
        ))}
      </fieldset>
      <div className="button-row gt-dialog-actions">
        <button type="button" className="button button--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}

/** A player's sheet update for the GM to review, instead of Update from library: its title, when it was asked, and Decline/Approve. */
export interface SyncReview {
  title: string
  requested: string
  onDecline: () => void
}

/**
 * "Update Gravelord from your library?" (docs/design/game-table/spec.md, section 9): what changed
 * on the sheet (`sheetDiff`), what happens in this game (`reconcile`'s adjustments, or the line on
 * Health), and that only this game's copy changes. With `review`, a player's sheet update for the
 * GM to approve or decline (section 8).
 */

export function UpdateDialog({ name, changes, adjustments, healthLine, onUpdate, onClose, review }: { name: string; changes: readonly DiffSection[]; adjustments: readonly string[]; healthLine?: string; onUpdate: () => void; onClose: () => void; review?: SyncReview }) {
  const inGame = adjustments.length ? adjustments : healthLine ? [healthLine] : ['Nothing else changes: mods, twists and the rest stay.']
  return (
    <Modal title={review ? review.title : `Update ${name} from your library?`} onClose={onClose}>
      {review && <p className="gt-sub">{review.requested}</p>}
      <h3 className="gt-label">{review ? 'What changed on the sheet' : 'What changed'}</h3>
      {changes.length === 0 ? (
        <p className="gt-sub">Nothing that plays differently: only details like the description changed.</p>
      ) : (
        <dl className="gt-diff">
          {changes.map((c) => (
            <div key={c.section}>
              <dt>{c.section}</dt>
              {c.changes.map((line) => (
                <dd key={line}>{line}</dd>
              ))}
            </div>
          ))}
        </dl>
      )}
      <h3 className="gt-label">What happens in this game</h3>
      <ul className="gt-diff__list">
        {inGame.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="hint">{review ? 'Kept as they are: mods, twists, hero points, reaction and the play log.' : `Only this game's ${name} changes. Other games keep their own copy.`}</p>
      <div className="button-row gt-dialog-actions">
        <button
          type="button"
          className="button"
          onClick={() => {
            review?.onDecline()
            onClose()
          }}
        >
          {review ? 'Decline' : 'Cancel'}
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            onUpdate()
            onClose()
          }}
        >
          {review ? 'Approve' : 'Update'}
        </button>
      </div>
    </Modal>
  )
}
