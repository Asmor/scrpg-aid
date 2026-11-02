/**
 * The game document (docs/design/game-table/spec.md, sections 1–3): one table's state, owned by
 * the GM and the single source of truth for everything in play. It holds the scene and its
 * tracker, the turn order, everything on the table, sheet update requests, the GM's private
 * notes, and the table log.
 *
 * Every hero and villain on the table is a copy: the sheet copied from the library when it came
 * in, plus its play state. Damage stays in this game; the library document and other games never
 * change. The same character can be in several games, each with its own state. Groups of minions
 * and lieutenants, challenges and the environment live in the game itself.
 *
 * A character's standalone Play page is a game too, its **solo game** (`solo`, ./solo.ts), with
 * that one character. Solo games aren't listed with the others.
 *
 * Every opposition item has `hidden`: a hidden item is staged, so only the GM sees it (and when
 * games are hosted, players and observers are never sent it).
 *
 * Versioning (./serialize.ts) follows the hero's rules. The copied sheets are hero and villain
 * documents, so a change to their format needs a new game version too.
 */
import { newId, type Hero, type PlayMod, type PlayState } from '../hero/model'
import { emptyPlay } from '../play/state'
import type { FeedEntry } from '../session/types'
import type { Die, Zone } from '../rules/types'
import type { Villain, VillainPlayState } from '../villain/model'
import { emptyVillainPlay } from '../villain/play'

/** Anything with a turn-order entry. Ids are ids within the game: a hero's or villain's copy, a group, or the environment. */
export interface ActorRef {
  kind: 'hero' | 'villain' | 'group' | 'environment'
  id: string
}

/** On every opposition item: staged, so only the GM sees it. */
export interface Visible {
  hidden: boolean
}

/** A character in play: a copy of its library sheet, and its play state in this game. */
export interface CharacterInGame<S, P> {
  /** Its id within this game. */
  id: string
  /** The library document it was copied from. */
  sourceId: string
  /** The copied sheet (build only: library documents hold no play state). */
  sheet: S
  play: P
}

/** A hero at the table: a joined player's (from Phase 2), or, with no player, one of the GM's own. */
export interface HeroInGame extends CharacterInGame<Hero, PlayState> {
  player?: { clientId: string; name: string }
}

/** What players see of a villain: its name only, its status (zone and mods), or its status and Health. */
export type PlayersSee = 'name' | 'status' | 'health'

/** A villain brought in by the GM: a copy, so its damage stays in this game. */
export interface VillainInGame extends CharacterInGame<Villain, VillainPlayState>, Visible {
  playersSee: PlayersSee
}

/** A player asking for the game's copy of their hero to match their library sheet (section 8; sent from Phase 2). */
export interface SyncRequest {
  heroId: string
  sheet: Hero
  at: string
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
  /** Set for a character's solo game (standalone Play). */
  solo?: { kind: 'hero' | 'villain'; sourceId: string }
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
  heroes: HeroInGame[]
  villains: VillainInGame[]
  groups: NpcGroup[]
  challenges: Challenge[]
  /** Sheet update requests waiting for the GM, one per hero at most. */
  pendingSyncs: SyncRequest[]
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
    pendingSyncs: [],
    notes: '',
    feed: [],
  }
}

/** A character's sheet as a game copies it: a copy, so later changes on either side don't reach the other. */
export function copySheet<T>(doc: T): T {
  return structuredClone(doc)
}

/** A hero copied into a game with fresh play state (Health at max). */
export function heroCopy(hero: Hero, id: string, player?: HeroInGame['player']): HeroInGame {
  return { id, sourceId: hero.id, sheet: copySheet(hero), play: emptyPlay(), ...(player ? { player } : {}) }
}

/** A villain copied into a game with fresh play state, hidden unless said otherwise. */
export function villainCopy(villain: Villain, id: string, hidden = true): VillainInGame {
  return { id, sourceId: villain.id, sheet: copySheet(villain), play: emptyVillainPlay(), hidden, playersSee: 'status' }
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
 * A fresh copy of the setup to save as a new game (the Games page's Duplicate): a new id,
 * "(copy)" after the name, the same tags, round 0, the tracker at its first box, no players
 * (their heroes leave), characters at fresh play state, no requests and no log. The GM's own
 * heroes, the opposition and the notes stay, so a prepared game can be reused.
 */
export function duplicateGame(game: Game, options: { id?: string; now?: Date } = {}): Game {
  const timestamp = (options.now ?? new Date()).toISOString()
  const copy = structuredClone(game)
  const heroes = copy.heroes.filter((h) => !h.player).map((h) => ({ ...h, play: emptyPlay() }))
  const order = copy.turn.order.filter((ref) => ref.kind !== 'hero' || heroes.some((h) => h.id === ref.id))
  const { solo: _solo, ...rest } = copy
  return {
    ...rest,
    id: options.id ?? newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: copy.name.trim() ? `${copy.name.trim()} (copy)` : '',
    scene: { ...copy.scene, position: 0 },
    round: 0,
    turn: { order, acted: [] },
    heroes,
    villains: copy.villains.map((v) => ({ ...v, play: emptyVillainPlay() })),
    pendingSyncs: [],
    feed: [],
  }
}

/** Whether a game is one the Games page lists: not a character's solo game. */
export const isListedGame = (game: Pick<Game, 'solo'>) => !game.solo
