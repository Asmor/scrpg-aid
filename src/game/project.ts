/**
 * What each audience receives of a game (docs/design/game-table/spec.md, section 10, "What each
 * audience receives"). The GM's device keeps the full game; after each change it sends players
 * and observers their **projection**, made here. Pure.
 *
 * Privacy is decided here, never left to the UI: a hidden item, a hidden actor, the GM's notes,
 * planned scenes and set aside items (they're off the table, so never copied here), sheet update requests, GM-only log lines, a villain's sheet and status die, and whatever "What
 * players see" holds back are simply not in a projection.
 *
 * The GM's own table renders from the same shape (`project(game, 'gm')`), hidden items and all,
 * so one component draws the center for everyone.
 */
import type { Defense } from '../play/defense'
import { buildVillainSheet } from '../villain/sheet'
import type { HeroInGame } from './model'
import { villainSummary } from '../villain/play'
import type { PlayMod, PlayTwist } from '../hero/model'
import type { PlayZone } from '../play/state'
import type { Die } from '../rules/types'
import { challengeDone, sceneOnTable, type ActorRef, type Issue, type Challenge, type EnvironmentOnTable, type Game, type GameFeedEntry, type NpcGroup, type PendingHit, type PlayersSee, type SceneOnTable } from './model'
import { groupLabel, isHidden, sameActor } from './table'
import { villainStatus } from './villain-status'

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
  /** The GM's only: the die now, and why. */
  statusDie?: Die
  statusReason?: string
  mods?: PlayMod[]
  /** Its Defends (ruling 65), shown with its mods. */
  defenses?: Defense[]
  twists?: PlayTwist[]
}

/** An issue as everyone sees it: never what players have answered, or anything planned. */
export interface IssueOnTable extends Omit<Issue, 'acks'> {
  /** How many scenes it holds so far. */
  sceneCount: number
}

/** A game as one audience sees it. */
export interface TableView {
  id: string
  name: string
  issues: IssueOnTable[]
  /** Unset between issues. */
  currentIssueId?: string
  /** The current scene. Planned scenes, set aside items and scene notes are in no view but the GM's own game. */
  scene: SceneOnTable
  environment?: EnvironmentOnTable
  round: number
  /** The count every player's hero shares. */
  heroPoints: number
  turn: Game['turn']
  heroes: HeroOnTable[]
  villains: VillainOnTable[]
  groups: NpcGroup[]
  challenges: Challenge[]
  /** Hits waiting for a hero's owner to choose a defense (ruling 65); a hidden attacker is unnamed for players. */
  pendingHits?: PendingHit[]
  feed: GameFeedEntry[]
}

function villainFor(v: Game['villains'][number], audience: Audience, game: Game): VillainOnTable {
  const { name, health, maxHealth, zone, mods, twists } = villainSummary(v.sheet, v.play)
  const base = { id: v.id, name, major: buildVillainSheet(v.sheet).major, hidden: v.hidden, playersSee: v.playersSee }
  const defenses = v.play.defenses?.length ? { defenses: v.play.defenses } : {}
  if (audience === 'gm') {
    const status = villainStatus(v, game)
    return { ...base, ...(zone ? { zone } : {}), ...(health !== undefined ? { health } : {}), ...(maxHealth !== undefined ? { maxHealth } : {}), ...(status?.die ? { statusDie: status.die } : {}), ...(status ? { statusReason: status.reason } : {}), mods, ...defenses, twists }
  }
  // Name only: the name and kind. Status adds the zone, mods and defenses; Status and Health adds Health.
  if (v.playersSee === 'name') return base
  return { ...base, ...(zone ? { zone } : {}), mods, ...defenses, ...(v.playersSee === 'health' ? { ...(health !== undefined ? { health } : {}), ...(maxHealth !== undefined ? { maxHealth } : {}) } : {}) }
}

/** The environment as players see it: its name and description. Its aspects, twists and twist use are the GM's only. */
function environmentForPlayers(env: EnvironmentOnTable): EnvironmentOnTable {
  return { id: env.id, name: env.name, hidden: env.hidden, ...(env.description ? { description: env.description } : {}) }
}

/** A group without its abilities. */
function withoutAbilities(group: NpcGroup): NpcGroup {
  const copy = { ...group }
  delete copy.abilities
  return copy
}

/**
 * A challenge as players and observers see it: the "when it's done" text waits until it's done, its
 * link to a status die is the GM's, and the requests are the viewing player's own.
 */
