/**
 * The environment on the table (docs/design/npcs/spec.md, section 6): what a template brings in,
 * its dice, its twists and its attached minions and lieutenants. Pure, given the dice.
 *
 * - Its aspects are the environment dice. Rolling them all gives Min, Mid and Max, each from an
 *   aspect: the roll twists ask for.
 * - Twists are suggestions; the app only tracks which are used, and in which round.
 * - Its attached templates come on the table as environment-owned groups, revealed: they act on
 *   its turn and have no turn-order entry.
 * - All of it is the GM's: its log lines are GM-only, and players never get it (./project.ts).
 */
import { rollDie } from '../rules/rolling'
import type { Die } from '../rules/types'
import { ASPECT_COUNT, type EnvironmentAspect, type EnvironmentTemplate, type LieutenantTemplate, type MinionTemplate } from '../template/model'
import type { Clock } from '../play/state'
import { MAX_GROUP_SIZE, type AttachedOnTable, type EnvironmentOnTable, type Game, type NpcGroup, type TableTwist } from './model'
import { addGroup, GM, withLog } from './table'
import { describeEffect, effectAmount, overcomeOutcome, type RollRecord } from '../play/roll'
import type { ModInput } from './actions'
import { applyAttack, giveMod, protect } from './resolve'
import { parseTarget } from './roll-targets'

type Random = () => number

const gmLine = (game: Game, clock: Clock, text: string) => withLog(game, [{ id: clock.newId(), at: clock.now.toISOString(), by: game.environment?.name ?? 'Environment', text, gmOnly: true as const }])

/** A template's attached minions and lieutenants as found in the library: missing ones are left out. */
export type FoundAttached = { kind: 'minion'; doc: MinionTemplate } | { kind: 'lieutenant'; doc: LieutenantTemplate }

/** What an environment template brings in: copies of its aspects, twists and attached templates. Hidden, as everything arrives. */
export function environmentFromTemplate(t: EnvironmentTemplate, attached: readonly FoundAttached[]): Omit<EnvironmentOnTable, 'id'> {
  return {
    templateId: t.id,
    name: t.name,
    hidden: true,
    ...(t.description.trim() ? { description: t.description } : {}),
    aspects: t.aspects.map((a) => ({ ...a })),
    twists: t.twists.map((tw) => ({ ...tw })),
    attached: attached.map(({ kind, doc }) => ({ kind, templateId: doc.id, name: doc.name.trim() || (kind === 'minion' ? 'Minions' : 'Lieutenants'), die: doc.die, actions: doc.actions === 'any' ? 'any' : [...doc.actions], groupSize: doc.groupSize })),
  }
}

const changeEnvironment = (game: Game, fn: (env: EnvironmentOnTable) => EnvironmentOnTable): Game => (game.environment ? { ...game, environment: fn(game.environment) } : game)

/** Sets the environment's aspects (a quick-added one has none): exactly three, each with a die. */
export function setAspects(game: Game, aspects: readonly EnvironmentAspect[], clock: Clock): Game {
  if (!game.environment || aspects.length !== ASPECT_COUNT) return game
  const next = changeEnvironment(game, (env) => ({ ...env, aspects: aspects.map((a) => ({ name: a.name.trim(), die: a.die })) }))
  return gmLine(next, clock, `The GM set ${game.environment.name}'s aspects: ${aspects.map((a, i) => `${aspectName(a, i)} (${a.die})`).join(', ')}.`)
}

/** "Slick Tiles", or "Aspect 2" for an unnamed one. */
export const aspectName = (a: EnvironmentAspect, i: number) => a.name.trim() || `Aspect ${i + 1}`

/** One die of an environment roll: its value and the aspect it came from. */
export interface EnvironmentDie {
  value: number
  die: Die
  aspect: string
}

/** The environment dice, rolled: Min, Mid and Max. */
export interface EnvironmentRoll {
  min: EnvironmentDie
  mid: EnvironmentDie
  max: EnvironmentDie
}

/** Rolls the environment dice: all three aspects (undefined without three). */
export function rollAspects(aspects: readonly EnvironmentAspect[], random: Random): EnvironmentRoll | undefined {
  if (aspects.length !== ASPECT_COUNT) return undefined
  const dice = aspects.map((a, i) => ({ value: rollDie(a.die, random), die: a.die, aspect: aspectName(a, i) })).sort((a, b) => a.value - b.value)
  return { min: dice[0]!, mid: dice[1]!, max: dice[2]! }
}

/** Logs an environment roll, for the GM only: "Rolled the environment dice: Min 2 (Howling Wind), …". */
export function logEnvironmentRoll(game: Game, roll: EnvironmentRoll, clock: Clock): Game {
  const part = (label: string, d: EnvironmentDie) => `${label} ${d.value} (${d.aspect})`
  return gmLine(game, clock, `Rolled the environment dice: ${part('Min', roll.min)}, ${part('Mid', roll.mid)}, ${part('Max', roll.max)}.`)
}

