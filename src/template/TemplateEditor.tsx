/**
 * The template editors (docs/design/npcs/spec.md, section 2, and templates.dc.html): one page
 * each for minions, lieutenants, challenges and environments, with the hero wizard's header pattern. The name
 * is renamed from the header, every change saves straight away, and Revert changes puts the
 * template back as it was when the page opened. No steps.
 */
import { SingleColorPicker } from '../colors/ColorPicker'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { listPath, navigate, templatePath } from '../app/route'
import { useTemplateStores } from '../app/template-store-context'
import { AbilityText, ActionIcon, DieIcon } from '../components/icons'
import { DiePicker } from '../components/DiePicker'
import { Modal } from '../components/Modal'
import { RenameHeading } from '../components/RenameHeading'
import { changedSince, restoreSnapshot } from '../editor/edit-snapshot'
import { useDocumentEditor, type Lookup } from '../editor/useDocumentEditor'
import type { BasicAction, Die } from '../rules/types'
import type { DocStore } from '../store/doc-store'
import { createChallengeTemplate, createLieutenantTemplate, createMinionTemplate, createTwist, MAX_ATTACHED, MAX_GROUP_SIZE, MAX_STEPS, MAX_TWISTS, templateName, type AttachedTemplate, type ChallengeTemplate, type EnvironmentTemplate, type EnvironmentTwist, type LieutenantTemplate, type MinionTemplate, type TemplateAbility, type TemplateBase } from './model'
import { filterItems } from '../library/query'
import type { TemplateKind } from './serialize'
import { MAX_NAME, MAX_TEXT } from '../session/protocol'

const ACTIONS: readonly BasicAction[] = ['attack', 'defend', 'boost', 'hinder', 'overcome']
const ALL_EFFECTS = [...ACTIONS, 'recover' as const]
const ACTION_NAME: Record<BasicAction, string> = { attack: 'Attack', defend: 'Defend', boost: 'Boost', hinder: 'Hinder', overcome: 'Overcome' }
const TYPE_NAME: Record<TemplateAbility['type'], string> = { A: 'Action', R: 'Reaction', I: 'Inherent' }
const KIND_LABEL: Record<TemplateKind, string> = { minion: 'Minion template', lieutenant: 'Lieutenant template', challenge: 'Challenge template', environment: 'Environment template' }

type AnyTemplate = MinionTemplate | LieutenantTemplate | ChallengeTemplate | EnvironmentTemplate

