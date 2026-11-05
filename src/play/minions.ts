/**
 * A Minion-Maker's minions in play (docs/design/hero-sheet/spec.md, "Your minions"; Core Rules
 * p. 86–88). Pure: making, shrinking and removing minions, their own bonuses and penalties, and
 * a minion's roll of its single die. Every change returns the new state with a history entry.
 *
 * - A minion's size comes from the roll's result on the minion chart in the data; the Mid die
 *   sets it unless the ability names Max or Min (ruling 62).
 * - A minion takes only the basic action it was made with; an Autonomous one takes any.
 * - A minion's roll is its one die plus its own checked mods, never below 0 for the effect
 *   (ruling 61); the hero's mods don't apply.
 * - Shrinking below the smallest die removes it.
 */
import { archetypesById } from '../rules/data'
import { stepDie } from '../rules/dice'
import type { BasicAction, Die, EffectUse } from '../rules/types'
import type { PlayMinion, PlayMod, PlayState } from '../hero/model'
import { describeEffect, effectAmount } from './roll'
import { describeMod, modName, type Clock } from './state'

const ACTION_NAME: Record<BasicAction, string> = { attack: 'Attack', defend: 'Defend', boost: 'Boost', hinder: 'Hinder', overcome: 'Overcome' }

/** "Attack", or "Any basic action" for an Autonomous minion. */
export const minionActionText = (action: PlayMinion['action']) => (action === 'any' ? 'Any basic action' : ACTION_NAME[action])

/**
 * Whether a minion form lets the minion take any basic action, going by its effect in the
 * data (Autonomous: "can take any of the basic actions").
 */
export function takesAnyAction(form: string | undefined): boolean {
  if (!form) return false
  const effect = archetypesById.get('minion-maker')?.minionForms?.forms.find((f) => f.name === form)?.effect ?? ''
  return /\bany of the basic actions\b/i.test(effect)
}

/** The action a minion is made with: the one chosen, or any for a form that allows it. */
export function minionAction(form: string | undefined, chosen: BasicAction): PlayMinion['action'] {
  return takesAnyAction(form) ? 'any' : chosen
}

/** The minion chart (p. 87), from the data. */
function sizeChart() {
  const chart = archetypesById.get('minion-maker')?.minionRules?.sizeByResult
  if (!chart) throw new Error('data/heroes/archetypes.json: Minion-Maker has no minion chart')
  return chart
}

/** The minion's die for a roll's result, from the minion chart. */
export function minionSize(result: number): Die {
  const row = sizeChart().find((r) => (r.min === undefined || result >= r.min) && (r.max === undefined || result <= r.max))
  return (row ?? sizeChart().at(-1)!).die
}

/**
 * The dice an ability makes minions with, one per minion, going by its text: "Create a minion …
 * Use your Min die", "Create two minions …, one with your Max die and one with your Mid die".
 * The Mid die when the text names none (ruling 62); undefined for an ability that makes none.
 */
export function minionCreation(text: string): EffectUse[] | undefined {
  if (!/\bcreate (a|an|one|two|three) minions?\b/i.test(text)) return undefined
  const named = [...text.matchAll(/\b(Max|Mid|Min) die\b/g)].map((m) => m[1]!.toLowerCase() as EffectUse)
  const count = /\bcreate two minions\b/i.test(text) ? 2 : /\bcreate three minions\b/i.test(text) ? 3 : 1
  return Array.from({ length: count }, (_, i) => named[i] ?? named[0] ?? 'mid')
}

const entry = (clock: Clock, text: string, details?: string[]) => ({ id: clock.newId(), at: clock.now.toISOString(), text, ...(details?.length ? { details } : {}) })
const minionsOf = (play: Pick<PlayState, 'minions'>) => play.minions ?? []
const label = (m: Pick<PlayMinion, 'name' | 'die'>) => `${m.name} (${m.die})`

export function addMinion(play: PlayState, minion: Omit<PlayMinion, 'id' | 'mods'>, clock: Clock): PlayState {
  const made: PlayMinion = { ...minion, id: clock.newId(), mods: [] }
  return {
    ...play,
    minions: [...minionsOf(play), made],
    history: [...play.history, entry(clock, `Made a minion: ${label(made)}${made.form ? `, ${made.form}` : ''}, ${minionActionText(made.action).toLowerCase()}.`)],
  }
}

export function removeMinion(play: PlayState, id: string, clock: Clock, why = 'Removed'): PlayState {
  const gone = minionsOf(play).find((m) => m.id === id)
  if (!gone) return play
  return { ...play, minions: minionsOf(play).filter((m) => m.id !== id), history: [...play.history, entry(clock, `${why} ${label(gone)}.`)] }
}

