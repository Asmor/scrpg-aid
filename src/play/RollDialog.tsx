/**
 * Using an ability or a basic action (docs/design/hero-sheet/spec.md, "Roll flow"), in three
 * steps: Dice and mods, Results, Resolve. The ability's text stays at the top. Cancel changes
 * nothing at any step: the roll is recorded, its mods used up and any follow-up mods added
 * only when the player chooses Done. The rules are in ./roll.ts; this is the dialog around them.
 */
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { AbilityText, ActionIcon, DieIcon } from '../components/icons'
import { ACTION_LABEL } from '../creation/effects'
import type { AbilityUse } from '../creation/sheet'
import type { HeroTrait } from '../creation/traits'
import type { PlayMinion, PlayMod } from '../hero/model'
import { checkManualResults, rollDice } from '../rules/rolling'
import type { Action, BasicAction, Die, EffectUse, MinionForm } from '../rules/types'
import { activePlans, chosenMods, defaultAssignment, defaultModChoice, defaultPlans, describeEffect, hasDoubles, modFlagsFor, modSize, poolDice, results, sortRolls, toggleMod, USE_LABEL, useValue as valueFor, type EffectPlan, type EffectResult, type GivenValues, type RollRecord, type Rolled } from './roll'
import { minionAction, minionSize, takesAnyAction } from './minions'
import { defaultSlots, traitChoices, type FormDice, type RollTrait } from './forms'
import { GONE } from './ModForm'
import { ShowOtherSide, TargetOptions } from './TargetPicker'
import { allOptions, polarity, toggleLabel, type Polarity, type TargetList } from '../game/target-options'
import { describeMod, modName, type PlayZone } from './state'

/** What's being used: an ability (with its effects), or a basic action (maybe already chosen). */
export type RollSubject = { kind: 'ability'; name: string; text: string; use: AbilityUse; reaction: boolean } | { kind: 'basic'; action?: BasicAction }

/** A mod a Boost or Hinder made, to add when the roll is done; `to` is another hero, or none for the roller. */
export interface FollowUpMod {
  mod: Omit<PlayMod, 'id'>
  to?: string
}

/**
 * Who an Attack or Defend result goes to: the result's index in the record, and the target's id.
 * A result is listed only once it has a target; a Defend for the roller itself has `to` empty.
 * Away from a table (no `targetsFor`), every Defend protects the roller.
 */
export interface TargetChoice {
  result: number
  to: string
}

/** A minion a roll made: its size from the roll, and the name, action and form the player gives it. */
export type NewMinion = Omit<PlayMinion, 'id' | 'mods'>

/** The forms or modes a roll can change to: each choice's value, name and any note, and the current one. */
export interface FormPicker {
  label: string
  options: readonly { value: string; label: string; note?: string }[]
  current: string
}

const BASIC_ACTIONS: readonly BasicAction[] = ['attack', 'defend', 'boost', 'hinder', 'overcome']
const KIND_LABEL = { power: 'Power', quality: 'Quality' } as const
const ZONE_LABEL: Record<PlayZone, string> = { green: 'Green', yellow: 'Yellow', red: 'Red', out: 'Out' }
const STEPS = ['Dice and mods', 'Results', 'Resolve'] as const

interface RollDialogProps {
  subject: RollSubject
  /** What the hero rolls with in their current form or mode. */
  dice: FormDice
  zone: PlayZone | undefined
  mods: readonly PlayMod[]
  /** Done: the roll to record, the follow-up mods to add or give, and the form or mode chosen, if it changed. */
  onConfirm: (record: RollRecord, followUps: readonly FollowUpMod[], formChoice?: string, minions?: readonly NewMinion[], targetChoices?: readonly TargetChoice[]) => void
  /** For an ability that changes form or mode: the choices, offered in the Resolve step. */
  formPicker?: FormPicker
  /** For an ability that makes minions (Make Minion and the like): the die that sizes each one (ruling 62). */
  creates?: readonly EffectUse[]
  /** The hero's minion forms, offered for each minion made. */
  minionForms?: readonly MinionForm[]
  /**
   * At a game table: who each result can go to (../game/target-options.ts). Each Attack result
   * gets a Target choice, each Defend a Protect choice, and a Boost's or Hinder's mod a For
   * choice. Away from a table, mods go on the roller's list and a Defend protects the roller.
   */
  targetsFor?: (effect: BasicAction, opts: { showOtherSide: boolean; keep: readonly string[] }) => TargetList
  /** The roller's own option in those lists, which stands for "me". */
  selfId?: string
  /**
   * "mods": only a Boost's or Hinder's mod picks who it's for, from every option (solo play: the
   * hero and their minions). By default every result picks a target, likely side first.
   */
  pickTargets?: 'all' | 'mods'
  /** Dice rolled as they are, in place of picking a power and a quality (the environment dice). */
  fixedPool?: readonly { label: string; die: Die }[]
  /** A basic action picks Min, Mid or Max once the dice are rolled (the environment's; a hero's uses Mid). */
  chooseUse?: boolean
  /** What the status die is called in the roll; by default its zone's ("Green status"). A villain's is just "Status". */
  statusLabel?: string
  onClose: () => void
  /** Injectable for tests. */
  random?: () => number
}

