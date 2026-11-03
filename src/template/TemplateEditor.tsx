/**
 * The template editors (docs/design/npcs/spec.md, section 2, and templates.dc.html): one page
 * each for minions, lieutenants and challenges, with the hero wizard's header pattern. The name
 * is renamed from the header, every change saves straight away, and Revert changes puts the
 * template back as it was when the page opened. No steps.
 */
import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import { listPath } from '../app/route'
import { useTemplateStores } from '../app/template-store-context'
import { AbilityText, ActionIcon, DieIcon } from '../components/icons'
import { Modal } from '../components/Modal'
import { RenameHeading } from '../components/RenameHeading'
import { changedSince, restoreSnapshot } from '../editor/edit-snapshot'
import { useDocumentEditor, type Lookup } from '../editor/useDocumentEditor'
import { DICE } from '../rules/dice'
import type { BasicAction, Die } from '../rules/types'
import type { DocStore } from '../store/doc-store'
import { MAX_GROUP_SIZE, MAX_STEPS, templateName, type ChallengeTemplate, type LieutenantTemplate, type MinionTemplate, type TemplateAbility, type TemplateBase } from './model'
import type { TemplateKind } from './serialize'

const ACTIONS: readonly BasicAction[] = ['attack', 'defend', 'boost', 'hinder', 'overcome']
const ALL_EFFECTS = [...ACTIONS, 'recover' as const]
const ACTION_NAME: Record<BasicAction, string> = { attack: 'Attack', defend: 'Defend', boost: 'Boost', hinder: 'Hinder', overcome: 'Overcome' }
const TYPE_NAME: Record<TemplateAbility['type'], string> = { A: 'Action', R: 'Reaction', I: 'Inherent' }
const KIND_LABEL: Record<TemplateKind, string> = { minion: 'Minion template', lieutenant: 'Lieutenant template', challenge: 'Challenge template' }

type AnyTemplate = MinionTemplate | LieutenantTemplate | ChallengeTemplate

function storeFor(stores: ReturnType<typeof useTemplateStores>, kind: TemplateKind): DocStore<AnyTemplate> {
  return (kind === 'minion' ? stores.minions : kind === 'lieutenant' ? stores.lieutenants : stores.challenges) as unknown as DocStore<AnyTemplate>
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

/** Die icons as radio buttons, each labeled with its size (spec section 8). */
function DiePicker({ value, onChange, label }: { value: Die; onChange: (die: Die) => void; label: string }) {
  const name = useId()
  return (
    <fieldset className="die-picker">
      <legend>{label}</legend>
      {DICE.map((d) => (
        <label key={d} className={d === value ? 'die-picker__option die-picker__option--on' : 'die-picker__option'}>
          <input type="radio" className="visually-hidden" name={name} value={d} checked={d === value} onChange={() => onChange(d)} aria-label={d} />
          <DieIcon die={d} />
        </label>
      ))}
    </fieldset>
  )
}

type Update<T> = (change: (draft: T) => void) => void

/** The usual group size, typed freely; each whole number from 1 to 20 is saved as it's typed. */
function GroupSize({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  // The saved value this field last showed: when it changes from outside (Revert changes), the field shows the new one.
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    setText(String(value))
  }
  const n = Number(text)
  const valid = text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= MAX_GROUP_SIZE
  const hint = useId()
  return (
    <Field label="Usual group size">
      {(id) => (
        <>
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_GROUP_SIZE}
            value={text}
            aria-invalid={!valid || undefined}
            aria-describedby={valid ? undefined : hint}
            onChange={(e) => {
              setText(e.target.value)
              const next = Number(e.target.value)
              if (e.target.value.trim() !== '' && Number.isInteger(next) && next >= 1 && next <= MAX_GROUP_SIZE) {
                setShown(next)
                onChange(next)
              }
            }}
          />
          {!valid && (
            <span id={hint} className="hint">
              A whole number from 1 to {MAX_GROUP_SIZE}.
            </span>
          )}
        </>
      )}
    </Field>
  )
}