/** A die size smaller; below the smallest die the minion is gone. */
export function shrinkMinion(play: PlayState, id: string, clock: Clock): PlayState {
  const m = minionsOf(play).find((x) => x.id === id)
  if (!m) return play
  const smaller = stepDie(m.die, -1)
  if (smaller === m.die) return removeMinion(play, id, clock, 'Shrank away:')
  return { ...play, minions: minionsOf(play).map((x) => (x.id === id ? { ...x, die: smaller } : x)), history: [...play.history, entry(clock, `${m.name} shrank to ${smaller}.`)] }
}

export function addMinionMod(play: PlayState, id: string, mod: Omit<PlayMod, 'id'>, clock: Clock): PlayState {
  const m = minionsOf(play).find((x) => x.id === id)
  if (!m) return play
  const added = { ...mod, id: clock.newId() }
  return { ...play, minions: minionsOf(play).map((x) => (x.id === id ? { ...x, mods: [...x.mods, added] } : x)), history: [...play.history, entry(clock, `${m.name} gained ${describeMod(added)}.`)] }
}

export function removeMinionMod(play: PlayState, id: string, modId: string, clock: Clock): PlayState {
  const m = minionsOf(play).find((x) => x.id === id)
  const mod = m?.mods.find((x) => x.id === modId)
  if (!m || !mod) return play
  return { ...play, minions: minionsOf(play).map((x) => (x.id === id ? { ...x, mods: x.mods.filter((y) => y.id !== modId) } : x)), history: [...play.history, entry(clock, `${m.name}: removed ${describeMod(mod)}.`)] }
}

/**
 * Picks a minion form for a minion whose form left the hero's sheet (`needsForm`, set by a sheet
 * update: ../game/reconcile.ts). A form that lets it take any basic action makes it Autonomous;
 * otherwise it keeps the action it was made with.
 */
export function setMinionForm(play: PlayState, id: string, form: string, clock: Clock): PlayState {
  const m = minionsOf(play).find((x) => x.id === id)
  if (!m || (m.form === form && !m.needsForm)) return play
  const action = takesAnyAction(form) ? 'any' : m.action
  const { needsForm: _, ...rest } = m
  return { ...play, minions: minionsOf(play).map((x) => (x.id === id ? { ...rest, form, action } : x)), history: [...play.history, entry(clock, `${m.name} is now ${form}.`)] }
}

/** A minion's roll: its die's value plus its checked mods. */
export interface MinionRoll {
  action: BasicAction
  value: number
  mods: readonly PlayMod[]
  /** The number came from physical dice. */
  entered?: boolean
}

/** The roll's total: the die plus the mods (the effect is never below 0, ruling 61). */
export const minionTotal = (roll: Pick<MinionRoll, 'value' | 'mods'>) => roll.value + roll.mods.reduce((s, m) => s + m.value, 0)

/** "3 (4 − 1)": the total with its math. */
export function minionMath(roll: Pick<MinionRoll, 'value' | 'mods'>): string {
  if (!roll.mods.length) return String(minionTotal(roll))
  return `${minionTotal(roll)} (${roll.value}${roll.mods.map((m) => (m.value > 0 ? ` + ${m.value}` : ` − ${-m.value}`)).join('')})`
}

/** "Deal 6 damage.", "Hinder 3: a -1 penalty." */
export function minionEffect(roll: MinionRoll): string {
  return describeEffect({ action: roll.action, use: 'single', base: roll.value, mods: [...roll.mods], total: minionTotal(roll) })
}

/** Records a minion's roll and uses up the non-persistent mods it used (p. 26). */
export function recordMinionRoll(play: PlayState, id: string, roll: MinionRoll, clock: Clock): PlayState {
  const m = minionsOf(play).find((x) => x.id === id)
  // One waiting for a new form can't act.
  if (!m || m.needsForm) return play
  const usedUp = roll.mods.filter((x) => !x.persistent)
  const details = [roll.entered ? `Rolled ${roll.value} (physical dice).` : `${roll.value} (${m.die})`, minionEffect(roll), ...roll.mods.map((x) => `Applied ${describeMod(x)}.`)]
  return {
    ...play,
    minions: minionsOf(play).map((x) => (x.id === id ? { ...x, mods: x.mods.filter((y) => !usedUp.some((u) => u.id === y.id)) } : x)),
    history: [...play.history, { ...entry(clock, `${m.name} took ${ACTION_NAME[roll.action]}:`, details), roll: true as const }, ...usedUp.map((x) => entry(clock, `${m.name} used up ${modName(x)}.`))],
  }
}

/** The effect's amount: never below 0. */
export const minionAmount = (roll: Pick<MinionRoll, 'value' | 'mods'>) => effectAmount(minionTotal(roll))
