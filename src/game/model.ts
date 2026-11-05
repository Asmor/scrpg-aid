/**
 * The game document (docs/design/game-table/spec.md, sections 1–3): one table's state, owned by
 * the GM and the single source of truth for everything in play. It holds its scenes and their
 * trackers, the turn order, everything on the table, sheet update requests, the GM's private
 * notes, and the table log.
 *
 * A game is a list of scenes (docs/design/scenes/spec.md), one of them current. `villains`,
 * `groups`, `challenges` and `environment` are what's on the table now. Copies waiting for a
 * planned scene or set aside for later are in `offTable`, GM-only, so nothing that reads the
 * table can show them and a projection (./project.ts) can't send them.
 *
 * Scenes belong to numbered issues (docs/design/issues/spec.md). One issue is current, or the game
 * is between issues: `currentIssueId` is unset, no scene is current (`currentSceneId` still names
 * the last one played, so the table can show its tracker faded), and the table is paused.
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
import type { CharColor } from '../colors/palette'
import type { Defense } from '../play/defense'
import { newId, type Hero, type PlayMod, type PlayState } from '../hero/model'
import { emptyPlay } from '../play/state'
import type { FeedEntry } from '../session/types'
import { DEFAULT_TRACKER, type TrackerCounts } from '../rules/trackers'
import type { BasicAction, Die, Zone } from '../rules/types'
import type { Villain, VillainPlayState } from '../villain/model'
import type { EnvironmentAspect, EnvironmentTwist, TemplateAbility } from '../template/model'
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
  /** The player: their device's client id, their name, and when the hero first joined this game (ISO 8601). */
  player?: { clientId: string; name: string; since?: string }
}

/** What players see of a villain: its name only, its status (zone and mods), or its status and Health. */
export type PlayersSee = 'name' | 'status' | 'health'

/** A villain brought in by the GM: a copy, so its damage stays in this game. */
export interface VillainInGame extends CharacterInGame<Villain, VillainPlayState>, Visible {
  playersSee: PlayersSee
  /** The GM's overrides of its status die (the villains and challenges spec, section 1); cleared when a new scene starts. */
  statusOverride?: { die?: Die; count?: number }
  /**
   * Its once-per-scene Overcome to make the scene more dangerous is spent (p. 154): `box` is where
   * the tracker moved to, if it did; `failed` if the roll didn't succeed. Cleared by a new scene.
   */
  dangerUsed?: { box?: number; failed?: true }
}

/**
 * A hit on a hero holding two or more defenses: the hero's owner (its player, or the GM for
 * their own hero) chooses which one blocks it. `gmOnly` when the attacker is hidden.
 */
export interface PendingHit {
  id: string
  heroId: string
  by: string
  amount: number
  at: string
  gmOnly?: true
}

/** A player asking for the game's copy of their hero to match their library sheet (section 8; sent from Phase 2). */
export interface SyncRequest {
  heroId: string
  sheet: Hero
  at: string
}

/**
 * One minion or lieutenant in a group: its own die and mods. `n` numbers it in its group
 * ("Minion 2") and never changes. `acted` is whether it has acted this turn of its group's
 * (cleared when the group's turn starts, or its environment's).
 */
export interface NpcMember {
  id: string
  n: number
  die: Die
  mods: PlayMod[]
  acted: boolean
  /** Defends protecting it until its group's next turn starts (ruling 65). */
  defenses?: Defense[]
}

/** Who runs a group: the GM (its own turn-order entry), or the environment (it acts on the environment's turn). */
export type GroupOwner = { kind: 'gm' } | { kind: 'environment' }

/** A group of minions or of lieutenants (docs/design/npcs/spec.md, section 3). A hero's minions stay in that hero's play state. */
export interface NpcGroup extends Visible {
  id: string
  /** The library template it came from, if any. */
  templateId?: string
  kind: 'minions' | 'lieutenants'
  name: string
  /** Unset: by side (docs/design/character-colors/spec.md). */
  color?: CharColor
  owner: GroupOwner
  /** The basic actions its members can take; quick add allows any. */
  actions: 'any' | BasicAction[]
  /** A lieutenant template's abilities, copied in (docs/design/npcs/spec.md, the template table); the GM's only. */
  abilities?: TemplateAbility[]
  members: NpcMember[]
}