const traitKeyOf = (t: Pick<HeroTrait, 'trait'>) => `${t.trait.kind}:${t.trait.id}`
/** "Take a d4": a die any slot can roll in place of a power or quality. */
const takeD4 = (kind: 'power' | 'quality'): RollTrait => ({ trait: { kind, id: 'take-d4' }, die: 'd4', name: 'd4' })

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {children(id)}
    </label>
  )
}

function Badge({ value }: { value: number }) {
  return <span className={value > 0 ? 'mod-badge mod-badge--bonus' : 'mod-badge mod-badge--penalty'}>{value > 0 ? `+${value}` : `−${-value}`}</span>
}

/** A mod on an effect or minion card: drag it, or use its menu, to move it to another card. */
function ModChip({ mod, at, labels, onMove }: { mod: PlayMod; at: number; labels: readonly string[]; onMove: (id: string, to: number) => void }) {
  return (
    <li className="roll-chip" draggable={labels.length > 1} onDragStart={(e) => e.dataTransfer.setData('text/plain', mod.id)}>
      <Badge value={mod.value} />
      <span>{modName(mod)}</span>
      {labels.length > 1 && (
        <select aria-label={`Move ${modName(mod)}`} value={at} onChange={(e) => onMove(mod.id, Number(e.target.value))}>
          {labels.map((l, j) => (
            <option key={j} value={j}>
              {j === at ? 'Here' : `Move to ${l}`}
            </option>
          ))}
        </select>
      )}
    </li>
  )
}

/** "a +2 bonus", "no penalty": what a Boost or Hinder total makes. */
function modMade(action: Action, total: number): string | undefined {
  if (action !== 'boost' && action !== 'hinder') return undefined
  const size = modSize(total)
  if (!size) return action === 'boost' ? 'no bonus' : 'no penalty'
  return action === 'boost' ? `a +${size} bonus` : `a −${size} penalty`
}