function MinionFields({ doc, update }: { doc: MinionTemplate; update: Update<MinionTemplate> }) {
  const any = doc.actions === 'any'
  const chosen = doc.actions === 'any' ? [] : doc.actions
  const name = useId()
  // The actions chosen before switching to Any, so switching back to "Only these" keeps them.
  const [lastChosen, setLastChosen] = useState<BasicAction[]>(['attack'])
  return (
    <>
      <DiePicker label="Starting die" value={doc.die} onChange={(die) => update((d) => void (d.die = die))} />
      <GroupSize value={doc.groupSize} onChange={(n) => update((d) => void (d.groupSize = n))} />
      <fieldset className="template-actions">
        <legend>Can take</legend>
        <label className="checkbox">
          <input
            type="radio"
            name={name}
            checked={any}
            onChange={() => {
              if (chosen.length) setLastChosen(chosen)
              update((d) => void (d.actions = 'any'))
            }}
          />
          Any basic action
        </label>
        <label className="checkbox">
          <input type="radio" name={name} checked={!any} onChange={() => update((d) => void (d.actions = [...lastChosen]))} />
          Only these:
        </label>
        {!any && (
          <div className="template-actions__list">
            {ACTIONS.map((a) => (
              <label key={a} className="checkbox">
                <input
                  type="checkbox"
                  checked={chosen.includes(a)}
                  onChange={(e) =>
                    update((d) => {
                      const list = d.actions === 'any' ? [] : d.actions
                      const next = e.target.checked ? [...list, a] : list.filter((x) => x !== a)
                      // At least one: unchecking the last one keeps it.
                      d.actions = next.length ? ACTIONS.filter((x) => next.includes(x)) : list
                    })
                  }
                />
                <ActionIcon action={a} decorative />
                {ACTION_NAME[a]}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <Field label="Notes">{(id) => <textarea id={id} rows={3} value={doc.notes} onChange={(e) => update((d) => void (d.notes = e.target.value))} />}</Field>
    </>
  )
}

function Abilities({ doc, update }: { doc: LieutenantTemplate; update: Update<LieutenantTemplate> }) {
  return (
    <fieldset className="template-abilities">
      <legend>Abilities</legend>
      {doc.abilities.map((a, i) => (
        <div key={i} className="template-ability">
          <div className="template-ability__head">
            <Field label="Ability name">{(id) => <input id={id} type="text" value={a.name} onChange={(e) => update((d) => void (d.abilities[i]!.name = e.target.value))} />}</Field>
            <Field label="Type">
              {(id) => (
                <select id={id} value={a.type} onChange={(e) => update((d) => void (d.abilities[i]!.type = e.target.value as TemplateAbility['type']))}>
                  {(['A', 'R', 'I'] as const).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_NAME[t]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <Field label="What it does">{(id) => <textarea id={id} rows={2} value={a.text} onChange={(e) => update((d) => void (d.abilities[i]!.text = e.target.value))} />}</Field>
          {a.text.trim() && (
            <p className="template-ability__preview">
              {/* A GM's ability names its actions without dice ("Hinder that hero"), so every action word gets its icon. */}
              <AbilityText text={a.text} actions={ALL_EFFECTS} />
            </p>
          )}
          <button type="button" className="button button--quiet button--small" aria-label={`Remove ${a.name.trim() || `ability ${i + 1}`}`} onClick={() => update((d) => void d.abilities.splice(i, 1))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="button button--small" onClick={() => update((d) => void d.abilities.push({ name: '', type: 'A', text: '' }))}>
        + Add ability
      </button>
    </fieldset>
  )
}

function ChallengeFields({ doc, update }: { doc: ChallengeTemplate; update: Update<ChallengeTemplate> }) {
  return (
    <>
      <Field label="What it is">{(id) => <textarea id={id} rows={2} value={doc.description} onChange={(e) => update((d) => void (d.description = e.target.value))} />}</Field>
      <fieldset className="template-steps">
        <legend>Steps</legend>
        <ol>
          {doc.steps.map((s, i) => (
            <li key={i} className="gt-row">
              <input type="text" aria-label={`Step ${i + 1} (optional label)`} value={s.label} placeholder="Optional label" onChange={(e) => update((d) => void (d.steps[i]!.label = e.target.value))} />
              <button type="button" className="button button--quiet button--small" aria-label={`Remove step ${i + 1}`} disabled={doc.steps.length <= 1} onClick={() => update((d) => void d.steps.splice(i, 1))}>
                Remove
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="button button--small" disabled={doc.steps.length >= MAX_STEPS} onClick={() => update((d) => void d.steps.push({ label: '' }))}>
          + Add step
        </button>
      </fieldset>
      <Field label="When it's done">{(id) => <textarea id={id} rows={2} value={doc.done} onChange={(e) => update((d) => void (d.done = e.target.value))} />}</Field>
    </>
  )
}

export function TemplateEditor({ kind, id }: { kind: TemplateKind; id: string }) {
  const stores = useTemplateStores()
  const store = storeFor(stores, kind)
  const load = useCallback(async (docId: string): Promise<Lookup<AnyTemplate>> => {
    const result = await store.get(docId)
    return result.status === 'found' ? { status: 'found', doc: result.doc } : result
  }, [store])
  const save = useCallback((doc: AnyTemplate) => store.save(doc), [store])
  const { state, update, saveError } = useDocumentEditor<AnyTemplate>(id, load, save)
  // The template as it was when the page opened, for Revert changes.
  const [snapshot, setSnapshot] = useState<AnyTemplate | null>(null)
  const [reverting, setReverting] = useState(false)
  const revertButton = useRef<HTMLButtonElement>(null)
  const loaded = state.status === 'ready' ? state.doc : null
  // The snapshot is the template as first loaded (set while rendering, the first time it's there).
  if (loaded && !snapshot) setSnapshot(structuredClone(loaded))

  if (state.status !== 'ready') {
    return (
      <div className="hero-page">
        <p>
          <a href={listPath}>← Library</a>
        </p>
        {state.status === 'loading' && <p>Loading…</p>}
        {state.status === 'missing' && <p role="alert">There's no saved {kind} with that link. It may have been deleted.</p>}
        {state.status === 'unreadable' && <p role="alert">This {kind} couldn't be read: {state.error}</p>}
        {state.status === 'error' && <p role="alert">Something went wrong loading this {kind}: {state.message}</p>}
      </div>
    )
  }
  const doc = state.doc
  const changed = snapshot !== null && changedSince(snapshot, doc)
  return (
    <div className="hero-editor template-editor">
      <div className="hero-editor__top">
        <a href={listPath}>← Library</a>
      </div>
      <div className="gt-sub">{KIND_LABEL[kind]}</div>
      <div className="hero-editor__name">
        <RenameHeading shown={templateName(doc, kind)} name={doc.name} placeholder={!doc.name.trim()} noun={kind} onRename={(name) => update((d) => void (d.name = name))} />
      </div>
      {saveError && (
        <p role="alert" className="error">
          Your last change couldn't be saved: {saveError}
        </p>
      )}
      <div className="save-note">
        <p role="status">
          <strong>Changes save as you go.</strong> {changed ? 'You have changes since you opened this page.' : 'No changes since you opened this page.'}
        </p>
        <button type="button" className="button" ref={revertButton} aria-disabled={!changed} onClick={() => changed && setReverting(true)}>
          Revert changes
        </button>
      </div>
      <section className="editor-step template-fields" aria-label={KIND_LABEL[kind]}>
        {kind === 'challenge' ? (
          <ChallengeFields doc={doc as ChallengeTemplate} update={update as Update<ChallengeTemplate>} />
        ) : (
          <>
            <MinionFields doc={doc as MinionTemplate} update={update as Update<MinionTemplate>} />
            {kind === 'lieutenant' && <Abilities doc={doc as LieutenantTemplate} update={update as Update<LieutenantTemplate>} />}
          </>
        )}
      </section>
      {reverting && (
        <Modal title="Revert changes?" onClose={() => setReverting(false)}>
          <p>This puts {templateName(doc, kind)} back exactly as it was when you opened this page. Every change since then is lost.</p>
          <div className="button-row">
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                setReverting(false)
                if (snapshot) update((d) => restoreSnapshot(d as TemplateBase, snapshot))
              }}
            >
              Revert changes
            </button>
            <button type="button" className="button" onClick={() => setReverting(false)}>
              Keep changes
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
