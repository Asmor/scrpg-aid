/**
 * Using an ability or a basic action in the game aid (Phase 3). Pure: building the dice
 * pool, sorting the roll into Min/Mid/Max (p. 20–21), choosing mods by the rules (one
 * exclusive bonus and one exclusive penalty at most; penalties are mandatory, bonuses
 * optional; data/rules/core-concepts.md "Mod rules" has the user's rulings), giving each
 * effect its value with the mods assigned to it, and writing the history.
 */
import type { AbilityUse } from '../creation/sheet'
import { ACTION_LABEL } from '../creation/effects'
import type { HeroTrait } from '../creation/traits'
import type { PlayHistoryEntry, PlayMod } from '../hero/model'
import type { Action, AbilityEffect, Die, EffectUse } from '../rules/types'
import { describeMod, type Clock, type PlayCore } from './state'

/** A die in the pool and what it stands for ("Speed d12", "Green status d8"). */
export interface PoolDie {
  label: string
  die: Die
}

export interface Rolled extends PoolDie {
  value: number
}

/** The sorted results of a normal three-die roll (ties in the order given). */
export interface Sorted {
  max: Rolled
  mid: Rolled
  min: Rolled
}

export function sortRolls(rolled: readonly Rolled[]): Sorted | undefined {
  if (rolled.length !== 3) return undefined
  const [max, mid, min] = [...rolled].sort((a, b) => b.value - a.value)
  return { max: max!, mid: mid!, min: min! }
}

/** Two or more dice came up the same (p. 21: some abilities care). */
export function hasDoubles(rolled: readonly Rolled[]): boolean {
  return new Set(rolled.map((r) => r.value)).size < rolled.length
}

export const USE_LABEL: Record<EffectUse, string> = {
  max: 'Max',
  mid: 'Mid',
  min: 'Min',
  'max+mid': 'Max+Mid',
  'max+min': 'Max+Min',
  'mid+min': 'Mid+Min',
  'max+mid+min': 'Max+Mid+Min',
  single: 'single die',
  damage: 'damage taken',
  other: 'given value',
}

/** Values a roll can't give, typed in by the player. */
export interface GivenValues {
  damage?: number
  other?: number
}

/** An effect's value before mods, or undefined when it needs a value that wasn't given. */
export function useValue(use: EffectUse, rolled: readonly Rolled[], given: GivenValues = {}): number | undefined {
  if (use === 'damage') return given.damage
  if (use === 'other') return given.other
  if (use === 'single') return rolled.length === 1 ? rolled[0]!.value : undefined
  const sorted = sortRolls(rolled)
  if (!sorted) return undefined
  return use.split('+').reduce((sum, part) => sum + sorted[part as 'max' | 'mid' | 'min'].value, 0)
}

/**
 * The mod a Boost or Hinder makes, and an Overcome's outcome, both go by bands of four
 * (p. 25–26): 0 or less, 1–3, 4–7, 8–11, 12 and up.
 */
const band = (value: number) => (value <= 0 ? 0 : Math.min(4, Math.floor(value / 4) + 1))

/** The size of the bonus or penalty a Boost or Hinder with this value makes (0: none). */
export function modSize(value: number): number {
  return band(value)
}

const OUTCOMES = ['Spectacular failure', 'Failure, or success with a major twist', 'Success with a minor twist', 'Full success', 'Success with an extra benefit'] as const

export function overcomeOutcome(value: number): string {
  return OUTCOMES[band(value)]!
}

/** Which mods a roll uses: non-exclusive ones by id, and at most one exclusive bonus and penalty. */
export interface ModChoice {
  nonExclusive: string[]
  exclusiveBonus: string | null
  exclusivePenalty: string | null
}

/**
 * The starting choice (GOAL.md): every non-exclusive penalty and persistent bonus checked,
 * and the largest exclusive bonus and penalty picked.
 */
export function defaultModChoice(mods: readonly PlayMod[]): ModChoice {
  const largest = (list: PlayMod[]) => list.reduce<PlayMod | undefined>((best, m) => (!best || Math.abs(m.value) > Math.abs(best.value) ? m : best), undefined)?.id ?? null
  return {
    nonExclusive: mods.filter((m) => !m.exclusive && (m.value < 0 || m.persistent)).map((m) => m.id),
    exclusiveBonus: largest(mods.filter((m) => m.exclusive && m.value > 0)),
    exclusivePenalty: largest(mods.filter((m) => m.exclusive && m.value < 0)),
  }
}

export function chosenMods(mods: readonly PlayMod[], choice: ModChoice): PlayMod[] {
  return mods.filter((m) => (m.exclusive ? m.id === choice.exclusiveBonus || m.id === choice.exclusivePenalty : choice.nonExclusive.includes(m.id)))
}

/** An effect as the player resolves it: which of its actions and uses, and whether it's taken. */
export interface EffectPlan {
  effect: AbilityEffect
  action: Action
  use: EffectUse
  /** Optional effects can be left out; doubles-only effects need doubles. */
  included: boolean
}

export function defaultPlans(effects: readonly AbilityEffect[]): EffectPlan[] {
  return effects.map((effect) => ({ effect, action: effect.actions[0]!, use: Array.isArray(effect.use) ? effect.use[0]! : effect.use, included: !effect.optional }))
}

/** The effects that happen with this roll: those included, with doubles-only ones needing doubles. */
export function activePlans(plans: readonly EffectPlan[], rolled: readonly Rolled[]): EffectPlan[] {
  const doubles = hasDoubles(rolled)
  return plans
    .filter((p) => p.included && (p.effect.when !== 'doubles' || doubles))
    .map((p) => (doubles && p.effect.doublesUse ? { ...p, use: p.effect.doublesUse } : p))
}

