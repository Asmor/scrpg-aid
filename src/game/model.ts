/**
 * The game document (docs/design/game-table/spec.md, section 2): one table's state, owned by
 * the GM. It holds the scene and its tracker, the turn order, everything on the table, the GM's
 * private notes, and the table log.
 *
 * Heroes and villains on the table are references to their own documents: the table works on
 * those documents directly, so damage, mods and history stay with them after the game. Groups of
 * minions and lieutenants, challenges and the environment live in the game itself.
 *
 * Every opposition item has `hidden`: a hidden item is staged, so only the GM sees it (and when
 * games are hosted, players and observers are never sent it).
 *
 * Versioning (./serialize.ts) follows the hero's rules.
 */
import { newId, type PlayMod } from '../hero/model'
import type { FeedEntry } from '../session/types'
import type { Die, Zone } from '../rules/types'

/** Anything with a turn-order entry. Ids are a hero-on-table id, a villain's id, a group's id, or the environment's id. */
export interface ActorRef {
  kind: 'hero' | 'villain' | 'group' | 'environment'
  id: string
}

/** On every opposition item: staged, so only the GM sees it. */
export interface Visible {
  hidden: boolean
}

/** A hero at the table: a joined player's (from Phase 2), or one from the GM's own library. */
export interface HeroOnTable {
  id: string
  source: { kind: 'player'; clientId: string } | { kind: 'local'; heroId: string }
}

/** What players see of a villain: its name only, its status (zone and mods), or its status and Health. */
export type PlayersSee = 'name' | 'status' | 'health'

/** A villain brought in directly: the table works on the villain document itself. */
export interface VillainOnTable extends Visible {
  villainId: string
  playersSee: PlayersSee
}

/** One minion or lieutenant in a group: its own die and mods. `n` numbers it in its group ("Minion 2") and never changes. */
export interface NpcMember {
  id: string
  n: number
  die: Die
  mods: PlayMod[]
}

/** A GM-controlled group of minions or of lieutenants, with one turn-order entry. */
export interface NpcGroup extends Visible {
  id: string
  kind: 'minions' | 'lieutenants'
  name: string
  members: NpcMember[]
}

export interface Challenge extends Visible {
  id: string
  name: string
  /** Each step, done or not. */
  steps: boolean[]
}

export interface EnvironmentOnTable extends Visible {
  id: string
  name: string
}

/** A line in the table log. `gmOnly` marks one about something hidden, which only the GM sees. */
export interface GameFeedEntry extends FeedEntry {
  gmOnly?: true
}

export interface Game {
  id: string
  createdAt: string
  updatedAt: string
  /** The GM's own labels (docs/design/library/spec.md), e.g. a campaign. */
  tags: string[]
  name: string
  scene: {
    name: string
    /** The box layout, e.g. green×3, yellow×3, red×2. */
    tracker: Zone[]
    /** The index of the current box. */
    position: number
  }
  environment?: EnvironmentOnTable
  /** 0 before the first round starts. */
  round: number
  turn: {
    /** The actors in the turn order, in its fixed order: heroes, villains, groups, the environment. */
    order: ActorRef[]
    /** Who has acted this round, in the order they acted. */
    acted: ActorRef[]
    current?: ActorRef
  }
  heroes: HeroOnTable[]
  villains: VillainOnTable[]
  groups: NpcGroup[]
  challenges: Challenge[]
  /** Private to the GM. */
  notes: string
  /** The table log, oldest first, at most FEED_LIMIT entries. */
  feed: GameFeedEntry[]
}

/** How many boxes of each zone a tracker has. */
export type TrackerCounts = Record<Zone, number>

/** A new game's tracker: 3 green, 3 yellow and 2 red boxes. */
export const DEFAULT_TRACKER: TrackerCounts = { green: 3, yellow: 3, red: 2 }
/** The most boxes of one zone. */
export const MAX_BOXES = 10
/** The most members a quick-added group starts with, and the most steps a challenge has. */
export const MAX_GROUP_SIZE = 20
export const MAX_STEPS = 10

/** The tracker's boxes for these counts, Green first. */
export function trackerFromCounts(counts: TrackerCounts): Zone[] {
  return (['green', 'yellow', 'red'] as const).flatMap((z) => Array.from({ length: counts[z] }, () => z))
}

/** Creates a new game at the first box of the default tracker. `now` and `id` are injectable for tests. */
export function createGame(options: { id?: string; now?: Date; name?: string } = {}): Game {
  const timestamp = (options.now ?? new Date()).toISOString()
  return {
    id: options.id ?? newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: [],
    name: options.name ?? '',
    scene: { name: '', tracker: trackerFromCounts(DEFAULT_TRACKER), position: 0 },
    round: 0,
    turn: { order: [], acted: [] },
    heroes: [],
    villains: [],
    groups: [],
    challenges: [],
    notes: '',
    feed: [],
  }
}

/** The name to show for a game. */
export function gameDisplayName(game: Pick<Game, 'name'>): string {
  return game.name.trim() || 'Unnamed game'
}

/** The name to show for the scene. */
export function sceneDisplayName(game: Pick<Game, 'scene'>): string {
  return game.scene.name.trim() || 'Unnamed scene'
}

/**
 * A copy to save as a new game: a new id, "(copy)" after the name, the same tags, and no play
 * state (not started, the tracker at its first box, no log). What's on the table and the notes
 * stay, so a prepared game can be reused.
 */
export function duplicateGame(game: Game, options: { id?: string; now?: Date } = {}): Game {
  const timestamp = (options.now ?? new Date()).toISOString()
  const copy = structuredClone(game)
  return {
    ...copy,
    id: options.id ?? newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: copy.name.trim() ? `${copy.name.trim()} (copy)` : '',
    scene: { ...copy.scene, position: 0 },
    round: 0,
    turn: { order: copy.turn.order, acted: [] },
    feed: [],
  }
}