/** "Floodlights", or the start of its text. */
export function twistTitle(t: Pick<TableTwist, 'name' | 'text'>): string {
  const name = t.name?.trim()
  if (name) return name
  const text = t.text.trim()
  return text.length > 40 ? `${text.slice(0, 40)}…` : text || 'A twist'
}

/** Marks a twist used in this round, or unused again, and logs it for the GM. */
export function setTwistUsed(game: Game, twistId: string, used: boolean, clock: Clock): Game {
  const twist = game.environment?.twists?.find((t) => t.id === twistId)
  if (!twist || Boolean(twist.used) === used) return game
  const next = changeEnvironment(game, (env) => ({
    ...env,
    twists: (env.twists ?? []).map((t) => {
      if (t.id !== twistId) return t
      if (used) return { ...t, used: { round: game.round } }
      const { used: _, ...rest } = t
      return rest
    }),
  }))
  return gmLine(next, clock, used ? `Twist used: ${twistTitle(twist)}.` : `Twist marked unused: ${twistTitle(twist)}.`)
}

/** Clears every twist's use (the panel's ⋯ › Reset twists). */
export function resetTwists(game: Game, clock: Clock): Game {
  if (!game.environment?.twists?.some((t) => t.used)) return game
  const next = changeEnvironment(game, (env) => ({ ...env, twists: (env.twists ?? []).map((t) => {
      const { used: _, ...rest } = t
      return rest
    }),
  }))
  return gmLine(next, clock, 'The GM reset the twists: none are used.')
}

const groupKind = (a: Pick<AttachedOnTable, 'kind'>): NpcGroup['kind'] => (a.kind === 'minion' ? 'minions' : 'lieutenants')

/** The environment's group on the table made from an attached template, if there is one. */
export function attachedGroup(game: Pick<Game, 'groups'>, a: Pick<AttachedOnTable, 'kind' | 'templateId'>): NpcGroup | undefined {
  return game.groups.find((g) => g.owner.kind === 'environment' && g.templateId === a.templateId && g.kind === groupKind(a))
}

/**
 * Adds `count` of an attached template to the table: a new environment-owned group, revealed, or
 * more members in the group already made from it (up to the most a group holds). Logged for all.
 */
export function addAttached(game: Game, index: number, count: number, clock: Clock): Game {
  const a = game.environment?.attached?.[index]
  if (!a || !Number.isInteger(count) || count < 1) return game
  const existing = attachedGroup(game, a)
  if (!existing) return addGroup(game, { kind: groupKind(a), name: a.name, die: a.die, count: Math.min(count, MAX_GROUP_SIZE), hidden: false, actions: a.actions, templateId: a.templateId, owner: { kind: 'environment' } }, clock)
  const room = Math.min(count, MAX_GROUP_SIZE - existing.members.length)
  if (room < 1) return game
  const start = Math.max(0, ...existing.members.map((m) => m.n))
  const added = Array.from({ length: room }, (_, i) => ({ id: clock.newId(), n: start + i + 1, die: a.die, mods: [], acted: false }))
  const next = { ...game, groups: game.groups.map((g) => (g.id === existing.id ? { ...g, members: [...g.members, ...added] } : g)) }
  return withLog(next, [{ id: clock.newId(), at: clock.now.toISOString(), by: GM, text: `The GM added ${room} more to ${existing.name}.`, ...(existing.hidden ? { gmOnly: true as const } : {}) }])
}

/**
 * A basic action with the environment dice (spec section 6), as the roll dialog confirmed it: the
 * roll is logged ("Rooftop Heist used the environment dice: Deal 6 (Max) damage."), then each
 * result goes to its target: an Attack takes Health or rolls a save, a Defend gives a defense,
 * and a Boost's or Hinder's mod goes to whoever it was given to. The environment itself holds
 * none of these, so results without a target only show in the log. A hidden environment's lines
 * are the GM's.
 */
export function environmentBasicAction(game: Game, record: RollRecord, followUps: readonly { mod: ModInput; to?: string }[], choices: readonly { result: number; to: string }[], random: Random, clock: Clock): Game {
  const env = game.environment
  if (!env) return game
  const by = env.name
  const gmOnly = env.hidden
  const said = record.results.map((r) => (r.action === 'overcome' && r.total !== undefined ? `Overcome ${r.total} (${overcomeOutcome(r.total)}).` : describeEffect(r))).join(' ')
  let next = withLog(game, [{ id: clock.newId(), at: clock.now.toISOString(), by, text: `${by} used the environment dice: ${said}`, ...(gmOnly ? { gmOnly: true as const } : {}) }])
  for (const c of choices) {
    const r = record.results[c.result]
    const to = c.to ? parseTarget(c.to) : undefined
    if (!r || r.total === undefined || !to) continue
    if (r.action === 'attack') next = applyAttack(next, by, to, effectAmount(r.total), random, clock, gmOnly).game
    else if (r.action === 'defend') next = protect(next, by, to, effectAmount(r.total), clock, gmOnly)
  }
  for (const f of followUps) {
    const to = f.to ? parseTarget(f.to) : undefined
    if (to) next = giveMod(next, to, f.mod, by, clock, !gmOnly)
  }
  return next
}