export interface EffectResult {
  action: Action
  use: EffectUse
  base: number | undefined
  mods: PlayMod[]
  total: number | undefined
}

/**
 * The starting mod assignment (GOAL.md): with one effect every mod goes on it; with more,
 * on the effect with the largest value. Returns each mod's effect index.
 */
export function defaultAssignment(mods: readonly PlayMod[], bases: readonly (number | undefined)[]): Record<string, number> {
  let best = 0
  bases.forEach((b, i) => {
    if ((b ?? -Infinity) > (bases[best] ?? -Infinity)) best = i
  })
  return Object.fromEntries(mods.map((m) => [m.id, best]))
}

export function results(plans: readonly EffectPlan[], rolled: readonly Rolled[], given: GivenValues, mods: readonly PlayMod[], assignment: Record<string, number>): EffectResult[] {
  return plans.map((p, i) => {
    const base = useValue(p.use, rolled, given)
    const on = mods.filter((m) => (assignment[m.id] ?? 0) === i)
    return { action: p.action, use: p.use, base, mods: on, total: base === undefined ? undefined : base + on.reduce((s, m) => s + m.value, 0) }
  })
}

/** "Max: 7 (Speed d12)", or "7 (Speed d12)" for a single die. */
export function describeRolls(rolled: readonly Rolled[]): string[] {
  const sorted = sortRolls(rolled)
  if (!sorted) return rolled.map((r) => `${r.value} (${r.label} ${r.die})`)
  return (['max', 'mid', 'min'] as const).map((k) => `${USE_LABEL[k]}: ${sorted[k].value} (${sorted[k].label} ${sorted[k].die})`)
}

/** "Deal 7 (Max) damage.", "Boost 6 (Mid): a +2 bonus.", "Overcome 9 (Max): Full success." */
export function describeEffect(r: EffectResult): string {
  const how = USE_LABEL[r.use]
  const modText = r.mods.length ? `, with ${r.mods.map((m) => (m.value > 0 ? `+${m.value}` : `${m.value}`)).join(' ')}` : ''
  if (r.total === undefined) return `${ACTION_LABEL[r.action]} (${how}): needs a value.`
  const v = `${r.total} (${how}${modText})`
  switch (r.action) {
    case 'attack':
      return `Deal ${v} damage.`
    case 'defend':
      return `Defend ${v}.`
    case 'boost': {
      const size = modSize(r.total)
      return `Boost ${v}: ${size ? `a +${size} bonus` : 'no bonus'}.`
    }
    case 'hinder': {
      const size = modSize(r.total)
      return `Hinder ${v}: ${size ? `a -${size} penalty` : 'no penalty'}.`
    }
    case 'overcome':
      return `Overcome ${v}: ${overcomeOutcome(r.total)}.`
    case 'recover':
      return `Recover ${v} Health.`
  }
}

/** A power or quality as a roll needs it: its name and die. */
type RolledTrait = Pick<HeroTrait, 'name' | 'die'>

/**
 * The pool for using an ability: the two traits picked (normally its own power or quality
 * and one of the other kind) and the status die; or, for a single-die ability, that one die
 * (`named`: the power or quality it names). Basic actions pass no `use`.
 */
export function poolDice(opts: { use?: AbilityUse; picked?: readonly (RolledTrait | undefined)[]; named?: RolledTrait; status?: PoolDie; redStatus?: Die }): PoolDie[] {
  const single = opts.use?.pool?.single
  const trait = (t?: RolledTrait) => (t ? [{ label: t.name, die: t.die }] : [])
  if (single === 'status') return opts.status ? [opts.status] : []
  if (single === 'redStatus') return opts.redStatus ? [{ label: 'Red status', die: opts.redStatus }] : []
  if (single === 'trait') return trait(opts.named)
  return [...(opts.picked ?? []).flatMap(trait), ...(opts.status ? [opts.status] : [])]
}

/**
 * Whether the mod a Boost or Hinder made starts out persistent and exclusive, going by the
 * ability's text. "Use your Max die, or use your Mid die and make it persistent": the first
 * choice isn't. Only a starting point; the player can change them before adding the mod.
 */
export function modFlagsFor(text: string, plan: Pick<EffectPlan, 'effect' | 'use'>): { persistent: boolean; exclusive: boolean } {
  const first = Array.isArray(plan.effect.use) && plan.use === plan.effect.use[0]
  return { persistent: !first && /\bpersistent\b/i.test(text), exclusive: !first && /\bexclusive\b/i.test(text) }
}

/** What a confirmed roll records: its title, its dice and effects, and the mods it used up. */
export interface RollRecord {
  title: string
  rolled: Rolled[]
  results: EffectResult[]
  /** Whether the dice were typed in from real dice. */
  manual: boolean
}

/** Writes the roll to the history and uses up the non-persistent mods it used (p. 26). */
export function confirmRoll<P extends PlayCore>(play: P, record: RollRecord, clock: Clock): P {
  const used = record.results.flatMap((r) => r.mods)
  const details = [
    ...describeRolls(record.rolled).map((d) => (record.manual ? `${d} (typed in)` : d)),
    ...record.results.map(describeEffect),
    ...used.map((m) => `Applied ${describeMod(m)}.`),
  ]
  const at = clock.now.toISOString()
  const entries: PlayHistoryEntry[] = [{ id: clock.newId(), at, text: record.title, details, roll: true }]
  const usedUp = used.filter((m) => !m.persistent)
  for (const m of usedUp) entries.push({ id: clock.newId(), at, text: `Used up ${describeMod(m)}.`, details: [] })
  return {
    ...play,
    mods: play.mods.filter((m) => !usedUp.some((u) => u.id === m.id)),
    history: [...play.history, ...entries.map(({ details: d, ...e }) => (d?.length ? { ...e, details: d } : e))],
  }
}
