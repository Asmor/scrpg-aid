/**
 * Using an ability or a basic action (GOAL.md, Phase 3): choose the dice, effects, and mods;
 * roll (in the app, or type in real dice); assign the mods to effects; confirm. The rules
 * are in ./roll.ts; this is the dialog around them.
 */
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { DieIcon } from '../components/icons'
import { ACTION_LABEL } from '../creation/effects'
import type { AbilityUse } from '../creation/sheet'
import type { HeroTrait } from '../creation/traits'
import type { PlayMod } from '../hero/model'
import { checkManualResults, rollDice } from '../rules/rolling'
import type { Action, BasicAction, Die, EffectUse } from '../rules/types'
import { activePlans, chosenMods, modFlagsFor, defaultAssignment, defaultModChoice, defaultPlans, describeEffect, describeRolls, hasDoubles, modSize, poolDice, results, USE_LABEL, type EffectPlan, type EffectResult, type GivenValues, type ModChoice, type RollRecord, type Rolled } from './roll'
import { defaultSlots, traitChoices, type FormDice } from './forms'
import { GONE, type ModTarget } from './ModForm'
import { describeMod, type PlayZone } from './state'

/** What's being used: an ability (with its effects), or a basic action. */
export type RollSubject = { kind: 'ability'; name: string; text: string; use: AbilityUse; reaction: boolean } | { kind: 'basic' }

const BASIC_ACTIONS: readonly BasicAction[] = ['attack', 'defend', 'boost', 'hinder', 'overcome']
const KIND_LABEL = { power: 'Power', quality: 'Quality' } as const
const ZONE_LABEL: Record<PlayZone, string> = { green: 'Green', yellow: 'Yellow', red: 'Red', out: 'Out' }

interface RollDialogProps {
  subject: RollSubject
  /** What the hero rolls with in their current form or mode. */
  dice: FormDice
  zone: PlayZone | undefined
  mods: readonly PlayMod[]
  onConfirm: (record: RollRecord) => void
  /** Adds a bonus or penalty a Boost or Hinder made; `to` gives it to another hero instead. */
  onAddMod: (mod: Omit<PlayMod, 'id'>, to?: string) => boolean | void
  /** Other heroes in a game session it can go to. */
  targets?: readonly ModTarget[]
  /** What the status die is called in the roll; by default its zone's ("Green status"). A villain's is just "Status". */
  statusLabel?: string
  onClose: () => void
  /** Injectable for tests. */
  random?: () => number
}

const traitKeyOf = (t: Pick<HeroTrait, 'trait'>) => `${t.trait.kind}:${t.trait.id}`

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {children(id)}
    </label>
  )
}

