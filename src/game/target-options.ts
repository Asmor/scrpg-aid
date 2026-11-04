/**
 * Who a result can go to (docs/design/npcs/spec.md, "Choosing targets"). Pure; every target
 * picker in the app uses it.
 *
 * Anyone can target anyone, but the list starts with the likely side: opponents for Attack and
 * Hinder, allies for Boost and Defend. "Show allies too" (or "Show opponents too") adds the other
 * side as a second, labeled group. Overcome has no target.
 *
 * - The heroes' side is the heroes and their minions; the opposition is the villains and every
 *   group (the GM's and the environment's).
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
import { memberName } from './table'

/**
 * Who is choosing: a hero, a hero's minion, a villain, a group's member, a whole group ("Same
 * target for all"), or the environment (its basic actions). The environment is on the
 * opposition's side, but isn't a target itself: it has no Health, mods or defenses.
 */
export type TargetActor = TableTarget | { kind: 'group'; id: string } | { kind: 'environment' }

/** The table as a picker sees it: the GM sees everything, players only what's revealed. */
export interface TargetTable {
  heroes: readonly { id: string; name: string; minions: readonly { id: string; name: string }[] }[]
  villains: readonly { id: string; name: string }[]
  groups: readonly { id: string; name: string; members: readonly { id: string; n: number }[] }[]
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
}

/** Every option in a list, both sides. */
export const allOptions = (list: TargetList): TargetOption[] => [...list.likely, ...(list.other?.options ?? [])]

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

const sideOf = (actor: TargetActor): Side => (actor.kind === 'hero' || actor.kind === 'heroMinion' ? 'heroes' : 'opposition')

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
  const ownGroup = actor.kind === 'member' ? actor.groupId : actor.kind === 'group' ? actor.id : undefined
  const groups = [...table.groups].sort((a, b) => Number(b.id === ownGroup) - Number(a.id === ownGroup))
  const villains = [...table.villains].sort((a, b) => Number(actor.kind === 'villain' && b.id === actor.id) - Number(actor.kind === 'villain' && a.id === actor.id))
  return [
    ...villains.map((v) => ({ id: targetId({ kind: 'villain', id: v.id }), name: actor.kind === 'villain' && actor.id === v.id ? `${v.name} (you)` : v.name })),
    ...groups.flatMap((g) =>
      g.members.map((m) => {
        const name = memberName(g, m.n)
        const you = actor.kind === 'member' && actor.groupId === g.id && actor.memberId === m.id
        return { id: targetId({ kind: 'member', groupId: g.id, memberId: m.id }), name: you ? `${name} (you)` : g.id === ownGroup ? `${name} (same group)` : name }
      }),
    ),
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
  const own = sideOf(actor)
  const likelySide: Side = p === 'positive' ? own : own === 'heroes' ? 'opposition' : 'heroes'
  const otherSide: Side = likelySide === 'heroes' ? 'opposition' : 'heroes'
  const likely = sideOptions(table, likelySide, actor)
  const all = sideOptions(table, otherSide, actor)
  const shown = showOtherSide ? all : all.filter((o) => keep.includes(o.id))
  return shown.length ? { likely, other: { label: p === 'negative' ? 'Allies' : 'Opponents', options: shown } } : { likely }
}

/** The whole table, for the GM: hidden villains and groups too. */
export function gmTable(game: Game): TargetTable {
  return {
    heroes: game.heroes.map((h) => ({ id: h.id, name: heroDisplayName(h.sheet), minions: (h.play.minions ?? []).map((m) => ({ id: m.id, name: m.name })) })),
    villains: game.villains.map((v) => ({ id: v.id, name: villainDisplayName(v.sheet) })),
    groups: game.groups,
  }
}

/** The table as a player sees it: hidden villains and groups never appear. */
export function viewTable(view: Pick<TableView, 'heroes' | 'villains' | 'groups'>): TargetTable {
  return {
    heroes: view.heroes.map((h) => ({ id: h.id, name: heroDisplayName(h.sheet), minions: (h.play.minions ?? []).map((m) => ({ id: m.id, name: m.name })) })),
    villains: view.villains.filter((v) => !v.hidden),
    groups: view.groups.filter((g) => !g.hidden),
  }
}

/** Solo play: just the hero and their minions. */
export function soloTable(hero: Hero, play: Pick<PlayState, 'minions'>): TargetTable {
  return { heroes: [{ id: hero.id, name: heroDisplayName(hero), minions: (play.minions ?? []).map((m) => ({ id: m.id, name: m.name })) }], villains: [], groups: [] }
}
