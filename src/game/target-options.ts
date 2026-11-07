/**
 * Who a result can go to (scrpg-aid-designs/npcs/spec.md, "Choosing targets"). Pure; every target
 * picker in the app uses it.
 *
 * Anyone can target anyone, but the list starts with the likely side: opponents for Attack and
 * Hinder, allies for Boost and Defend. "Show allies too" (or "Show opponents too") adds the other
 * side as a second, labeled group. Overcome has no target.
 *
 * - The heroes' side is the heroes and their minions; the opposition is the villains and the
 *   GM's groups.
 * - The environment's groups have no side: their members are in every list, whatever the effect
 *   or the toggle, in their own section named for the environment. When one of them (or the
 *   environment itself) acts, every list shows everyone, a section per side, with no toggle.
 * - The environment is never a target.
 * - The actor itself is labeled "(you)", its own group's members "(same group)", a hero's minions
 *   "(Swarmwright's minion)" (or "(your minion)" for the actor's own).
 * - The actor's own entries come first in its side, then everything else in table order.
 */
import { heroDisplayName, type Hero, type PlayState } from '../hero/model'
import type { BasicAction } from '../rules/types'
import { villainDisplayName } from '../villain/model'
import type { TableTarget } from './actions'
import type { Game } from './model'
import type { TableView } from './project'
import { targetId } from './roll-targets'
import { groupSuffix, memberName } from './table'

/**
 * Who is choosing: a hero, a hero's minion, a villain, a group's member, a whole group ("Same
 * target for all"), or the environment (its basic actions). The environment and its groups have
 * no side.
 */
export type TargetActor = TableTarget | { kind: 'group'; id: string } | { kind: 'environment' }

/** The table as a picker sees it: the GM sees everything, players only what's revealed. */
export interface TargetTable {
  heroes: readonly { id: string; name: string; minions: readonly { id: string; name: string }[] }[]
  villains: readonly { id: string; name: string }[]
  groups: readonly { id: string; name: string; owner?: { kind: 'gm' | 'environment' }; members: readonly { id: string; n: number }[] }[]
  /** The environment's name, for its groups' section ("Rooftop Heist"). */
  environment?: string
}

export interface TargetOption {
  /** The target's id (./roll-targets.ts targetId). */
  id: string
  name: string
}

export interface TargetList {
  /** The likely side's options. */
  likely: TargetOption[]
  /** The other side, when shown (or when one of its options is kept): "Allies" or "Opponents". */
  other?: { label: 'Allies' | 'Opponents'; options: TargetOption[] }
  /** Sections always shown after those: the environment's groups, or each side for an actor with none. */
  always?: { label: string; options: TargetOption[] }[]
  /** The actor has no side (the environment or one of its groups): everyone is listed, with no toggle. */
  sideless?: true
}

/** Every option in a list, every section. */
export const allOptions = (list: TargetList): TargetOption[] => [...list.likely, ...(list.other?.options ?? []), ...(list.always ?? []).flatMap((s) => s.options)]

type Side = 'heroes' | 'opposition'
export type Polarity = 'negative' | 'positive'

/** Attack and Hinder are negative, Boost and Defend positive; Overcome has no target. */
export function polarity(effect: BasicAction): Polarity | undefined {
  if (effect === 'attack' || effect === 'hinder') return 'negative'
  if (effect === 'boost' || effect === 'defend') return 'positive'
  return undefined
}

/** The toggle's label for a dialog whose effects have these polarities: one control per dialog. */
export function toggleLabel(polarities: readonly Polarity[]): string | undefined {
  const set = new Set(polarities)
  if (set.size === 0) return undefined
  if (set.size > 1) return 'Show the other side too'
  return set.has('negative') ? 'Show allies too' : 'Show opponents too'
}

const isEnvGroup = (g: { owner?: { kind: string } }) => g.owner?.kind === 'environment'
const withOwner = <G extends TargetTable['groups'][number]>(g: G) => ({ ...g, owner: g.owner ?? { kind: 'gm' as const } })

/** The actor's side, or none for the environment and its groups. */
function sideOf(actor: TargetActor, table: TargetTable): Side | undefined {
  if (actor.kind === 'hero' || actor.kind === 'heroMinion') return 'heroes'
  if (actor.kind === 'environment') return undefined
  const groupId = actor.kind === 'member' ? actor.groupId : actor.kind === 'group' ? actor.id : undefined
  const group = groupId === undefined ? undefined : table.groups.find((g) => g.id === groupId)
  return group && isEnvGroup(group) ? undefined : 'opposition'
}

/** Members of these groups, labeled for this actor: "(you)", "(same group)", its own group first. */
function memberOptions(table: TargetTable, groups: TargetTable['groups'], actor: TargetActor): TargetOption[] {
  const ownGroup = actor.kind === 'member' ? actor.groupId : actor.kind === 'group' ? actor.id : undefined
  return [...groups]
    .sort((a, b) => Number(b.id === ownGroup) - Number(a.id === ownGroup))
    .flatMap((g) =>
      g.members.map((m) => {
        // "Burglar 1 (Rooftop Heist)" when an environment's group shares a GM group's name.
        const name = memberName(g, m.n) + groupSuffix(table.groups.map(withOwner), withOwner(g), table.environment)
        const you = actor.kind === 'member' && actor.groupId === g.id && actor.memberId === m.id
        return { id: targetId({ kind: 'member', groupId: g.id, memberId: m.id }), name: you ? `${name} (you)` : g.id === ownGroup ? `${name} (same group)` : name }
      }),
    )
}