export function RollDialog({ subject, dice, zone, mods, onConfirm, onAddMod, targets = [], statusLabel, onClose, random }: RollDialogProps) {
  const titleId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const use = subject.kind === 'ability' ? subject.use : undefined
  const title = subject.kind === 'ability' ? subject.name : 'Basic action'

  // Dice: the ability's own power or quality, and one of the other kind (or two of one kind, with Divided Psyche).
  const choices = traitChoices(dice, use)
  // The ability's own power or quality is fixed (it must be used); the other slot is the player's choice.
  const [startSlots] = useState(() => defaultSlots(choices, dice.slots, use))
  const [slotKeys, setSlotKeys] = useState(() => startSlots.map((x) => (x.trait ? traitKeyOf(x.trait) : '')))
  const picked = dice.slots.map((kind, i) => choices[kind].find((t) => traitKeyOf(t) === slotKeys[i]))
  const firstNamed = use?.traits[0]
  const named = firstNamed && choices[firstNamed.kind].find((t) => t.trait.id === firstNamed.id)
  const statusDie = zone && zone !== 'out' ? dice.statusDice?.[zone] : undefined
  const pool = poolDice({ use, picked, named, status: statusDie && zone ? { label: statusLabel ?? `${ZONE_LABEL[zone]} status`, die: statusDie } : undefined, redStatus: dice.statusDice?.red })
  const single = Boolean(use?.pool)
  // Every slot needs a trait before rolling.
  const ready = pool.length > 0 && (single || picked.every(Boolean))
  const actions = BASIC_ACTIONS.filter((a) => !dice.cannot.includes(a))

  // Effects: an ability's, or the basic action chosen.
  const [basicAction, setBasicAction] = useState<Action>(() => actions[0] ?? 'attack')
  const effects = use ? use.effects : [{ actions: [basicAction], use: 'mid' as EffectUse }]
  const [plans, setPlans] = useState<EffectPlan[]>(() => defaultPlans(effects))
  const shownPlans = use ? plans : defaultPlans(effects)
  const setPlan = (i: number, change: Partial<EffectPlan>) => setPlans((ps) => ps.map((p, j) => (j === i ? { ...p, ...change } : p)))
  const [given, setGiven] = useState<{ damage: string; other: string }>({ damage: '', other: '' })
  const givenValues: GivenValues = { ...(given.damage.trim() ? { damage: Number(given.damage) } : {}), ...(given.other.trim() ? { other: Number(given.other) } : {}) }

  // Mods.
  const [choice, setChoice] = useState<ModChoice>(() => defaultModChoice(mods))
  const chosen = chosenMods(mods, choice)

  // Rolling.
  const [rolled, setRolled] = useState<Rolled[] | null>(null)
  const [manual, setManual] = useState<string[] | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)
  const [wasManual, setWasManual] = useState(false)
  const active = rolled ? activePlans(shownPlans, rolled) : []
  // Values the dice can't give, asked for once the roll shows which effects happen.
  const needs = { damage: active.some((p) => p.use === 'damage'), other: active.some((p) => p.use === 'other') }
  const [assignment, setAssignment] = useState<Record<string, number>>({})
  const [done, setDone] = useState<EffectResult[] | null>(null)
  const finalResults = rolled ? results(active, rolled, givenValues, chosen, assignment) : []

  // Focus moves into the dialog once when it opens, stays inside it while it's open (Tab
  // wraps around), and goes back where it was when it closes. Escape closes it.
  const dialog = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    heading.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key !== 'Tab' || !dialog.current) return
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"], [draggable="true"]')]
      if (!focusable.length) return
      const first = focusable[0]!
      const last = focusable.at(-1)!
      if (e.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      before?.focus()
    }
  }, [])

  const doRoll = (values: number[], fromManual: boolean) => {
    const r = pool.map((d, i) => ({ ...d, value: values[i]! }))
    setRolled(r)
    setWasManual(fromManual)
    const act = activePlans(shownPlans, r)
    setAssignment(defaultAssignment(chosen, results(act, r, givenValues, [], {}).map((x) => x.base)))
  }

  const confirm = () => {
    if (!rolled) return
    onConfirm({ title: subject.kind === 'ability' ? `Used ability ${subject.name}:` : `Took a basic action (${ACTION_LABEL[basicAction]}):`, rolled, results: finalResults, manual: wasManual })
    setDone(finalResults)
  }

  const missingValue = finalResults.some((r) => r.total === undefined)

  const onDrop = (index: number) => (e: DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (id) setAssignment((a) => ({ ...a, [id]: index }))
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog}>
        <h3 id={titleId} ref={heading} tabIndex={-1}>
          {title}
        </h3>
        {subject.kind === 'ability' && <p className="hint">{subject.text}</p>}

        {done ? (
          <>
            <ul className="roll-results">
              {done.map((r, i) => (
                <li key={i}>{describeEffect(r)}</li>
              ))}
            </ul>
            {done.map((r, i) => {
              if ((r.action !== 'boost' && r.action !== 'hinder') || r.total === undefined || modSize(r.total) === 0) return null
              const value = (r.action === 'boost' ? 1 : -1) * modSize(r.total)
              const flags = subject.kind === 'ability' ? modFlagsFor(subject.text, active[i]!) : { persistent: false, exclusive: false }
              return <ModOffer key={i} value={value} label={title} persistent={flags.persistent} exclusive={flags.exclusive} targets={targets} onAdd={onAddMod} />
            })}
            <div className="button-row">
              <button type="button" className="button button--primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : subject.kind === 'ability' && subject.use.effects.length === 0 ? (
          <>
            <p>This ability doesn’t roll anything.</p>
            <div className="button-row">
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  onConfirm({ title: `Used ability ${subject.name}.`, rolled: [], results: [], manual: false })
                  onClose()
                }}
              >
                Use it
              </button>
              <button type="button" className="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : !rolled ? (
          <>
            <fieldset className="roll-section">
              <legend>Dice</legend>
              {subject.kind === 'basic' && (
                <Field label="Action">
                  {(id) => (
                    <select id={id} value={basicAction} onChange={(e) => setBasicAction(e.target.value as Action)}>
                      {actions.map((a) => (
                        <option key={a} value={a}>
                          {ACTION_LABEL[a]}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
              {!single && (
                <div className="roll-traits">
                  {dice.slots.map((kind, i) => {
                    const label = dice.slots.slice(0, i).includes(kind) ? `Second ${kind}` : KIND_LABEL[kind]
                    const fixed = startSlots[i]!.fixed && picked[i]
                    return fixed ? (
                      <div key={i} className="field" role="group" aria-label={label}>
                        <span>{label}</span>
                        <span className="roll-fixed__trait">
                          {fixed.name} <DieIcon die={fixed.die} />
                        </span>
                      </div>
                    ) : (
                      <Field key={i} label={label}>
                        {(id) => (
                          <select id={id} value={slotKeys[i]} onChange={(e) => setSlotKeys((keys) => keys.map((k, j) => (j === i ? e.target.value : k)))}>
                            {!picked[i] && <option value="">Choose one</option>}
                            {choices[kind].map((t) => (
                              // A trait picked for another slot can't be rolled twice.
                              <option key={traitKeyOf(t)} value={traitKeyOf(t)} disabled={slotKeys.some((k, j) => j !== i && k === traitKeyOf(t))}>
                                {t.name} ({t.die})
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>
                    )
                  })}
                </div>
              )}
              <p className="roll-pool">
                Rolling:{' '}
                {pool.map((d, i) => (
                  <span key={i} className="roll-pool__die">
                    {d.label} <DieIcon die={d.die} />
                  </span>
                ))}
              </p>
            </fieldset>

            {use && shownPlans.length > 0 && (
              <fieldset className="roll-section">
                <legend>Effects</legend>
                {shownPlans.map((p, i) => (
                  <div key={i} className="roll-effect">
                    {p.effect.optional ? (
                      <label className="checkbox">
                        <input type="checkbox" checked={p.included} onChange={(e) => setPlan(i, { included: e.target.checked })} />
                        {ACTION_LABEL[p.action]} ({USE_LABEL[p.use]}, optional)
                      </label>
                    ) : (
                      <span>
                        {ACTION_LABEL[p.action]} ({USE_LABEL[p.use]})
                      </span>
                    )}
                    {p.effect.when === 'doubles' && <span className="hint"> only on doubles</span>}
                    {p.effect.actions.length > 1 && (
                      <Field label="Which action">
                        {(id) => (
                          <select id={id} value={p.action} onChange={(e) => setPlan(i, { action: e.target.value as Action })}>
                            {p.effect.actions.map((a) => (
                              <option key={a} value={a}>
                                {ACTION_LABEL[a]}
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>
                    )}
                    {Array.isArray(p.effect.use) && (
                      <Field label="Which die">
                        {(id) => (
                          <select id={id} value={p.use} onChange={(e) => setPlan(i, { use: e.target.value as EffectUse })}>
                            {(p.effect.use as EffectUse[]).map((u) => (
                              <option key={u} value={u}>
                                {USE_LABEL[u as EffectUse]}
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>
                    )}
                  </div>
                ))}
              </fieldset>
            )}

            {mods.length > 0 && (
              <fieldset className="roll-section">
                <legend>Mods</legend>
                {mods
                  .filter((m) => !m.exclusive)
                  .map((m) => (
                    <label key={m.id} className="checkbox">
                      <input
                        type="checkbox"
                        checked={choice.nonExclusive.includes(m.id)}
                        onChange={(e) => setChoice((c) => ({ ...c, nonExclusive: e.target.checked ? [...c.nonExclusive, m.id] : c.nonExclusive.filter((x) => x !== m.id) }))}
                      />
                      {describeMod(m)}
                    </label>
                  ))}
                {(['bonus', 'penalty'] as const).map((kind) => {
                  const list = mods.filter((m) => m.exclusive && (kind === 'bonus' ? m.value > 0 : m.value < 0))
                  if (!list.length) return null
                  const key = kind === 'bonus' ? 'exclusiveBonus' : 'exclusivePenalty'
                  return (
                    <div key={kind} role="radiogroup" aria-label={`Exclusive ${kind}`} className="roll-exclusive">
                      <span className="roll-exclusive__label">Exclusive {kind}:</span>
                      <label className="checkbox">
                        <input type="radio" name={`${titleId}-${kind}`} checked={choice[key] === null} onChange={() => setChoice((c) => ({ ...c, [key]: null }))} />
                        None
                      </label>
                      {list.map((m) => (
                        <label key={m.id} className="checkbox">
                          <input type="radio" name={`${titleId}-${kind}`} checked={choice[key] === m.id} onChange={() => setChoice((c) => ({ ...c, [key]: m.id }))} />
                          {describeMod(m)}
                        </label>
                      ))}
                    </div>
                  )
                })}
              </fieldset>
            )}

            {manual ? (
              <form
                className="manual-roll"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault()
                  const checked = checkManualResults(
                    pool.map((d) => d.die),
                    manual.map((v) => (v.trim() === '' ? Number.NaN : Number(v))),
                  )
                  if (!checked.ok) setManualError(checked.error)
                  else doRoll(checked.results, true)
                }}
              >
                <div className="manual-roll__dice">
                  {pool.map((d, i) => (
                    <label key={i}>
                      <DieIcon die={d.die} /> {d.label}
                      <input type="number" inputMode="numeric" value={manual[i] ?? ''} onChange={(e) => setManual((m) => m!.map((v, j) => (j === i ? e.target.value : v)))} />
                    </label>
                  ))}
                </div>
                {manualError && (
                  <p className="error" role="alert">
                    {manualError}
                  </p>
                )}
                <div className="button-row">
                  <button type="submit" className="button button--primary">
                    Use these results
                  </button>
                  <button type="button" className="button" onClick={() => setManual(null)}>
                    Back
                  </button>
                </div>
              </form>
            ) : (
              <div className="button-row">
                <button type="button" className="button button--primary" disabled={!ready} onClick={() => doRoll(rollDice(pool.map((d) => d.die as Die), random), false)}>
                  Roll
                </button>
                <button type="button" className="button" disabled={!ready} onClick={() => setManual(pool.map(() => ''))}>
                  Enter my own roll
                </button>
                <button type="button" className="button" onClick={onClose}>
                  Cancel
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <ul className="roll-dice" aria-label="Dice rolled">
              {describeRolls(rolled).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
            {hasDoubles(rolled) && <p className="hint">Doubles!</p>}
            {active.length === 0 ? (
              <p>No effects with this roll.</p>
            ) : (
              <div className="roll-assign">
                {active.length > 1 && chosen.length > 0 && <p className="hint">Drag a mod onto the effect it applies to.</p>}
                {active.map((p, i) => (
                  <div key={i} className="roll-target" onDragOver={(e) => e.preventDefault()} onDrop={onDrop(i)} aria-label={`${ACTION_LABEL[p.action]} (${USE_LABEL[p.use]})`} role="group">
                    <p className="roll-target__title">{describeEffect(finalResults[i]!)}</p>
                    <ul className="roll-target__mods">
                      {chosen
                        .filter((m) => (assignment[m.id] ?? 0) === i)
                        .map((m) => (
                          <li key={m.id} draggable={active.length > 1} onDragStart={(e) => e.dataTransfer.setData('text/plain', m.id)} className="roll-mod">
                            {describeMod(m)}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {(needs.damage || needs.other) && (
              <fieldset className="roll-section">
                <legend>Values the dice don’t give</legend>
                {needs.damage && (
                  <Field label="Damage taken">
                    {(id) => <input id={id} type="number" inputMode="numeric" min={0} value={given.damage} onChange={(e) => setGiven((g) => ({ ...g, damage: e.target.value }))} />}
                  </Field>
                )}
                {needs.other && (
                  <Field label="Value from the ability’s text">
                    {(id) => <input id={id} type="number" inputMode="numeric" value={given.other} onChange={(e) => setGiven((g) => ({ ...g, other: e.target.value }))} />}
                  </Field>
                )}
              </fieldset>
            )}
            <div className="button-row">
              <button type="button" className="button button--primary" disabled={missingValue} onClick={confirm}>
                Confirm
              </button>
              <button type="button" className="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Offers to add the mod a Boost or Hinder made, with its label and kind editable first. */
function ModOffer({
  value,
  label: start,
  persistent: p,
  exclusive: x,
  targets,
  onAdd,
}: {
  value: number
  label: string
  persistent: boolean
  exclusive: boolean
  targets: readonly ModTarget[]
  onAdd: (mod: Omit<PlayMod, 'id'>, to?: string) => boolean | void
}) {
  const id = useId()
  const [label, setLabel] = useState(start)
  const [persistent, setPersistent] = useState(p)
  const [exclusive, setExclusive] = useState(x)
  const [added, setAdded] = useState(false)
  const [to, setTo] = useState<ModTarget | null>(null)
  // A hero who was chosen and has since left isn't swapped for "Me": that could put their penalty on you.
  const gone = to !== null && !targets.some((t) => t.id === to.id)
  const target = gone ? undefined : (to ?? undefined)
  const what = value > 0 ? `+${value} bonus` : `${value} penalty`
  return (
    <fieldset className="roll-section" disabled={added}>
      <legend>Add the {what} to the mods list?</legend>
      {value < 0 && <p className="hint">{targets.length ? 'Only if the penalty is on a hero.' : 'Only if the penalty is on you.'}</p>}
      {(targets.length > 0 || gone) && (
        <label className="field" htmlFor={`${id}-to`}>
          <span>For</span>
          <select id={`${id}-to`} value={gone ? GONE : (target?.id ?? '')} onChange={(e) => setTo(targets.find((t) => t.id === e.target.value) ?? null)}>
            {gone && (
              <option value={GONE} disabled>
                Choose who it’s for
              </option>
            )}
            <option value="">Me</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field" htmlFor={id}>
        <span>What it is</span>
        <input id={id} type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={persistent} onChange={(e) => setPersistent(e.target.checked)} />
        Persistent
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} />
        Exclusive
      </label>
      {gone && <p className="hint">{to.name} has left the game. Choose who it’s for.</p>}
      <button
        type="button"
        className="button"
        disabled={gone}
        onClick={() => {
          if (onAdd({ label, value, ...(persistent ? { persistent: true } : {}), ...(exclusive ? { exclusive: true } : {}) }, target?.id) !== false) setAdded(true)
        }}
      >
        {added ? (target ? 'Given' : 'Added') : target ? `Give ${what} to ${target.name}` : `Add ${what}`}
      </button>
    </fieldset>
  )
}