function storeFor(stores: ReturnType<typeof useTemplateStores>, kind: TemplateKind): DocStore<AnyTemplate> {
  return { minion: stores.minions, lieutenant: stores.lieutenants, challenge: stores.challenges, environment: stores.environments }[kind] as unknown as DocStore<AnyTemplate>
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
      <Field label="What it is">{(id) => <textarea id={id} rows={2} maxLength={MAX_TEXT} value={doc.description} onChange={(e) => update((d) => void (d.description = e.target.value))} />}</Field>
      <fieldset className="template-steps">
        <legend>Steps</legend>
        <ol>
          {doc.steps.map((s, i) => (
            <li key={i} className="gt-row">
              <input type="text" maxLength={MAX_NAME} aria-label={`Step ${i + 1} (optional label)`} value={s.label} placeholder="Optional label" onChange={(e) => update((d) => void (d.steps[i]!.label = e.target.value))} />
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
      <Field label="When it's done">{(id) => <textarea id={id} rows={2} maxLength={MAX_TEXT} value={doc.done} onChange={(e) => update((d) => void (d.done = e.target.value))} />}</Field>
    </>
  )
}

const ZONES: readonly EnvironmentTwist['zone'][] = ['green', 'yellow', 'red']
const ZONE_NAME: Record<EnvironmentTwist['zone'], string> = { green: 'Green', yellow: 'Yellow', red: 'Red' }

/** A zone's twists, minor before major, each with its place in the full list. */
function zoneTwists(twists: readonly EnvironmentTwist[], zone: EnvironmentTwist['zone']) {
  return twists.flatMap((t, i) => (t.zone === zone ? [{ t, i }] : [])).sort((a, b) => Number(a.t.kind === 'major') - Number(b.t.kind === 'major'))
}

const countText = (list: readonly EnvironmentTwist[]) => {
  const minor = list.filter((t) => t.kind === 'minor').length
  return list.length ? `${minor} minor, ${list.length - minor} major` : 'None yet'
}

function Twists({ doc, update }: { doc: EnvironmentTemplate; update: Update<EnvironmentTemplate> }) {
  const full = doc.twists.length >= MAX_TWISTS
  return (
    <fieldset className="template-twists">
      <legend>Twists</legend>
      <p className="hint">Suggestions for the GM, by zone. The app shows them and tracks which are used, but never applies them.</p>
      {ZONES.map((zone) => {
        const list = zoneTwists(doc.twists, zone)
        return (
          <section key={zone} className="template-twists__zone" aria-label={`${ZONE_NAME[zone]} twists`}>
            <h3 className="gt-row">
              <span className={`zone-chip zone-${zone}`}>{ZONE_NAME[zone]}</span>
              <span className="gt-sub">{countText(list.map((x) => x.t))}</span>
            </h3>
            {list.map(({ t, i }, j) => (
              <fieldset key={t.id} className="template-twist">
                <legend>
                  {ZONE_NAME[zone]} twist {j + 1}
                </legend>
                <div className="template-ability__head">
                  <Field label="Kind">
                    {(id) => (
                      <select id={id} value={t.kind} onChange={(e) => update((d) => void (d.twists[i]!.kind = e.target.value as EnvironmentTwist['kind']))}>
                        <option value="minor">Minor</option>
                        <option value="major">Major</option>
                      </select>
                    )}
                  </Field>
                  <Field label="Zone">
                    {(id) => (
                      <select id={id} value={t.zone} onChange={(e) => update((d) => void (d.twists[i]!.zone = e.target.value as EnvironmentTwist['zone']))}>
                        {ZONES.map((z) => (
                          <option key={z} value={z}>
                            {ZONE_NAME[z]}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                </div>
                <Field label="Name (optional)">
                  {(id) => (
                    <input
                      id={id}
                      type="text"
                      maxLength={MAX_NAME}
                      value={t.name ?? ''}
                      onChange={(e) =>
                        update((d) => {
                          const tw = d.twists[i]!
                          if (e.target.value) tw.name = e.target.value
                          else delete tw.name
                        })
                      }
                    />
                  )}
                </Field>
                <Field label="What happens">{(id) => <textarea id={id} rows={2} maxLength={MAX_TEXT} value={t.text} onChange={(e) => update((d) => void (d.twists[i]!.text = e.target.value))} />}</Field>
                <button type="button" className="button button--quiet button--small" aria-label={`Remove ${ZONE_NAME[zone]} twist ${j + 1}`} onClick={() => update((d) => void d.twists.splice(i, 1))}>
                  Remove
                </button>
              </fieldset>
            ))}
            <button type="button" className="button button--small" disabled={full} onClick={() => update((d) => void d.twists.push(createTwist(zone)))}>
              + Add {ZONE_NAME[zone]} twist
            </button>
          </section>
        )
      })}
    </fieldset>
  )
}

/** A minion, lieutenant or challenge template in the library, as the attach picker and the attached list show it. */
interface Attachable {
  kind: AttachedTemplate['kind']
  id: string
  name: string
  /** Minions and lieutenants have one. */
  die?: Die
  tags: string[]
}

const KIND_WORD: Record<AttachedTemplate['kind'], string> = { minion: 'minion template', lieutenant: 'lieutenant template', challenge: 'challenge template' }

/** The minion, lieutenant and challenge templates in the library, loaded again whenever `reload` changes. */
function useAttachable(reload: number): Attachable[] | null {
  const stores = useTemplateStores()
  const [list, setList] = useState<Attachable[] | null>(null)
  useEffect(() => {
    let current = true
    Promise.all([stores.minions.list(), stores.lieutenants.list(), stores.challenges.list()]).then(
      ([m, l, c]) => {
        if (!current) return
        const of = (kind: 'minion' | 'lieutenant', docs: readonly MinionTemplate[]) => docs.map((d) => ({ kind, id: d.id, name: templateName(d, kind), die: d.die, tags: d.tags }))
        setList([...of('minion', m.docs), ...of('lieutenant', l.docs), ...c.docs.map((d) => ({ kind: 'challenge' as const, id: d.id, name: templateName(d, 'challenge'), tags: d.tags }))])
      },
      () => current && setList([]),
    )
    return () => {
      current = false
    }
  }, [stores, reload])
  return list
}

function Attached({ doc, update }: { doc: EnvironmentTemplate; update: Update<EnvironmentTemplate> }) {
  const stores = useTemplateStores()
  const [picking, setPicking] = useState(false)
  const [reload, setReload] = useState(0)
  const [text, setText] = useState('')
  const all = useAttachable(reload)
  const find = (a: AttachedTemplate) => all?.find((t) => t.kind === a.kind && t.id === a.templateId)
  const attachedAlready = (t: Attachable) => doc.attached.some((a) => a.kind === t.kind && a.templateId === t.id)
  const full = doc.attached.length >= MAX_ATTACHED
  const shown = all ? filterItems(all.map((t) => ({ ...t, type: t.kind })), { text, types: [], tags: [] }) : []
  const attach = (kind: AttachedTemplate['kind'], templateId: string) => update((d) => void d.attached.push({ kind, templateId }))
  // "Make new": a new template, attached straight away, then its editor opens.
  const [makeError, setMakeError] = useState<string | null>(null)
  const makeNew = async (kind: AttachedTemplate['kind']) => {
    const made = kind === 'minion' ? createMinionTemplate() : kind === 'lieutenant' ? createLieutenantTemplate() : createChallengeTemplate()
    try {
      await (kind === 'challenge' ? stores.challenges.save(made as ChallengeTemplate) : kind === 'minion' ? stores.minions.save(made as MinionTemplate) : stores.lieutenants.save(made as LieutenantTemplate))
    } catch (e) {
      setMakeError(`The new ${kind} couldn't be saved: ${e instanceof Error ? e.message : String(e)}`)
      return
    }
    attach(kind, made.id)
    setPicking(false)
    navigate(templatePath(kind, made.id))
  }
  return (
    <fieldset className="template-attached">
      <legend>Its minions, lieutenants and challenges</legend>
      {doc.attached.length === 0 && <p className="hint">None attached. Attached templates can be added to the table on the environment's turn.</p>}
      <ul className="template-attached__list">
        {doc.attached.map((a, i) => {
          const t = find(a)
          const label = t ? t.name : 'Missing template'
          return (
            <li key={`${a.kind}:${a.templateId}:${i}`} className="gt-row">
              {t?.die && <DieIcon die={t.die} size="inline" />}
              {t ? <a href={templatePath(a.kind, a.templateId)}>{t.name}</a> : all && <strong>Missing template</strong>}
              <span className="gt-sub">{t || !all ? KIND_WORD[a.kind] : `This ${KIND_WORD[a.kind]} was deleted from the library.`}</span>
              <button type="button" className="button button--quiet button--small" aria-label={`Remove ${label}`} onClick={() => update((d) => void d.attached.splice(i, 1))}>
                Remove
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        className="button button--small"
        disabled={full}
        onClick={() => {
          setReload((n) => n + 1)
          setText('')
          setMakeError(null)
          setPicking(true)
        }}
      >
        + Attach
      </button>
      {picking && (
        <Modal title="Attach a minion, lieutenant or challenge" onClose={() => setPicking(false)}>
          <Field label="Search">{(id) => <input id={id} type="search" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
          <p className="label">From library</p>
          {all === null ? (
            <p>Loading…</p>
          ) : shown.length === 0 ? (
            <p className="hint">{all.length ? 'Nothing matches.' : 'No minion, lieutenant or challenge templates in your library yet.'}</p>
          ) : (
            <ul className="template-attached__list" aria-label="Minion, lieutenant and challenge templates">
              {shown.map((t) => (
                <li key={`${t.kind}:${t.id}`} className="gt-row">
                  {t.die && <DieIcon die={t.die} size="inline" />}
                  <strong>{t.name}</strong>
                  <span className="gt-sub">{KIND_WORD[t.kind]}</span>
                  <button
                    type="button"
                    className="button button--small"
                    disabled={attachedAlready(t) || full}
                    aria-label={attachedAlready(t) ? `${t.name} is attached` : `Attach ${t.name}`}
                    onClick={() => {
                      attach(t.kind, t.id)
                      setPicking(false)
                    }}
                  >
                    {attachedAlready(t) ? 'Attached' : 'Attach'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="label">Make new</p>
          <div className="button-row">
            <button type="button" className="button button--small" onClick={() => void makeNew('minion')}>
              New minion
            </button>
            <button type="button" className="button button--small" onClick={() => void makeNew('lieutenant')}>
              New lieutenant
            </button>
            <button type="button" className="button button--small" onClick={() => void makeNew('challenge')}>
              New challenge
            </button>
          </div>
          <p className="hint">A new one is attached straight away, and its editor opens.</p>
          {makeError && (
            <p role="alert" className="error">
              {makeError}
            </p>
          )}
        </Modal>
      )}
    </fieldset>
  )
}

function EnvironmentFields({ doc, update }: { doc: EnvironmentTemplate; update: Update<EnvironmentTemplate> }) {
  return (
    <>
      <Field label="Description">{(id) => <textarea id={id} rows={2} maxLength={MAX_TEXT} value={doc.description} onChange={(e) => update((d) => void (d.description = e.target.value))} />}</Field>
      <fieldset className="template-aspects">
        <legend>Aspects (the environment dice)</legend>
        {doc.aspects.map((a, i) => (
          <div key={i} className="template-aspect">
            <Field label={`Aspect ${i + 1}`}>{(id) => <input id={id} type="text" maxLength={MAX_NAME} value={a.name} onChange={(e) => update((d) => void (d.aspects[i]!.name = e.target.value))} />}</Field>
            <DiePicker label={`Aspect ${i + 1} die`} value={a.die} onChange={(die) => update((d) => void (d.aspects[i]!.die = die))} />
          </div>
        ))}
      </fieldset>
      <Twists doc={doc} update={update} />
      <Attached doc={doc} update={update} />
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
        <SingleColorPicker
          item={kind === 'environment' ? { kind: 'environment', color: doc.color } : kind === 'challenge' ? { kind: 'challenge', color: doc.color } : { kind: 'group', color: doc.color }}
          name={templateName(doc, kind)}
          onChange={(color) =>
            update((d) => {
              if (color) d.color = color
              else delete d.color
            })
          }
        />
        {kind === 'challenge' ? (
          <ChallengeFields doc={doc as ChallengeTemplate} update={update as Update<ChallengeTemplate>} />
        ) : kind === 'environment' ? (
          <EnvironmentFields doc={doc as EnvironmentTemplate} update={update as Update<EnvironmentTemplate>} />
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

/**
 * A new minion template made in a dialog, for another editor to attach (the villain wizard's
 * Mook Squad, docs/design/villain-wizard/spec.md section 5): the minion editor's fields over a
 * template held in memory. Save adds it to the library and hands it to `onSaved`; Cancel
 * leaves nothing behind.
 */
export function NewMinionDialog({ tags = [], onSaved, onClose }: { tags?: readonly string[]; onSaved: (doc: MinionTemplate) => void; onClose: () => void }) {
  const stores = useTemplateStores()
  const [doc, setDoc] = useState<MinionTemplate>(() => ({ ...createMinionTemplate(), tags: [...tags] }))
  const [error, setError] = useState<string | null>(null)
  const update: Update<MinionTemplate> = (change) =>
    setDoc((d) => {
      const next = structuredClone(d)
      change(next)
      return next
    })
  const save = async () => {
    const saved = { ...doc, name: doc.name.trim(), updatedAt: new Date().toISOString() }
    try {
      await stores.minions.save(saved)
    } catch (e) {
      setError(`The minion couldn't be saved: ${e instanceof Error ? e.message : String(e)}`)
      return
    }
    onSaved(saved)
  }
  return (
    <Modal title="New minion template" onClose={onClose}>
      <div className="template-fields">
        <Field label="Name">{(id) => <input id={id} type="text" maxLength={MAX_NAME} value={doc.name} onChange={(e) => update((d) => void (d.name = e.target.value))} />}</Field>
        <MinionFields doc={doc} update={update} />
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="button" className="button button--primary" onClick={() => void save()}>
          Save and attach
        </button>
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
