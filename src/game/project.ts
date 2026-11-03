/**
 * What each audience receives of a game (docs/design/game-table/spec.md, section 10, "What each
 * audience receives"). The GM's device keeps the full game; after each change it sends players
 * and observers their **projection**, made here. Pure.
 *
 * Privacy is decided here, never left to the UI: a hidden item, a hidden actor, the GM's notes,
 * sheet update requests, GM-only log lines, a villain's sheet and status die, and whatever "What
 * players see" holds back are simply not in a projection.
 *
 * The GM's own table renders from the same shape (`project(game, 'gm')`), hidden items and all,
 * so one component draws the center for everyone.
 */
import { buildVillainSheet } from '../villain/sheet'
import type { HeroInGame } from './model'
import { villainSummary } from '../villain/play'
import type { PlayMod, PlayTwist } from '../hero/model'
import type { PlayZone } from '../play/state'
import type { Die } from '../rules/types'
import type { ActorRef, Challenge, EnvironmentOnTable, Game, GameFeedEntry, NpcGroup, PlayersSee } from './model'
import { isHidden, sameActor } from './table'

export type Audience = 'gm' | 'player' | 'observer'

/** The most history entries sent for each hero: enough for the latest roll and recent changes. */
export const VIEW_HISTORY = 30

/** A hero at the table as the table sees them: the sheet, play state and player's name (never their client id). */
export interface HeroOnTable extends Omit<HeroInGame, 'player'> {
  player?: { name: string; since?: string }
}

/** A villain as an audience sees it: what "What players see" allows (all of it for the GM). */
export interface VillainOnTable {
  id: string
  name: string
  major: boolean
  hidden: boolean
  playersSee: PlayersSee
  zone?: PlayZone
  health?: number
  maxHealth?: number
  /** The GM's only. */
  statusDie?: Die
  mods?: PlayMod[]
  twists?: PlayTwist[]
}

/** A game as one audience sees it. */
export interface TableView {
  id: string
  name: string
  scene: Game['scene']
  environment?: EnvironmentOnTable
  round: number
  turn: Game['turn']
  heroes: HeroOnTable[]
  villains: VillainOnTable[]
  groups: NpcGroup[]
  challenges: Challenge[]
  feed: GameFeedEntry[]
}

function villainFor(v: Game['villains'][number], audience: Audience): VillainOnTable {
  const { name, health, maxHealth, zone, statusDie, mods, twists } = villainSummary(v.sheet, v.play)
  const base = { id: v.id, name, major: buildVillainSheet(v.sheet).major, hidden: v.hidden, playersSee: v.playersSee }
  if (audience === 'gm') {
    return { ...base, ...(zone ? { zone } : {}), ...(health !== undefined ? { health } : {}), ...(maxHealth !== undefined ? { maxHealth } : {}), ...(statusDie ? { statusDie } : {}), mods, twists }
  }
  // Name only: the name and kind. Status adds the zone and mods; Status and Health adds Health.
  if (v.playersSee === 'name') return base
  return { ...base, ...(zone ? { zone } : {}), mods, ...(v.playersSee === 'health' ? { ...(health !== undefined ? { health } : {}), ...(maxHealth !== undefined ? { maxHealth } : {}) } : {}) }
}

/** The game as `audience` sees it. */
export function project(game: Game, audience: Audience): TableView {
  const gm = audience === 'gm'
  const shown = <T extends { hidden: boolean }>(items: readonly T[]) => (gm ? [...items] : items.filter((i) => !i.hidden))
  const visibleActor = (ref: ActorRef) => gm || !isHidden(game, ref)
  const current = game.turn.current && visibleActor(game.turn.current) ? game.turn.current : undefined
  return {
    id: game.id,
    name: game.name,
    scene: game.scene,
    ...(game.environment && (gm || !game.environment.hidden) ? { environment: game.environment } : {}),
    round: game.round,
    turn: {
      order: game.turn.order.filter(visibleActor),
      acted: game.turn.acted.filter(visibleActor),
      ...(current ? { current } : {}),
    },
    heroes: game.heroes.map(({ player, ...h }) => ({
      ...h,
      play: { ...h.play, history: h.play.history.slice(-VIEW_HISTORY) },
      ...(player ? { player: { name: player.name, ...(player.since ? { since: player.since } : {}) } } : {}),
    })),
    villains: shown(game.villains).map((v) => villainFor(v, audience)),
    groups: shown(game.groups),
    challenges: shown(game.challenges),
    feed: gm ? game.feed : game.feed.filter((e) => !e.gmOnly),
  }
}

/** An actor's name in a view. */
export function viewName(view: Pick<TableView, 'heroes' | 'villains' | 'groups' | 'environment'>, ref: ActorRef, heroName: (h: HeroOnTable) => string): string {
  switch (ref.kind) {
    case 'hero': {
      const hero = view.heroes.find((h) => h.id === ref.id)
      return hero ? heroName(hero) : 'A hero'
    }
    case 'villain':
      return view.villains.find((v) => v.id === ref.id)?.name ?? 'A villain'
    case 'group':
      return view.groups.find((g) => g.id === ref.id)?.name ?? 'A group'
    case 'environment':
      return view.environment?.name ?? 'The environment'
  }
}

/** Whether an actor is in the view's turn order. */
export const inOrder = (view: Pick<TableView, 'turn'>, ref: ActorRef) => view.turn.order.some((o) => sameActor(o, ref))