/** One step of a challenge: quick-added ones read "Step 1" until the GM renames them. */
export interface ChallengeStep {
  label: string
  done: boolean
}

/** A player's Overcome against a challenge, waiting for the GM's answer. */
export interface ChallengeRequest {
  id: string
  heroId: string
  total: number
  /** What they rolled it with: "Agility". */
  trait?: string
  at: string
}

export interface Challenge extends Visible {
  id: string
  /** Unset: by side (docs/design/character-colors/spec.md). */
  color?: CharColor
  /** The library template it came from, if any. */
  templateId?: string
  name: string
  steps: ChallengeStep[]
  /** Players' Overcomes waiting for the GM, oldest first. Players are sent their own only. */
  requests: ChallengeRequest[]
  description?: string
  /** What happens when it's done. Players aren't sent it until then. */
  whenDone?: string
  /** The GM's, or the environment's: only the environment's count for a Domain villain. A Titan's is always the GM's. */
  owner: { kind: 'gm' } | { kind: 'environment' }
  /** A Titan's challenge: its completed parts lower that villain's status die. */
  linkedVillainId?: string
}

/** A twist on the table: the template's, and the round it was marked used in, if it was. */
export interface TableTwist extends EnvironmentTwist {
  used?: { round: number }
}

/** A minion or lieutenant template the environment brought, copied in: what Add puts on the table. */
export interface AttachedGroupOnTable {
  color?: CharColor
  kind: 'minion' | 'lieutenant'
  templateId: string
  name: string
  die: Die
  actions: NpcGroup['actions']
  groupSize: number
}

/** A challenge template the environment brought, copied in. */
export interface AttachedChallengeOnTable {
  color?: CharColor
  kind: 'challenge'
  templateId: string
  name: string
  labels: string[]
  description?: string
  whenDone?: string
}

export type AttachedOnTable = AttachedGroupOnTable | AttachedChallengeOnTable

/**
 * The game's environment (docs/design/npcs/spec.md, section 6). Players see its name and
 * description; its aspects (the environment dice), twists and twist use are the GM's only.
 * A quick-added one has a name only, and can have aspects set on its turn.
 */
export interface EnvironmentOnTable extends Visible {
  id: string
  /** Unset: by side (docs/design/character-colors/spec.md). */
  color?: CharColor
  /** The template it came from, if any. */
  templateId?: string
  name: string
  description?: string
  aspects?: EnvironmentAspect[]
  twists?: TableTwist[]
  attached?: AttachedOnTable[]
}

/** A line in the table log. `gmOnly` marks one about something hidden, which only the GM sees. */
export interface GameFeedEntry extends FeedEntry {
  gmOnly?: true
  /** A villain's status die line: the villain it's about, so changes close together share one line. */
  statusOf?: string
  /** A line for one player: only that hero's player and the GM see it. */
  forHero?: string
}

/** An opposition item or environment, wherever it is in the game. */
export interface OppositionRef {
  kind: 'villain' | 'group' | 'challenge' | 'environment'
  id: string
}

/** Where an item in a scene came from: the tag on its planning row, and what removing it does. */
export type SceneItemSource = { kind: 'library' } | { kind: 'quick' } | { kind: 'tag'; tag: string } | { kind: 'aside'; afterScene?: number }

/** An opposition item in a scene. `startHidden` is its Hidden checkbox. */
export interface SceneItem {
  ref: OppositionRef
  startHidden: boolean
  source: SceneItemSource
}

