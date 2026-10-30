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

/**
 * The mods checked when a roll starts (docs/design/hero-sheet/spec.md, "Roll flow"; the user
 * chose this over GOAL.md's older defaults): every non-exclusive penalty and the largest
 * exclusive penalty. Bonuses start unchecked.
 */
export function defaultModChoice(mods: readonly PlayMod[]): string[] {
  const exclusive = mods.filter((m) => m.exclusive && m.value < 0).reduce<PlayMod | undefined>((worst, m) => (!worst || m.value < worst.value ? m : worst), undefined)
  return mods.filter((m) => (m.value < 0 && !m.exclusive) || m === exclusive).map((m) => m.id)
}

/** Checks or unchecks a mod. Checking an exclusive one unchecks the other exclusive mod of the same sign (p. 26). */
export function toggleMod(mods: readonly PlayMod[], checked: readonly string[], id: string, on: boolean): string[] {
  const mod = mods.find((m) => m.id === id)
  if (!mod) return [...checked]
  if (!on) return checked.filter((x) => x !== id)
  const rivals = mod.exclusive ? mods.filter((m) => m.exclusive && m.id !== id && Math.sign(m.value) === Math.sign(mod.value)).map((m) => m.id) : []
  return [...checked.filter((x) => !rivals.includes(x) && x !== id), id]
}

/** The checked mods, in the list's order. */
export function chosenMods(mods: readonly PlayMod[], checked: readonly string[]): PlayMod[] {
  return mods.filter((m) => checked.includes(m.id))
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

/** The starting mod assignment (the hero sheet spec): every mod on the first effect. Returns each mod's effect index. */
export function defaultAssignment(mods: readonly PlayMod[]): Record<string, number> {
  return Object.fromEntries(mods.map((m) => [m.id, 0]))
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

/** What an effect amounts to: its total, but never below 0 (ruling 61: a damage roll of −1 deals 0). */
export function effectAmount(total: number): number {
  return Math.max(0, total)
}

/**
 * The action an effect line in the history is about ("Deal 6 damage." is an Attack), so the
 * latest roll card can show its icon; undefined for the other lines (dice, mods). Read from
 * the words describeEffect writes, so it works on saved history too.
 */
export function effectLineAction(line: string): Action | undefined {
  if (/^Deal \d+( \(.*\))? damage\.$/.test(line)) return 'attack'
  const word = /^(Attack|Defend|Boost|Hinder|Overcome|Recover) [\d(]/.exec(line)?.[1]
  return word ? (word.toLowerCase() as Action) : undefined
}

/** "Deal 7 (Max) damage.", "Boost 6 (Mid): a +2 bonus.", "Overcome 9 (Max): Full success." */
export function describeEffect(r: EffectResult): string {
  const how = USE_LABEL[r.use]
  const modText = r.mods.length ? `, with ${r.mods.map((m) => (m.value > 0 ? `+${m.value}` : `${m.value}`)).join(' ')}` : ''
  if (r.total === undefined) return `${ACTION_LABEL[r.action]} (${how}): needs a value.`
  // A negative roll shows what it came to, but the effect is 0 (ruling 61).
  const v = `${effectAmount(r.total)} (${how}${modText}${r.total < 0 ? `, rolled ${r.total}` : ''})`
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
  /** Minions the roll made: each one's die result, the mods moved onto it, and the size they came to. */
  made?: { label: string; base: number; mods: PlayMod[]; total: number; die: Die }[]
}

/** Writes the roll to the history and uses up the non-persistent mods it used (p. 26). */
export function confirmRoll<P extends PlayCore>(play: P, record: RollRecord, clock: Clock): P {
  const made = record.made ?? []
  const used = [...record.results.flatMap((r) => r.mods), ...made.flatMap((m) => m.mods)]
  const details = [
    ...describeRolls(record.rolled).map((d) => (record.manual ? `${d} (typed in)` : d)),
    ...record.results.map(describeEffect),
    ...made.map((m) => `${m.label}: ${m.base}${m.mods.map((x) => (x.value > 0 ? ` + ${x.value}` : ` − ${-x.value}`)).join('')} → a ${m.die} minion.`),
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

/** What a confirmed roll (and its follow-ups) changed on the roller, so Undo can reverse just that. */
export interface RollChange {
  /** The history entries it added. */
  history: string[]
  /** The mods it added (follow-ups). */
  added: string[]
  /** The mods it used up. */
  usedUp: PlayMod[]
  /** Whether it turned the reaction on. */
  reaction: boolean
  /** The roll's title, for a note that it was undone. */
  title: string
  /** Minions it made, and mods it gave the roller's minions (Minion-Maker), by id. */
  minions?: string[]
  minionMods?: string[]
}

/** The minions part of a play state, where a hero has one. */
type WithMinions = { minions?: readonly { id: string; mods: readonly { id: string }[] }[] }

/** The difference a roll made between two play states. */
export function rollChange(before: PlayCore & WithMinions, after: PlayCore & WithMinions, title: string): RollChange {
  const had = (list: readonly { id: string }[]) => new Set(list.map((x) => x.id))
  const beforeHistory = had(before.history)
  const beforeMods = had(before.mods)
  const afterMods = had(after.mods)
  return {
    history: after.history.filter((h) => !beforeHistory.has(h.id)).map((h) => h.id),
    added: after.mods.filter((m) => !beforeMods.has(m.id)).map((m) => m.id),
    usedUp: before.mods.filter((m) => !afterMods.has(m.id)),
    reaction: !before.reactionUsed && after.reactionUsed,
    title,
    ...(after.minions ? minionChanges(before.minions ?? [], after.minions) : {}),
  }
}

function minionChanges(before: NonNullable<WithMinions['minions']>, after: NonNullable<WithMinions['minions']>): Pick<RollChange, 'minions' | 'minionMods'> {
  const had = new Set(before.map((m) => m.id))
  const hadMods = new Set(before.flatMap((m) => m.mods.map((x) => x.id)))
  return { minions: after.filter((m) => !had.has(m.id)).map((m) => m.id), minionMods: after.flatMap((m) => m.mods.filter((x) => !hadMods.has(x.id)).map((x) => x.id)) }
}

/**
 * Undoes a roll on the current play state, leaving everything else that changed since alone
 * (Health, other mods, hero points). In a game the table has already seen the roll, so instead
 * of deleting its history it adds a note that it was undone.
 */
export function undoRoll<P extends PlayCore>(play: P, change: RollChange, shared?: Clock): P {
  const mods = [...play.mods.filter((m) => !change.added.includes(m.id)), ...change.usedUp.filter((m) => !play.mods.some((x) => x.id === m.id))]
  const history = shared
    ? [...play.history, { id: shared.newId(), at: shared.now.toISOString(), text: `Undid: ${change.title}` }]
    : play.history.filter((h) => !change.history.includes(h.id))
  const minions = (play as WithMinions).minions
  return {
    ...play,
    mods,
    history,
    ...(change.reaction ? { reactionUsed: false } : {}),
    ...(minions && (change.minions?.length || change.minionMods?.length)
      ? { minions: minions.filter((m) => !change.minions?.includes(m.id)).map((m) => ({ ...m, mods: m.mods.filter((x) => !change.minionMods?.includes(x.id)) })) }
      : {}),
  }
}