function challengeFor(challenge: Challenge, heroId: string | undefined): Challenge {
  const { whenDone, linkedVillainId: _, ...rest } = challenge
  return { ...rest, ...(whenDone && challengeDone(challenge) ? { whenDone } : {}), requests: heroId ? challenge.requests.filter((r) => r.heroId === heroId) : [] }
}

function issueOnTable(issue: Issue, game: Game): IssueOnTable {
  const copy = { ...issue }
  delete copy.acks
  return { ...copy, sceneCount: game.scenes.filter((s) => s.issueId === issue.id).length }
}

/** The game as `audience` sees it; a player's view is for their hero, `heroId`. */
export function project(game: Game, audience: Audience, heroId?: string): TableView {
  const gm = audience === 'gm'
  const shown = <T extends { hidden: boolean }>(items: readonly T[]) => (gm ? [...items] : items.filter((i) => !i.hidden))
  const visibleActor = (ref: ActorRef) => gm || !isHidden(game, ref)
  const current = game.turn.current && visibleActor(game.turn.current) ? game.turn.current : undefined
  const { total, ...scene } = sceneOnTable(game)
  return {
    id: game.id,
    name: game.name,
    issues: game.issues.map((issue) => issueOnTable(issue, game)),
    ...(game.currentIssueId ? { currentIssueId: game.currentIssueId } : {}),
    // "Scene 3 of 4" is the GM's: how many are planned is private.
    scene: gm && total !== undefined ? { ...scene, total } : scene,
    ...(game.environment && (gm || !game.environment.hidden) ? { environment: gm ? game.environment : environmentForPlayers(game.environment) } : {}),
    round: game.round,
    heroPoints: game.heroPoints,
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
    villains: shown(game.villains).map((v) => villainFor(v, audience, game)),
    // A lieutenant's abilities are the GM's notes, like a hidden villain's sheet.
    groups: gm ? shown(game.groups) : shown(game.groups).map(withoutAbilities),
    challenges: gm ? shown(game.challenges) : shown(game.challenges).map((c) => challengeFor(c, heroId)),
    ...(game.pendingHits?.length ? { pendingHits: gm ? game.pendingHits : game.pendingHits.map(({ gmOnly, ...h }) => (gmOnly ? { ...h, by: 'Someone unseen' } : h)) } : {}),
    feed: gm ? game.feed : game.feed.filter((e) => !e.gmOnly && (!e.forHero || (heroId !== undefined && e.forHero === heroId))),
  }
}

/** An actor's name in a view. */
export function viewName(view: Pick<TableView, 'heroes' | 'villains' | 'groups' | 'environment'>, ref: ActorRef, heroName: (h: HeroOnTable) => string): string {
  switch (ref.kind) {
    case 'hero': {
      const hero = view.heroes.find((h) => h.id === ref.id)
      if (!hero) return 'A hero'
      // Two heroes with one name are told apart by their players.
      const name = heroName(hero)
      const clash = view.heroes.some((h) => h.id !== hero.id && heroName(h) === name)
      return clash ? `${name} · ${hero.player ? hero.player.name || 'A player' : "GM's hero"}` : name
    }
    case 'villain':
      return view.villains.find((v) => v.id === ref.id)?.name ?? 'A villain'
    case 'group': {
      const group = view.groups.find((g) => g.id === ref.id)
      return group ? groupLabel(view.groups, group, view.environment?.name) : 'A group'
    }
    case 'environment':
      return view.environment?.name ?? 'The environment'
  }
}

/** Whether an actor is in the view's turn order. */
export const inOrder = (view: Pick<TableView, 'turn'>, ref: ActorRef) => view.turn.order.some((o) => sameActor(o, ref))

/** Whether an actor is hidden in a view (the GM's; players' views have no hidden actors). Missing counts as hidden. */
export function viewHidden(view: Pick<TableView, 'heroes' | 'villains' | 'groups' | 'environment'>, ref: ActorRef): boolean {
  switch (ref.kind) {
    case 'hero':
      return !view.heroes.some((h) => h.id === ref.id)
    case 'villain':
      return view.villains.find((v) => v.id === ref.id)?.hidden ?? true
    case 'group':
      return view.groups.find((g) => g.id === ref.id)?.hidden ?? true
    case 'environment':
      return view.environment?.id === ref.id ? view.environment.hidden : true
  }
}

/** A hero's name in a view. */
export const heroOnTableName = (h: Pick<HeroOnTable, 'sheet'>) => h.sheet.details.name.trim() || 'Unnamed hero'