/** One scene. Its number is its place in the game's list. */
export interface Scene {
  id: string
  name: string
  tracker: TrackerCounts
  /** The index of the current box, used while it's the current scene (a done scene keeps where it ended). */
  position: number
  /** A planned scene's environment; it can be the one on the table now, which then stays. The current scene's is `game.environment`; a done scene's is what Duplicate brings back. */
  environmentId?: string
  environmentHidden?: boolean
  /**
   * A planned scene's opposition. For the current scene, the table decides what's there and this
   * only remembers each item's source; for a done scene, it's what Duplicate brings back.
   * References may be out of date (the item was removed since): anything reading them skips those.
   */
  opposition: SceneItem[]
  /** Private to the GM. */
  notes: string
  state: 'planned' | 'now' | 'done'
  /** A done scene's one-line summary. */
  summary?: string
  /** The issue it was played in. A planned scene has none: it belongs to whichever issue is played next. */
  issueId?: string
}

/** A hero offered a back issue when an issue finished. `sourceId` is how a player finds their own. */
export interface OfferedHero {
  heroId: string
  sourceId: string
  name: string
}

/** What a player did about a back issue: for the GM's information, never a change to the game's hero. */
export interface IssueAck {
  status: 'added' | 'later'
  /** The hero's back issues now. */
  count?: number
  at: string
}

/** A numbered part of a game, holding scenes in order. */
export interface Issue {
  id: string
  /** 1, 2, 3… */
  number: number
  /** Required once finished. */
  title?: string
  summary?: string
  state: 'now' | 'finished'
  finishedAt?: string
  offeredTo?: OfferedHero[]
  /** By hero id. The GM's only. */
  acks?: Record<string, IssueAck>
}

/** Something set aside at the end of a scene, for a later one. */
export interface AsideEntry {
  ref: OppositionRef
  afterScene?: number
}

/** Copies not on the table: in a planned scene, or set aside. The GM's only. */
export interface OffTable {
  villains: VillainInGame[]
  groups: NpcGroup[]
  challenges: Challenge[]
  environments: EnvironmentOnTable[]
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
  /** Every scene in order: done, then the current one, then planned. Exactly one is current. */
  scenes: Scene[]
  currentSceneId: string
  /** Every issue in order. */
  issues: Issue[]
  /** Unset between issues. */
  currentIssueId?: string
  /** Set aside, kept in the game for a later scene (the copies are in `offTable`); the GM's only. */
  aside: AsideEntry[]
  offTable: OffTable
  /** The environment on the table. */
  environment?: EnvironmentOnTable
  /** 0 before the first round starts. */
  round: number
  /** Shared by every player's hero (the GM's own are NPCs, with none); the GM changes it, or the player in solo. */
  heroPoints: number
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
  /** Hits on heroes waiting for the hero's owner to choose one of its defenses (ruling 65). */
  pendingHits?: PendingHit[]
  /** Private to the GM. */
  notes: string
  /** The code players join with. It stays the same each time the game is hosted. */
  code?: string
  /** The table log, oldest first, at most FEED_LIMIT entries. */
  feed: GameFeedEntry[]
}

export type { TrackerCounts }

/** Who a log line is by, to show before it; nothing when the line already opens with that name. */
export const logByline = (entry: Pick<GameFeedEntry, 'by' | 'text'>): string | undefined => (entry.text.startsWith(`${entry.by} `) || entry.text.startsWith(`${entry.by}'s `) ? undefined : entry.by)

/** Every step of a challenge is done. */
export const challengeDone = (challenge: Pick<Challenge, 'steps'>) => challenge.steps.length > 0 && challenge.steps.every((s) => s.done)

/** The most boxes of one zone. */
export const MAX_BOXES = 10
/** The most members a quick-added group starts with, and the most steps a challenge has. */
export const MAX_GROUP_SIZE = 20
export const MAX_STEPS = 10
/** The most abilities a lieutenant group carries onto the table. */
export const MAX_ABILITIES = 20

/** The tracker's boxes for these counts, Green first. */
export function trackerFromCounts(counts: TrackerCounts): Zone[] {
  return (['green', 'yellow', 'red'] as const).flatMap((z) => Array.from({ length: counts[z] }, () => z))
}

/** A new scene with the default tracker, at its first box. */
export function createScene(options: { name?: string; state?: Scene['state']; id?: string; tracker?: TrackerCounts } = {}): Scene {
  return { id: options.id ?? newId(), name: options.name ?? '', tracker: { ...(options.tracker ?? DEFAULT_TRACKER) }, position: 0, opposition: [], notes: '', state: options.state ?? 'planned' }
}