export function RollDialog({ subject, dice, zone, mods, onConfirm, formPicker, creates = [], minionForms = [], targetsFor, selfId = '', pickTargets = 'all', fixedPool, chooseUse = false, statusLabel, onClose, random }: RollDialogProps) {
  const titleId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const use = subject.kind === 'ability' ? subject.use : undefined
  const title = subject.kind === 'ability' ? subject.name : 'Basic action'

  // Dice: the ability's own power or quality is set by it; the other slots are the player's choice, or a d4.
  const choices = traitChoices(dice, use)
  const [startSlots] = useState(() => defaultSlots(choices, dice.slots, use))
  const [slotKeys, setSlotKeys] = useState(() => startSlots.map((x) => (x.trait ? traitKeyOf(x.trait) : '')))
  const options = (kind: 'power' | 'quality') => [...choices[kind], takeD4(kind)]
  const picked = dice.slots.map((kind, i) => options(kind).find((t) => traitKeyOf(t) === slotKeys[i]))
  const firstNamed = use?.traits[0]
  const named = firstNamed && choices[firstNamed.kind].find((t) => t.trait.id === firstNamed.id)
  const statusDie = zone && zone !== 'out' ? dice.statusDice?.[zone] : undefined
  const statusName = statusLabel ?? (zone ? `${ZONE_LABEL[zone]} status` : 'Status')
  const pool = fixedPool ? [...fixedPool] : poolDice({ use, picked, named, status: statusDie && zone ? { label: statusName, die: statusDie } : undefined, redStatus: dice.statusDice?.red })
  const single = Boolean(use?.pool)
  // Every slot needs a die before rolling.
  const ready = pool.length > 0 && (single || Boolean(fixedPool) || picked.every(Boolean))
  const actions = BASIC_ACTIONS.filter((a) => !dice.cannot.includes(a))

  // Effects: an ability's, or the basic action chosen.
  const [basicAction, setBasicAction] = useState<Action>(() => (subject.kind === 'basic' && subject.action) || actions[0] || 'attack')
  // A basic action uses Mid, unless it picks its die after the roll.
  const [basicUse, setBasicUse] = useState<EffectUse>('mid')
  const effects = use ? use.effects : [{ actions: [basicAction], use: chooseUse ? basicUse : ('mid' as EffectUse) }]
  const [plans, setPlans] = useState<EffectPlan[]>(() => defaultPlans(effects))
  const shownPlans = use ? plans : defaultPlans(effects)
  const setPlan = (i: number, change: Partial<EffectPlan>) => setPlans((ps) => ps.map((p, j) => (j === i ? { ...p, ...change } : p)))
  const [given, setGiven] = useState<{ damage: string; other: string }>({ damage: '', other: '' })
  const givenValues: GivenValues = { ...(given.damage.trim() ? { damage: Number(given.damage) } : {}), ...(given.other.trim() ? { other: Number(given.other) } : {}) }

  // Mods: penalties, then bonuses, as checkboxes.
  const [checked, setChecked] = useState<string[]>(() => defaultModChoice(mods))
  const chosen = chosenMods(mods, checked)

  // Rolling.
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [rolled, setRolled] = useState<Rolled[] | null>(null)
  const [manual, setManual] = useState<string[] | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)
  const [wasManual, setWasManual] = useState(false)
  const active = rolled ? activePlans(shownPlans, rolled) : []
  // Values the dice can't give, asked for once the roll shows which effects happen.
  const needs = { damage: active.some((p) => p.use === 'damage'), other: active.some((p) => p.use === 'other') }
  const [assignment, setAssignment] = useState<Record<string, number>>({})
  const [dragOver, setDragOver] = useState<number | null>(null)
  const finalResults = rolled ? results(active, rolled, givenValues, chosen, assignment) : []
  const missingValue = finalResults.some((r) => r.total === undefined)
  const [followUps, setFollowUps] = useState<Record<number, FollowUpMod | undefined>>({})
  // Each Attack's or Defend's target, by the result's index ("" for No target).
  const [attackTo, setAttackTo] = useState<Record<number, string>>({})
  // "Show allies too": one per dialog, off each time it opens.
  const [showOther, setShowOther] = useState(false)
  const [formChoice, setFormChoice] = useState(formPicker?.current ?? '')
  // Minions the roll makes: each sized by its die plus the mods moved onto it, named in Resolve.
  const [made, setMade] = useState(() => creates.map(() => ({ name: '', action: 'attack' as BasicAction, form: '' })))
  const minionCards = rolled
    ? creates.map((u, j) => {
        const index = active.length + j
        const base = valueFor(u, rolled) ?? 0
        const on = chosen.filter((m) => (assignment[m.id] ?? 0) === index)
        const total = base + on.reduce((sum, m) => sum + m.value, 0)
        return { index, use: u, base, mods: on, total, die: minionSize(total) }
      })
    : []
  // Every card a mod can sit on: the effects, then the minions made.
  const cardLabels = [...active.map((p) => effectLabel(p)), ...creates.map((_, j) => (creates.length > 1 ? `Minion ${j + 1}` : 'Minion'))]

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
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')]
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
  // Each step starts with focus on the dialog's heading, so it's read out.
  useEffect(() => {
    heading.current?.focus()
  }, [step])

  const doRoll = (values: number[], fromManual: boolean) => {
    setRolled(pool.map((d, i) => ({ ...d, value: values[i]! })))
    setWasManual(fromManual)
    setAssignment(defaultAssignment(chosen))
    setManual(null)
    setStep(1)
  }
  const back = () => {
    setRolled(null)
    setFollowUps({})
    setAttackTo({})
    setStep(0)
  }
  // A Defend protects the roller unless another target is chosen; an Attack has none until one is.
  const targetOf = (i: number, action: 'attack' | 'defend') => attackTo[i] ?? (action === 'defend' ? selfId : '')
  const listFor = (action: BasicAction, keep: readonly string[]) => targetsFor!(action, { showOtherSide: showOther || pickTargets === 'mods', keep: keep.filter(Boolean) })
  // The effects that pick a target, for the one "Show allies too" checkbox.
  const picking: Polarity[] =
    targetsFor && pickTargets === 'all'
    ? finalResults.flatMap((r) => {
        if (r.total === undefined || r.action === 'recover' || r.action === 'overcome') return []
        if ((r.action === 'boost' || r.action === 'hinder') && modSize(r.total) === 0) return []
        const p = polarity(r.action)
        return p ? [p] : []
      })
    : []
  const toggle = toggleLabel(picking)
  const done = () => {
    if (!rolled) return
    onConfirm(
      {
        title: subject.kind === 'ability' ? `Used ability ${subject.name}:` : `Took a basic action (${ACTION_LABEL[basicAction]}):`,
        rolled,
        results: finalResults,
        manual: wasManual,
        // The minions made, with the mods moved onto them, so those are logged and used up too.
        ...(minionCards.length ? { made: minionCards.map((c) => ({ label: `${cardLabels[c.index]} (${USE_LABEL[c.use]})`, base: c.base, mods: c.mods, total: c.total, die: c.die })) } : {}),
      },
      Object.values(followUps).filter((f): f is FollowUpMod => Boolean(f)),
      formPicker && formChoice !== formPicker.current ? formChoice : undefined,
      minionCards.map((c, j) => {
        const m = made[j]!
        return { name: m.name.trim() || (creates.length > 1 ? `Minion ${j + 1}` : 'Minion'), die: c.die, action: minionAction(m.form, m.action), ...(m.form ? { form: m.form } : {}) }
      }),
      finalResults.flatMap((r, i) => {
        if (r.total === undefined) return []
        if (r.action !== 'attack' && r.action !== 'defend') return []
        if (!targetsFor || pickTargets === 'mods') return r.action === 'defend' ? [{ result: i, to: '' }] : []
        const to = targetOf(i, r.action)
        // Someone who has left the table since is no target.
        if (!to || !allOptions(targetsFor(r.action, { showOtherSide: true, keep: [] })).some((o) => o.id === to)) return []
        return [{ result: i, to: to === selfId ? '' : to }]
      }),
    )
    onClose()
  }
  const move = (id: string, to: number) => setAssignment((a) => ({ ...a, [id]: to }))
  const onDrop = (index: number) => (e: DragEvent) => {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData('text/plain')
    if (id) move(id, index)
  }
  // Two effects with the same action get a number, so cards and "Move to" options stay distinct.
  function effectLabel(p: EffectPlan) {
    const same = active.filter((q) => q.action === p.action)
    return same.length > 1 ? `${ACTION_LABEL[p.action]} ${same.indexOf(p) + 1}` : ACTION_LABEL[p.action]
  }

  const modRow = (m: PlayMod) => (
    <label key={m.id} className="checkbox roll-mod-check">
      <input type="checkbox" checked={checked.includes(m.id)} onChange={(e) => setChecked((c) => toggleMod(mods, c, m.id, e.target.checked))} />
      <Badge value={m.value} />
      <span>{modName(m)}</span>
      {m.exclusive && <span className="tag">Exclusive</span>}
    </label>
  )

  const noEffects = subject.kind === 'ability' && subject.use.effects.length === 0 && creates.length === 0
  // For an ability that changes form or mode: where to change to, applied on Done.
  const picker = formPicker && (
    <fieldset className="roll-section">
      <legend>{formPicker.label}</legend>
      {formPicker.options.map((o) => (
        <label key={o.value} className="form-option">
          <input type="radio" name={`${titleId}-form`} checked={formChoice === o.value} onChange={() => setFormChoice(o.value)} />
          <span className="form-option__name">
            {o.label}
            {o.value === formPicker.current && ' (now)'}
          </span>
          {o.note && <span className="form-option__note">{o.note}</span>}
        </label>
      ))}
    </fieldset>
  )

  return (
    <div className="dialog-backdrop">
      <div className="dialog roll-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog}>
        <div className="roll-dialog__head">
          <div>
            <p className="label">Roll</p>
            <h3 id={titleId} ref={heading} tabIndex={-1}>
              {title}
            </h3>
          </div>
          <button type="button" className="button button--small" onClick={onClose}>
            Cancel
          </button>
        </div>
        {subject.kind === 'ability' && (
          <p className="roll-dialog__text">
            <AbilityText text={subject.text} actions={subject.use.effects.flatMap((e) => e.actions)} />
          </p>
        )}

        {noEffects ? (
          <>
            <p>This ability doesn’t roll anything.</p>
            {picker}
            <div className="button-row">
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  onConfirm({ title: `Used ability ${subject.name}.`, rolled: [], results: [], manual: false }, [], formPicker && formChoice !== formPicker.current ? formChoice : undefined)
                  onClose()
                }}
              >
                Use it
              </button>
            </div>
          </>
        ) : (
          <>
            <ol className="roll-steps">
              {STEPS.map((s, i) => (
                <li key={s} aria-current={i === step ? 'step' : undefined}>
                  <span aria-hidden="true">{i + 1}</span> {s}
                </li>
              ))}
            </ol>

            {step === 0 && (
              <>
                <p className="label">Dice</p>
                <div className="roll-dice-picks">
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
                  {fixedPool ? (
                    fixedPool.map((d, i) => (
                      <div key={i} className="roll-pick" role="group" aria-label={d.label}>
                        <span className="roll-pick__label">{d.label}</span>
                        <DieIcon die={d.die} />
                      </div>
                    ))
                  ) : single ? (
                    <div className="roll-pick" role="group" aria-label="Single die">
                      <span className="roll-pick__label">Single die</span>
                      <span>{pool[0]?.label ?? 'None'}</span>
                      {pool[0] && <DieIcon die={pool[0].die} />}
                    </div>
                  ) : (
                    <>
                      {dice.slots.map((kind, i) => {
                        const label = dice.slots.slice(0, i).includes(kind) ? `Second ${kind}` : KIND_LABEL[kind]
                        const fixed = startSlots[i]!.fixed && picked[i]
                        return fixed ? (
                          <div key={i} className="roll-pick" role="group" aria-label={label}>
                            <span className="roll-pick__label">{label}</span>
                            <span>
                              {fixed.name} <span className="roll-pick__note">set by the ability</span>
                            </span>
                            <DieIcon die={fixed.die} />
                          </div>
                        ) : (
                          <div key={i} className="roll-pick">
                            <Field label={label}>
                              {(id) => (
                                <select id={id} value={slotKeys[i]} onChange={(e) => setSlotKeys((keys) => keys.map((k, j) => (j === i ? e.target.value : k)))}>
                                  {!picked[i] && <option value="">Choose one</option>}
                                  {options(kind).map((t) => (
                                    // A power or quality picked for another slot can't be rolled twice; a d4 can.
                                    <option key={traitKeyOf(t)} value={traitKeyOf(t)} disabled={t.trait.id !== 'take-d4' && slotKeys.some((k, j) => j !== i && k === traitKeyOf(t))}>
                                      {t.trait.id === 'take-d4' ? 'Take a d4' : `${t.name} (${t.die})`}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </Field>
                            {picked[i] && <DieIcon die={picked[i]!.die} />}
                          </div>
                        )
                      })}
                      {statusDie && (
                        <div className="roll-pick" role="group" aria-label="Status">
                          <span className="roll-pick__label">Status</span>
                          <span>{statusName}</span>
                          <DieIcon die={statusDie} />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {use && shownPlans.some((p) => p.effect.optional || p.effect.actions.length > 1 || Array.isArray(p.effect.use)) && (
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
                  <fieldset className="roll-section roll-mods">
                    <legend>
                      Mods <span className="roll-mods__rule">· at most one exclusive bonus and one exclusive penalty</span>
                    </legend>
                    {mods.filter((m) => m.value < 0).map(modRow)}
                    {mods.filter((m) => m.value > 0).map(modRow)}
                  </fieldset>
                )}

                {manual ? (
                  <form
                    className="manual-roll"
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault()
                      const result = checkManualResults(
                        pool.map((d) => d.die),
                        manual.map((v) => (v.trim() === '' ? Number.NaN : Number(v))),
                      )
                      if (!result.ok) setManualError(result.error)
                      else doRoll(result.results, true)
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
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={!ready}
                      onClick={() =>
                        doRoll(
                          rollDice(
                            pool.map((d) => d.die as Die),
                            random,
                          ),
                          false,
                        )
                      }
                    >
                      Roll
                    </button>
                    <button type="button" className="button" disabled={!ready} onClick={() => setManual(pool.map(() => ''))}>
                      Enter my own roll
                    </button>
                  </div>
                )}
              </>
            )}

            {step === 1 && rolled && (
              <>
                <ul className="roll-dice-cards" aria-label="Dice rolled">
                  {(() => {
                    const sorted = sortRolls(rolled)
                    const cards = sorted ? (['max', 'mid', 'min'] as const).map((k) => ({ which: USE_LABEL[k], r: sorted[k] })) : rolled.map((r) => ({ which: 'Die', r }))
                    return cards.map(({ which, r }, i) => (
                      <li key={i}>
                        <span className="label">{which}</span>
                        <strong>{r.value}</strong>
                        <DieIcon die={r.die} />
                        <span className="roll-dice-cards__from">{r.label}</span>
                      </li>
                    ))
                  })()}
                </ul>
                {hasDoubles(rolled) && <p className="hint">Doubles!</p>}
                {chooseUse && subject.kind === 'basic' && (
                  <Field label="Use">
                    {(id) => (
                      <select id={id} value={basicUse} onChange={(e) => setBasicUse(e.target.value as EffectUse)}>
                        {(['min', 'mid', 'max'] as const).map((u) => (
                          <option key={u} value={u}>
                            {USE_LABEL[u]}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                )}
                {active.length === 0 && creates.length === 0 ? (
                  <p>No effects with this roll.</p>
                ) : (
                  <>
                    <p className="label">Effects{active.length > 1 && chosen.length > 0 && <span className="roll-mods__rule"> · drag mods between effects, or use each mod’s menu</span>}</p>
                    {active.map((p, i) => {
                      const r = finalResults[i]!
                      return (
                        <div
                          key={i}
                          className={dragOver === i ? 'roll-effect-card roll-effect-card--over' : 'roll-effect-card'}
                          role="group"
                          aria-label={`${effectLabel(p)} (${USE_LABEL[p.use]})`}
                          onDragOver={(e) => {
                            e.preventDefault()
                            setDragOver(i)
                          }}
                          onDragLeave={(e) => {
                            // Moving onto a child isn't leaving the card.
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null)
                          }}
                          onDrop={onDrop(i)}
                        >
                          <div className="roll-effect-card__top">
                            <ActionIcon action={p.action} decorative />
                            <strong>{effectLabel(p)}</strong>
                            <span className="roll-effect-card__uses">
                              Uses {USE_LABEL[p.use]}
                              {r.base !== undefined ? ` (${r.base})` : ''}
                            </span>
                            <span className="roll-effect-card__total">{r.total ?? '—'}</span>
                          </div>
                          {r.total !== undefined && modMade(p.action, r.total) && <p className="roll-effect-card__made">Makes {modMade(p.action, r.total)}</p>}
                          {/* A negative roll's effect is 0 (ruling 61). */}
                          {r.total !== undefined && r.total < 0 && (p.action === 'attack' || p.action === 'defend' || p.action === 'recover') && <p className="roll-effect-card__made">Counts as 0</p>}
                          <ul className="roll-chips" aria-label={`Mods on ${effectLabel(p)}`}>
                            {r.mods.map((m) => (
                              <ModChip key={m.id} mod={m} at={i} labels={cardLabels} onMove={move} />
                            ))}
                            {r.mods.length === 0 && <li className="roll-chips__none">No mods</li>}
                          </ul>
                        </div>
                      )
                    })}
                    {minionCards.map((c, j) => (
                      <div
                        key={`minion-${j}`}
                        className={dragOver === c.index ? 'roll-effect-card roll-effect-card--over' : 'roll-effect-card'}
                        role="group"
                        aria-label={`${cardLabels[c.index]} (${USE_LABEL[c.use]})`}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setDragOver(c.index)
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null)
                        }}
                        onDrop={onDrop(c.index)}
                      >
                        <div className="roll-effect-card__top">
                          <strong>{cardLabels[c.index]}</strong>
                          <span className="roll-effect-card__uses">
                            Uses {USE_LABEL[c.use]} ({c.base})
                          </span>
                          <span className="roll-effect-card__total">{c.total}</span>
                        </div>
                        <p className="roll-effect-card__made">
                          Makes a <DieIcon die={c.die} size="inline" /> minion
                        </p>
                        <ul className="roll-chips" aria-label={`Mods on ${cardLabels[c.index]}`}>
                          {c.mods.map((m) => (
                            <ModChip key={m.id} mod={m} at={c.index} labels={cardLabels} onMove={move} />
                          ))}
                          {c.mods.length === 0 && <li className="roll-chips__none">No mods</li>}
                        </ul>
                      </div>
                    ))}
                  </>
                )}
                {(needs.damage || needs.other) && (
                  <fieldset className="roll-section">
                    <legend>Values the dice don’t give</legend>
                    {needs.damage && <Field label="Damage taken">{(id) => <input id={id} type="number" inputMode="numeric" min={0} value={given.damage} onChange={(e) => setGiven((g) => ({ ...g, damage: e.target.value }))} />}</Field>}
                    {needs.other && <Field label="Value from the ability’s text">{(id) => <input id={id} type="number" inputMode="numeric" value={given.other} onChange={(e) => setGiven((g) => ({ ...g, other: e.target.value }))} />}</Field>}
                  </fieldset>
                )}
                <div className="button-row">
                  <button type="button" className="button button--primary" disabled={missingValue} onClick={() => setStep(2)}>
                    Confirm
                  </button>
                  <button type="button" className="button" onClick={back}>
                    Back
                  </button>
                </div>
              </>
            )}

            {step === 2 && rolled && (
              <>
                <p className="label">Tell the table</p>
                <ul className="roll-results">
                  {minionCards.map((c, j) => (
                    <li key={`m${j}`}>
                      Make a <DieIcon die={c.die} size="inline" /> minion ({USE_LABEL[c.use]} {c.total}).
                    </li>
                  ))}
                  {finalResults.map((r, i) => (
                    <li key={i}>
                      <ActionIcon action={r.action} decorative />
                      {describeEffect(r)}
                    </li>
                  ))}
                </ul>
                {picker}
                {toggle && <ShowOtherSide label={toggle} checked={showOther} onChange={setShowOther} />}
                {targetsFor &&
                  pickTargets === 'all' &&
                  finalResults.map((r, i) => {
                    if ((r.action !== 'attack' && r.action !== 'defend') || r.total === undefined) return null
                    const action = r.action
                    const several = finalResults.filter((x) => x.action === action).length > 1
                    const word = action === 'attack' ? 'Target' : 'Protect'
                    const to = targetOf(i, action)
                    const list = listFor(action, [to])
                    // Someone chosen who has since left isn't shown as another choice: they're asked to choose again.
                    const gone = to !== '' && !allOptions(list).some((o) => o.id === to)
                    return (
                      <Field key={`target-${i}`} label={several ? `${word} for ${describeEffect(r).replace(/\.$/, '')}` : word}>
                        {(id) => (
                          <select id={id} value={gone ? GONE : to} onChange={(e) => setAttackTo((all) => ({ ...all, [i]: e.target.value }))}>
                            {gone && (
                              <option value={GONE} disabled>
                                They've left. Choose again
                              </option>
                            )}
                            <TargetOptions list={list} />
                          </select>
                        )}
                      </Field>
                    )
                  })}
                {targetsFor && pickTargets === 'all' && finalResults.some((r) => r.action === 'attack' && r.total !== undefined) && <p className="hint">A hero or villain target loses that much Health, after one of its defenses. A minion or lieutenant rolls its save.</p>}
                {minionCards.map((c, j) => (
                  <fieldset key={`made-${j}`} className="roll-section">
                    <legend>
                      New minion{creates.length > 1 ? ` ${j + 1}` : ''}: <DieIcon die={c.die} size="inline" />
                    </legend>
                    <Field label="Name">{(id) => <input id={id} type="text" value={made[j]!.name} placeholder={creates.length > 1 ? `Minion ${j + 1}` : 'Minion'} onChange={(e) => setMade((all) => all.map((m, k) => (k === j ? { ...m, name: e.target.value } : m)))} />}</Field>
                    <Field label="Action it can take">
                      {(id) => (
                        <select id={id} value={takesAnyAction(made[j]!.form) ? 'any' : made[j]!.action} disabled={takesAnyAction(made[j]!.form)} onChange={(e) => setMade((all) => all.map((m, k) => (k === j ? { ...m, action: e.target.value as BasicAction } : m)))}>
                          {takesAnyAction(made[j]!.form) && <option value="any">Any basic action</option>}
                          {BASIC_ACTIONS.map((a) => (
                            <option key={a} value={a}>
                              {ACTION_LABEL[a]}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                    {minionForms.length > 0 && (
                      <Field label="Minion form">
                        {(id) => (
                          <select id={id} value={made[j]!.form} onChange={(e) => setMade((all) => all.map((m, k) => (k === j ? { ...m, form: e.target.value } : m)))}>
                            <option value="">None</option>
                            {minionForms.map((f) => (
                              <option key={f.name} value={f.name}>
                                {f.name} (needs a +{f.minBonus} bonus)
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>
                    )}
                  </fieldset>
                ))}
                {finalResults.map((r: EffectResult, i) => {
                  if ((r.action !== 'boost' && r.action !== 'hinder') || r.total === undefined || modSize(r.total) === 0) return null
                  const value = (r.action === 'boost' ? 1 : -1) * modSize(r.total)
                  const flags = subject.kind === 'ability' ? modFlagsFor(subject.text, active[i]!) : { persistent: false, exclusive: false }
                  const action = r.action
                  return <ModOffer key={i} value={value} label={title} persistent={flags.persistent} exclusive={flags.exclusive} list={targetsFor && ((keep) => listFor(action, keep))} selfId={selfId} chosen={followUps[i]} onChange={(f) => setFollowUps((all) => ({ ...all, [i]: f }))} />
                })}
                <div className="button-row">
                  <button type="button" className="button button--primary" onClick={done}>
                    Done
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      // The results can change on the way back, so the follow-ups are chosen again.
                      setFollowUps({})
                      setAttackTo({})
                      setStep(1)
                    }}
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * A follow-up to a Boost or Hinder: add its mod to yourself or give it to someone else at the
 * table, when the roll is done. The label and kind can be edited first. Not adding it is the
 * way to leave it out, so its For list has no "No target".
 */
function ModOffer({
  value,
  label: start,
  persistent: p,
  exclusive: x,
  list,
  selfId,
  chosen,
  onChange,
}: {
  value: number
  label: string
  persistent: boolean
  exclusive: boolean
  /** Who it can go to (with these kept listed), at a table; away from one, it's for the roller. */
  list: ((keep: readonly string[]) => TargetList) | undefined
  selfId: string
  chosen: FollowUpMod | undefined
  onChange: (f: FollowUpMod | undefined) => void
}) {
  const id = useId()
  const [label, setLabel] = useState(start)
  const [persistent, setPersistent] = useState(p)
  const [exclusive, setExclusive] = useState(x)
  const [to, setTo] = useState<string | null>(null)
  // A bonus starts on the roller (or the first ally, for a roller who can't hold one); a penalty on the first opponent, if there is one. Either stays listed.
  const first = list?.([]).likely[0]?.id
  const fallback = value > 0 ? selfId || first || '' : (first ?? selfId)
  const listed = list ? list([to ?? fallback]) : undefined
  // With nobody but the roller to give it to (solo, no minions), there's no For choice.
  const options = listed && allOptions(listed).some((o) => o.id !== selfId) ? listed : undefined
  // Someone who was chosen and has since left isn't swapped for someone else: that could put their penalty on you.
  const gone = Boolean(options) && to !== null && !allOptions(options!).some((o) => o.id === to)
  const target = !options || gone ? undefined : (to ?? fallback)
  const nameOf = (t: string) => (list ? allOptions(list([t])).find((o) => o.id === t)?.name : undefined)
  const what = value > 0 ? `+${value} bonus` : `${value} penalty`
  const toOther = target !== undefined && target !== selfId
  if (chosen) {
    // Chosen, for when the roll is done; it can still be changed, e.g. if they leave.
    const recipient = chosen.to ? nameOf(chosen.to) : undefined
    return (
      <div className="roll-section roll-followup" role="group" aria-label={`Add the ${what} to the mods list?`}>
        <p>{chosen.to ? `Will give ${describeMod(chosen.mod)} to ${recipient ?? 'someone who has left'} when done.` : `Will add ${describeMod(chosen.mod)} when done.`}</p>
        {chosen.to && !recipient && <p className="hint">They have left the game. Change who it’s for.</p>}
        <button
          type="button"
          className="button button--small"
          onClick={() => {
            onChange(undefined)
            // The button goes away; focus goes to the offer's first field rather than the page.
            requestAnimationFrame(() => document.getElementById(options ? `${id}-to` : id)?.focus())
          }}
        >
          Change
        </button>
      </div>
    )
  }
  return (
    <fieldset className="roll-section">
      <legend>Add the {what} to the mods list?</legend>
      {value < 0 && !options && <p className="hint">Only if the penalty is on you.</p>}
      {options && (
        <label className="field" htmlFor={`${id}-to`}>
          <span>For</span>
          <select id={`${id}-to`} value={gone ? GONE : target} onChange={(e) => setTo(e.target.value)}>
            {gone && (
              <option value={GONE} disabled>
                Choose who it’s for
              </option>
            )}
            <TargetOptions list={options} noTarget={false} />
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
      {gone && <p className="hint">{nameOf(to!) ?? 'They'} have left the game. Choose who it’s for.</p>}
      <button
        type="button"
        className="button"
        disabled={gone || !label.trim()}
        onClick={() => onChange({ mod: { label, value, ...(persistent ? { persistent: true } : {}), ...(exclusive ? { exclusive: true } : {}) }, ...(toOther ? { to: target } : {}) })}
      >
        {toOther ? `Give ${what} to ${nameOf(target!) ?? 'them'}` : `Add ${what}`}
      </button>
    </fieldset>
  )
}