/** The environment's groups' section, if it has any members on the table. */
function environmentSection(table: TargetTable, actor: TargetActor): { label: string; options: TargetOption[] }[] {
  const options = memberOptions(table, table.groups.filter(isEnvGroup), actor)
  return options.length ? [{ label: table.environment || 'Environment', options }] : []
}

/** Every option on one side, the actor's own first, labeled for this actor. */
function sideOptions(table: TargetTable, side: Side, actor: TargetActor): TargetOption[] {
  if (side === 'heroes') {
    const ownHero = actor.kind === 'hero' ? actor.id : actor.kind === 'heroMinion' ? actor.heroId : undefined
    const heroes = [...table.heroes].sort((a, b) => Number(b.id === ownHero) - Number(a.id === ownHero))
    return heroes.flatMap((h) => [
      { id: targetId({ kind: 'hero', id: h.id }), name: actor.kind === 'hero' && actor.id === h.id ? `${h.name} (you)` : h.name },
      ...h.minions.map((m) => {
        const you = actor.kind === 'heroMinion' && actor.heroId === h.id && actor.minionId === m.id
        const owner = actor.kind === 'hero' && actor.id === h.id ? 'your minion' : `${h.name}'s minion`
        return { id: targetId({ kind: 'heroMinion', heroId: h.id, minionId: m.id }), name: you ? `${m.name} (you)` : `${m.name} (${owner})` }
      }),
    ])
  }
  const villains = [...table.villains].sort((a, b) => Number(actor.kind === 'villain' && b.id === actor.id) - Number(actor.kind === 'villain' && a.id === actor.id))
  return [
    ...villains.map((v) => ({ id: targetId({ kind: 'villain', id: v.id }), name: actor.kind === 'villain' && actor.id === v.id ? `${v.name} (you)` : v.name })),
    ...memberOptions(table, table.groups.filter((g) => !isEnvGroup(g)), actor),
  ]
}

/**
 * The options for `actor`'s `effect`: the likely side, then the other side when `showOtherSide`
 * is checked. An option in `keep` (a target already chosen) stays listed even with it unchecked.
 * Overcome has none. Pickers end every list with "No target".
 */
export function targetOptions(actor: TargetActor, effect: BasicAction, table: TargetTable, { showOtherSide = false, keep = [] }: { showOtherSide?: boolean; keep?: readonly string[] } = {}): TargetList {
  const p = polarity(effect)
  if (!p) return { likely: [] }
  const own = sideOf(actor, table)
  const env = environmentSection(table, actor)
  if (!own) {
    const sides = [
      { label: 'Heroes', options: sideOptions(table, 'heroes', actor) },
      { label: 'Opposition', options: sideOptions(table, 'opposition', actor) },
    ].filter((x) => x.options.length)
    return { likely: [], always: [...sides, ...env], sideless: true }
  }
  const likelySide: Side = p === 'positive' ? own : own === 'heroes' ? 'opposition' : 'heroes'
  const otherSide: Side = likelySide === 'heroes' ? 'opposition' : 'heroes'
  const likely = sideOptions(table, likelySide, actor)
  const all = sideOptions(table, otherSide, actor)
  const shown = showOtherSide ? all : all.filter((o) => keep.includes(o.id))
  return { likely, ...(shown.length ? { other: { label: p === 'negative' ? ('Allies' as const) : ('Opponents' as const), options: shown } } : {}), ...(env.length ? { always: env } : {}) }
}

/** The whole table, for the GM: hidden villains and groups too. */
export function gmTable(game: Game): TargetTable {
  return {
    heroes: game.heroes.map((h) => ({ id: h.id, name: heroDisplayName(h.sheet), minions: (h.play.minions ?? []).map((m) => ({ id: m.id, name: m.name })) })),
    villains: game.villains.map((v) => ({ id: v.id, name: villainDisplayName(v.sheet) })),
    groups: game.groups,
    ...(game.environment ? { environment: game.environment.name } : {}),
  }
}

/** The table as a player sees it: hidden villains and groups never appear. */
export function viewTable(view: Pick<TableView, 'heroes' | 'villains' | 'groups' | 'environment'>): TargetTable {
  return {
    heroes: view.heroes.map((h) => ({ id: h.id, name: heroDisplayName(h.sheet), minions: (h.play.minions ?? []).map((m) => ({ id: m.id, name: m.name })) })),
    villains: view.villains.filter((v) => !v.hidden),
    groups: view.groups.filter((g) => !g.hidden),
    ...(view.environment ? { environment: view.environment.name } : {}),
  }
}

/** Solo play: just the hero and their minions. */
export function soloTable(hero: Hero, play: Pick<PlayState, 'minions'>): TargetTable {
  return { heroes: [{ id: hero.id, name: heroDisplayName(hero), minions: (play.minions ?? []).map((m) => ({ id: m.id, name: m.name })) }], villains: [], groups: [] }
}