export const emptyOffTable = (): OffTable => ({ villains: [], groups: [], challenges: [], environments: [] })

/** The scene that's on the table. */
export function currentScene(game: Pick<Game, 'scenes' | 'currentSceneId'>): Scene {
  return game.scenes.find((s) => s.id === game.currentSceneId) ?? game.scenes[0]!
}

/** A scene's number: its place in the list, from 1. */
export const sceneNumber = (game: Pick<Game, 'scenes'>, sceneId: string) => game.scenes.findIndex((s) => s.id === sceneId) + 1

/** The issue being played, if the game isn't between issues. */
export const currentIssue = (game: Pick<Game, 'issues' | 'currentIssueId'>) => game.issues.find((i) => i.id === game.currentIssueId)

/** The game is between issues: the table is paused until the GM starts the next one. */
export const betweenIssues = (game: { currentIssueId?: string }) => !game.currentIssueId

/** The number the next issue will have, between issues. */
export const nextIssueNumber = (game: { issues: readonly Pick<Issue, 'number'>[] }) => (game.issues.at(-1)?.number ?? 0) + 1

/** An issue's name: its title, or "Issue 2" until it has one. */
export const issueTitle = (issue: Pick<Issue, 'title' | 'number'>) => issue.title?.trim() || `Issue ${issue.number}`

/** A new issue, current. */
export const createIssue = (id: string, number: number): Issue => ({ id, number, state: 'now' })

/** The current scene as the table draws it. `total`, how many scenes there are, is the GM's only: the plan is private. */
export interface SceneOnTable {
  name: string
  /** The box layout, e.g. green×2, yellow×4, red×2. */
  tracker: Zone[]
  /** The index of the current box. */
  position: number
  /** "Scene 3". */
  number: number
  total?: number
}

/** Anything showing a tracker: the current box and its zone. */
export interface HasTracker {
  scene: Pick<SceneOnTable, 'tracker' | 'position'>
}

/** The current scene, for the table. */
export function sceneOnTable(game: Pick<Game, 'scenes' | 'currentSceneId'>): SceneOnTable {
  const scene = currentScene(game)
  return { name: scene.name, tracker: trackerFromCounts(scene.tracker), position: scene.position, number: sceneNumber(game, scene.id), total: game.scenes.length }
}

/** Creates a new game at the first box of its first scene's tracker. `now` and `id` are injectable for tests. */
export function createGame(options: { id?: string; now?: Date; name?: string; tracker?: TrackerCounts } = {}): Game {
  const timestamp = (options.now ?? new Date()).toISOString()
  const issue = createIssue(newId(), 1)
  const first = { ...createScene({ state: 'now', ...(options.tracker ? { tracker: options.tracker } : {}) }), issueId: issue.id }
  return {
    id: options.id ?? newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: [],
    name: options.name ?? '',
    scenes: [first],
    currentSceneId: first.id,
    issues: [issue],
    currentIssueId: issue.id,
    aside: [],
    offTable: emptyOffTable(),
    round: 0,
    heroPoints: 0,
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
export function villainCopy(villain: Villain, id: string, hidden = true, playersSee: PlayersSee = 'status'): VillainInGame {
  return { id, sourceId: villain.id, sheet: copySheet(villain), play: emptyVillainPlay(), hidden, playersSee }
}

/** The name to show for a game. */
export function gameDisplayName(game: Pick<Game, 'name'>): string {
  return game.name.trim() || 'Unnamed game'
}

/** The name to show for a scene. */
export function sceneName(scene: Pick<Scene, 'name'>): string {
  return scene.name.trim() || 'Unnamed scene'
}

/** The name to show for what's on the table in a view. */
export const sceneDisplayName = (view: { scene: Pick<Scene, 'name'> }) => sceneName(view.scene)

/** Whether a game is one the Games page lists: not a character's solo game. */
export const isListedGame = (game: Pick<Game, 'solo'>) => !game.solo
