/**
 * The game table's rules (docs/design/game-table/spec.md, sections 3–9). Pure: each change
 * takes the game and returns the new one, with a line in the table log where the table should
 * know. A line about something hidden is marked `gmOnly`.
 *
 * Heroes and villains on the table are copies in the game (./model.ts), so everything about
 * them, names included, comes from the game itself, and the game's state changes directly: a
 * turn starting clears that character's reaction, and the GM's edits change the game's copy.
 */
import type { Appearance, CharColor } from '../colors/palette'
import { nameList } from './names'
import { stepDie } from '../rules/dice'
import type { Die, Zone } from '../rules/types'
import { heroDisplayName, type Hero, type PlayHistoryEntry, type PlayMod, type PlayState } from '../hero/model'
import { currentHealth, describeMod, setHealth, setReactionUsed, type Clock } from '../play/state'
import { blockWith, clearDefenses, defensesOf, defenseText, pickDefense, removeDefense, type Defense } from '../play/defense'
import { buildSheet } from '../creation/sheet'
import { FEED_LIMIT } from '../session/types'
import { MAX_NAME, MAX_TEXT } from '../session/protocol'
import type { TemplateAbility } from '../template/model'
import { villainDisplayName, type Villain, type VillainPlayState } from '../villain/model'
import { buildVillainSheet } from '../villain/sheet'
import { betweenIssues, challengeDone, heroCopy, MAX_ABILITIES, MAX_GROUP_SIZE, MAX_STEPS, sceneOnTable, trackerFromCounts, villainCopy, type ActorRef, type Challenge, type EnvironmentOnTable, type Game, type GameFeedEntry, type HasTracker, type HeroInGame, type NpcGroup, type OppositionRef, type PendingHit, type PlayersSee, type Scene, type SceneOnTable, type TrackerCounts, type VillainInGame } from './model'
import { reconcile, reconcileVillain } from './reconcile'
import { validCounts } from './validate'

export const GM = 'GM'

const ZONE_NAME: Record<Zone, string> = { green: 'Green', yellow: 'Yellow', red: 'Red' }

// ---- The log ----

/** Adds lines to the log, keeping the newest FEED_LIMIT. */
export function withLog(game: Game, entries: readonly GameFeedEntry[]): Game {
  return entries.length ? { ...game, feed: [...game.feed, ...entries].slice(-FEED_LIMIT) } : game
}

const line = (clock: Clock, text: string, options: { by?: string; gmOnly?: boolean; details?: string[] } = {}): GameFeedEntry => ({
  id: clock.newId(),
  at: clock.now.toISOString(),
  by: options.by ?? GM,
  text,
  ...(options.details?.length ? { details: options.details } : {}),
  ...(options.gmOnly ? { gmOnly: true as const } : {}),
})

const log = (game: Game, clock: Clock, text: string, options?: { by?: string; gmOnly?: boolean; details?: string[] }) => withLog(game, [line(clock, text, options)])

/** Adds a character's new history entries to the log under its name (hidden while it is). */
export function shareHistory(game: Game, by: string, entries: readonly { id: string; text: string; details?: string[] }[], clock: Clock, gmOnly = false): Game {
  return withLog(
    game,
    entries.map((e) => line(clock, e.text, { by, gmOnly, ...(e.details ? { details: e.details } : {}) })),
  )
}

// ---- The scene and its tracker ----

/** The current box's zone (Green if the tracker has no boxes). */
export function sceneZone(view: HasTracker): Zone {
  return view.scene.tracker[view.scene.position] ?? 'green'
}

function changeCurrentScene(game: Game, change: (scene: Scene) => Scene): Game {
  return { ...game, scenes: game.scenes.map((s) => (s.id === game.currentSceneId ? change(s) : s)) }
}

/** A box's name: "Green 3" for the third green box. */
export function boxLabel(tracker: readonly Zone[], index: number): string {
  const zone = tracker[index]
  if (!zone) return ''
  return `${ZONE_NAME[zone]} ${tracker.slice(0, index + 1).filter((z) => z === zone).length}`
}

/** The GM moves the tracker to a box (correcting it). */
export function setTrackerPosition(game: Game, position: number, clock: Clock): Game {
  const { tracker, position: at } = sceneOnTable(game)
  if (!Number.isInteger(position) || position < 0 || position >= tracker.length || position === at) return game
  return log(changeCurrentScene(game, (s) => ({ ...s, position })), clock, `The GM moved the scene tracker to ${boxLabel(tracker, position)}.`)
}

/** Advances the tracker one box (the environment's turn); on the last box it stays and the log says so. */
export function advanceTracker(game: Game, clock: Clock): Game {
  const { tracker, position } = sceneOnTable(game)
  const next = position + 1
  if (next >= tracker.length) return log(game, clock, 'The scene tracker has run out.')
  return log(changeCurrentScene(game, (s) => ({ ...s, position: next })), clock, `The scene tracker moved to ${boxLabel(tracker, next)}.`)
}

/** The current scene's name and box counts, and optionally back to the first box. Its position stays, clamped to the new length. */
export function setupScene(game: Game, setup: { name: string; counts: TrackerCounts; reset: boolean }, clock: Clock): Game {
  if (!validCounts(setup.counts)) return game
  const before: SceneOnTable = sceneOnTable(game)
  const tracker = trackerFromCounts(setup.counts)
  const position = setup.reset ? 0 : Math.min(before.position, tracker.length - 1)
  const name = setup.name.trim().slice(0, MAX_NAME)
  const lines: string[] = []
  if (name !== before.name) lines.push(name ? `The scene is now ${name}.` : 'The scene has no name now.')
  if (tracker.join() !== before.tracker.join()) lines.push(`The scene tracker now has ${setup.counts.green} green, ${setup.counts.yellow} yellow and ${setup.counts.red} red ${tracker.length === 1 ? 'box' : 'boxes'}.`)
  if (position !== before.position || (lines.length && setup.reset)) lines.push(`The scene tracker is at ${boxLabel(tracker, position)}.`)
  return withLog(changeCurrentScene(game, (s) => ({ ...s, name, tracker: { ...setup.counts }, position })), lines.map((text) => line(clock, text)))
}

// ---- What's on the table ----

/** Something the GM can hide: an opposition item or the environment. */
export type ItemRef = OppositionRef

export const findHero = (game: Pick<Game, 'heroes'>, id: string) => game.heroes.find((h) => h.id === id)
export const findVillain = (game: Pick<Game, 'villains'>, id: string) => game.villains.find((v) => v.id === id)
const findGroup = (game: Game, id: string) => game.groups.find((g) => g.id === id)

/** Whether an item is hidden (missing counts as hidden, so nothing about it is shown). */
export function isHidden(game: Game, ref: ItemRef | ActorRef): boolean {
  switch (ref.kind) {
    case 'hero':
      return !game.heroes.some((h) => h.id === ref.id)
    case 'villain':
      return findVillain(game, ref.id)?.hidden ?? true
    case 'group':
      return findGroup(game, ref.id)?.hidden ?? true
    case 'challenge':
      return game.challenges.find((c) => c.id === ref.id)?.hidden ?? true
    case 'environment':
      return game.environment?.id === ref.id ? game.environment.hidden : true
  }
}

/**
 * A hero's name at the table. When two heroes share a name, each gets its player's name (or
 * "GM's hero") after it, so menus, the turn strip and the log can tell them apart.
 */
export function heroLabel(heroes: readonly Pick<HeroInGame, 'id' | 'sheet' | 'player'>[], hero: Pick<HeroInGame, 'id' | 'sheet' | 'player'>): string {
  const name = heroDisplayName(hero.sheet)
  const clash = heroes.some((h) => h.id !== hero.id && heroDisplayName(h.sheet) === name)
  return clash ? `${name} · ${hero.player ? hero.player.name || 'A player' : "GM's hero"}` : name
}

/** A hero's name at the table by id. */
export function heroLabelOf(heroes: readonly Pick<HeroInGame, 'id' | 'sheet' | 'player'>[], heroId: string): string {
  const hero = heroes.find((h) => h.id === heroId)
  return hero ? heroLabel(heroes, hero) : 'A hero'
}

/**
 * A group's name at the table. When an environment's group shares its name with another group,
 * the environment's name follows it ("Burglar (Rooftop Heist)"), so the turn order and target
 * lists can tell them apart.
 */
export const groupLabel = (groups: readonly Pick<NpcGroup, 'id' | 'name' | 'owner'>[], group: Pick<NpcGroup, 'id' | 'name' | 'owner'>, environment: string | undefined) => group.name + groupSuffix(groups, group, environment)

/** What tells a group apart from another of the same name: " (Rooftop Heist)" for the environment's, or nothing. */
export function groupSuffix(groups: readonly Pick<NpcGroup, 'id' | 'name' | 'owner'>[], group: Pick<NpcGroup, 'id' | 'name' | 'owner'>, environment: string | undefined): string {
  const clash = group.owner.kind === 'environment' && groups.some((g) => g.id !== group.id && g.name === group.name)
  return clash ? ` (${environment || 'Environment'})` : ''
}

/** An item's or actor's name. */
export function itemName(game: Game, ref: ItemRef | ActorRef): string {
  switch (ref.kind) {
    case 'hero': {
      const hero = findHero(game, ref.id)
      return hero ? heroLabel(game.heroes, hero) : 'A hero'
    }
    case 'villain': {
      const villain = findVillain(game, ref.id)
      return villain ? villainDisplayName(villain.sheet) : 'A villain'
    }
    case 'group': {
      const group = findGroup(game, ref.id)
      return group ? groupLabel(game.groups, group, game.environment?.name) : 'A group'
    }
    case 'environment':
      return game.environment?.name ?? 'The environment'
    case 'challenge':
      return game.challenges.find((c) => c.id === ref.id)?.name ?? 'A challenge'
  }
}

export const sameActor = (a: ActorRef | undefined, b: ActorRef | undefined) => Boolean(a && b && a.kind === b.kind && a.id === b.id)
export const actorKey = (ref: ActorRef) => `${ref.kind}:${ref.id}`

/** Every actor on the table, in the turn order's fixed order: heroes, villains, groups, the environment. */
function allActors(game: Game): ActorRef[] {
  return [
    ...game.heroes.map((h) => ({ kind: 'hero' as const, id: h.id })),
    ...game.villains.map((v) => ({ kind: 'villain' as const, id: v.id })),
    // The environment's groups act on its turn, with no entry of their own.
    ...game.groups.filter((g) => g.owner.kind === 'gm').map((g) => ({ kind: 'group' as const, id: g.id })),
    ...(game.environment ? [{ kind: 'environment' as const, id: game.environment.id }] : []),
  ]
}

/**
 * Brings the turn order up to date: an actor enters when it's revealed (heroes on arrival) and
 * leaves when it's removed. One that's hidden again keeps its place. The order stays in its fixed order.
 */
export function syncTurnOrder(game: Game): Game {
  const inOrder = (ref: ActorRef) => game.turn.order.some((o) => sameActor(o, ref))
  const order = allActors(game).filter((ref) => inOrder(ref) || !isHidden(game, ref))
  const acted = game.turn.acted.filter((ref) => order.some((o) => sameActor(o, ref)))
  const current = game.turn.current && order.some((o) => sameActor(o, game.turn.current)) ? game.turn.current : undefined
  const sameList = (a: readonly ActorRef[], b: readonly ActorRef[]) => a.length === b.length && a.every((x, i) => sameActor(x, b[i]))
  if (sameList(order, game.turn.order) && sameList(acted, game.turn.acted) && (current ? sameActor(current, game.turn.current) : !game.turn.current)) return game
  return { ...game, turn: { order, acted, ...(current ? { current } : {}) } }
}

/** The game's copy of a library document, if it has one (one copy per game). */
export function copyOf(game: Pick<Game, 'heroes' | 'villains' | 'offTable'>, kind: 'hero' | 'villain', sourceId: string): HeroInGame | VillainInGame | undefined {
  return kind === 'hero' ? game.heroes.find((h) => h.sourceId === sourceId) : (game.villains.find((v) => v.sourceId === sourceId) ?? game.offTable.villains.find((v) => v.sourceId === sourceId))
}

/** Copies a hero into the game with fresh play state: one of the GM's own, or (Phase 2) a joining player's. */
export function addHero(game: Game, hero: Hero, clock: Clock, player?: HeroInGame['player']): Game {
  if (copyOf(game, 'hero', hero.id)) return game
  const added = { ...game, heroes: [...game.heroes, heroCopy(hero, clock.newId(), player)] }
  return log(syncTurnOrder(added), clock, `${heroDisplayName(hero)} joined the table.`)
}

/**
 * Copies a villain into the game with fresh play state (hidden unless said otherwise). `heroCount`
 * is the number of heroes its Health is worked out for at this table (the villain wizard spec,
 * section 7); the copy keeps it.
 */
export function addVillain(game: Game, villain: Villain, clock: Clock, hidden = true, heroCount?: number, playersSee?: PlayersSee): Game {
  if (copyOf(game, 'villain', villain.id)) return game
  const name = villainDisplayName(villain)
  const copy = newVillainCopy(villain, hidden, heroCount, clock, playersSee)
  const added = withTitanChallenge({ ...game, villains: [...game.villains, copy] }, copy.id, clock)
  return log(syncTurnOrder(added), clock, hidden ? `The GM brought in ${name}, hidden from players.` : `${name} joined the table.`, { gmOnly: hidden })
}

/** A Titan's challenge steps from its rule: each part's text, shortened, once per success it takes. */
export function titanStepLabels(villain: Villain): string[] {
  const rule = buildVillainSheet(villain).status
  if (rule?.basis !== 'challenge') return []
  return rule.challenge.flatMap((part) => {
    // "Expose a vulnerable part of the Titan and reduce their status by one die size" → "Expose a vulnerable part".
    const text = part.text.replace(/ (?:and|to) reduce .*$/, '').replace(/ of the Titan$/, '')
    return part.successes === 1 ? [text] : Array.from({ length: part.successes }, (_, i) => `${text} (${i + 1} of ${part.successes})`)
  })
}

/**
 * A Titan on the table has its challenge (the villains and challenges spec, section 4), which
 * follows it: its hidden state, and on and off the table. No line of its own: the villain's says
 * enough. A villain that stops being a Titan (a sheet update) leaves a plain challenge behind.
 */
export function withTitanChallenge(game: Game, villainId: string, clock: Clock): Game {
  const villain = findVillain(game, villainId)
  if (!villain || game.solo) return game
  const labels = titanStepLabels(villain.sheet)
  const linked = (c: Challenge) => c.linkedVillainId === villainId
  if (!labels.length) {
    const unlink = (c: Challenge) => {
      const { linkedVillainId: _, ...rest } = c
      return linked(c) ? rest : c
    }
    return game.challenges.some(linked) ? { ...game, challenges: game.challenges.map(unlink) } : game
  }
  if (game.challenges.some(linked) || game.offTable.challenges.some(linked)) return game
  const name = `${villainDisplayName(villain.sheet)}'s Titan challenge`.slice(0, MAX_NAME)
  const challenge: Challenge = { id: clock.newId(), name, hidden: villain.hidden, steps: labels.map((label) => ({ label: label.slice(0, MAX_NAME), done: false })), requests: [], owner: { kind: 'gm' }, linkedVillainId: villainId }
  return { ...game, challenges: [...game.challenges, challenge] }
}

/** A villain's copy with fresh play state, its Health worked out for `heroCount` heroes if given. */
export function newVillainCopy(villain: Villain, hidden: boolean, heroCount: number | undefined, clock: Clock, playersSee?: PlayersSee): VillainInGame {
  const copy = villainCopy(villain, clock.newId(), hidden, playersSee)
  return heroCount !== undefined && Number.isInteger(heroCount) && heroCount >= 1 ? { ...copy, play: { ...copy.play, heroCount } } : copy
}

const GROUP_WORD = { minions: ['minion', 'minions'], lieutenants: ['lieutenant', 'lieutenants'] } as const

/** What a group is made from: quick add, or a template. */
export type GroupSpec = { color?: CharColor; kind: NpcGroup['kind']; name: string; die: Die; count: number; hidden: boolean; actions?: NpcGroup['actions']; templateId?: string; owner?: NpcGroup['owner']; abilities?: readonly TemplateAbility[] }

/** A new group whose members all start with the same die; undefined if the count is out of range. */
export function newGroup(group: GroupSpec, clock: Clock): NpcGroup | undefined {
  if (!Number.isInteger(group.count) || group.count < 1 || group.count > MAX_GROUP_SIZE) return undefined
  // Clamped to what the table view carries (../session/protocol.ts): a template's text has no limits of its own.
  const name = group.name.trim().slice(0, MAX_NAME) || (group.kind === 'minions' ? 'Minions' : 'Lieutenants')
  const members = Array.from({ length: group.count }, (_, i) => ({ id: clock.newId(), n: i + 1, die: group.die, mods: [], acted: false }))
  const actions = group.actions === undefined || group.actions === 'any' ? 'any' : [...group.actions]
  const abilities = (group.abilities ?? []).slice(0, MAX_ABILITIES).map((a) => ({ name: a.name.trim().slice(0, MAX_NAME), type: a.type, text: a.text.slice(0, MAX_TEXT), ...(a.saveBonus ? { saveBonus: a.saveBonus } : {}) }))
  return { id: clock.newId(), ...(group.color ? { color: group.color } : {}), ...(group.templateId ? { templateId: group.templateId } : {}), kind: group.kind, name, hidden: group.hidden, owner: group.owner ?? { kind: 'gm' }, actions, ...(abilities.length ? { abilities } : {}), members }
}

/** Quick add, or a template brought in (docs/design/npcs/spec.md, section 3): a group on the table. */
export function addGroup(game: Game, group: GroupSpec, clock: Clock): Game {
  const added = newGroup(group, clock)
  if (!added) return game
  const word = GROUP_WORD[group.kind][group.count === 1 ? 0 : 1]
  const text = `The GM added ${added.name} (${group.count} ${group.die} ${word})${group.hidden ? ', hidden from players' : ''}.`
  return log(syncTurnOrder({ ...game, groups: [...game.groups, added] }), clock, text, { gmOnly: group.hidden })
}

/** What a challenge is made from: quick add, or a template. */
export type ChallengeSpec = { color?: CharColor; name: string; steps: number; hidden: boolean; labels?: readonly string[]; description?: string; whenDone?: string; templateId?: string; owner?: Challenge['owner'] }

/** A new challenge; undefined if the number of steps is out of range. */
export function newChallenge(challenge: ChallengeSpec, clock: Clock): Challenge | undefined {
  if (!Number.isInteger(challenge.steps) || challenge.steps < 1 || challenge.steps > MAX_STEPS) return undefined
  const name = challenge.name.trim().slice(0, MAX_NAME) || 'Challenge'
  return {
    id: clock.newId(),
    ...(challenge.color ? { color: challenge.color } : {}),
    ...(challenge.templateId ? { templateId: challenge.templateId } : {}),
    name,
    hidden: challenge.hidden,
    steps: Array.from({ length: challenge.steps }, (_, i) => ({ label: challenge.labels?.[i]?.trim().slice(0, MAX_NAME) || `Step ${i + 1}`, done: false })),
    requests: [],
    owner: challenge.owner ?? { kind: 'gm' },
    ...(challenge.description?.trim() ? { description: challenge.description.trim().slice(0, MAX_TEXT) } : {}),
    ...(challenge.whenDone?.trim() ? { whenDone: challenge.whenDone.trim().slice(0, MAX_TEXT) } : {}),
  }
}

export function addChallenge(game: Game, challenge: ChallengeSpec, clock: Clock): Game {
  const added = newChallenge(challenge, clock)
  if (!added) return game
  return log({ ...game, challenges: [...game.challenges, added] }, clock, `The GM added the challenge ${added.name}${challenge.hidden ? ', hidden from players' : ''}.`, { gmOnly: challenge.hidden })
}

/**
 * Sets the environment; a new one replaces the old (one per game), whose groups become the GM's.
 * Quick add gives a name only;
 * a template brings the rest (./environment.ts). Its name and description are clamped to what the
 * table view carries (../session/protocol.ts).
 */
export function setEnvironment(game: Game, environment: Omit<EnvironmentOnTable, 'id'>, clock: Clock): Game {
  return placeEnvironment(game, newEnvironment(environment, clock), clock)
}

/** An environment copy: its name and description clamped to what the table view carries. */
export function newEnvironment(environment: Omit<EnvironmentOnTable, 'id'>, clock: Clock): EnvironmentOnTable {
  const name = environment.name.trim().slice(0, MAX_NAME) || 'Environment'
  const description = environment.description?.trim().slice(0, MAX_TEXT)
  const { description: _, ...rest } = environment
  return { ...rest, id: clock.newId(), name, ...(description ? { description } : {}) }
}

/** An environment gone takes its claim with it: its groups and challenges are the GM's now. */
export function environmentLetsGo<T extends Pick<Game, 'groups' | 'challenges'>>(game: T): T {
  const toGm = <I extends { owner: { kind: 'gm' } | { kind: 'environment' } }>(item: I): I => (item.owner.kind === 'environment' ? { ...item, owner: { kind: 'gm' } } : item)
  return { ...game, groups: game.groups.map(toGm), challenges: game.challenges.map(toGm) }
}

/**
 * Puts an environment on the table (it may be waiting off the table). The one it replaces goes
 * off the table if a planned scene still names it, or out of the game if not.
 */
export function placeEnvironment(game: Game, environment: EnvironmentOnTable, clock: Clock): Game {
  const old = game.environment
  // What the old environment owned stays on the table as the GM's; its groups each get their own turn.
  const { groups, challenges } = old ? environmentLetsGo(game) : game
  const keepOld = old && old.id !== environment.id && game.scenes.some((s) => s.state === 'planned' && s.environmentId === old.id)
  const others = game.offTable.environments.filter((e) => e.id !== environment.id)
  const offTable = { ...game.offTable, environments: keepOld ? [...others, old] : others }
  const replaced = { ...game, groups, challenges, offTable, environment }
  return log(syncTurnOrder(replaced), clock, `The environment is now ${environment.name}${environment.hidden ? ', hidden from players' : ''}.`, { gmOnly: environment.hidden })
}

/** Removes an item or a hero from the table (and from the turn order). `text` says why, in place of "left the table". */
export function removeFromTable(game: Game, ref: ItemRef | ActorRef, clock: Clock, text?: string): Game {
  const name = itemName(game, ref)
  const gmOnly = ref.kind !== 'hero' && isHidden(game, ref)
  let next: Game
  switch (ref.kind) {
    case 'hero':
      if (!game.heroes.some((h) => h.id === ref.id)) return game
      next = { ...game, heroes: game.heroes.filter((h) => h.id !== ref.id), challenges: game.challenges.map((c) => (c.requests.some((r) => r.heroId === ref.id) ? { ...c, requests: c.requests.filter((r) => r.heroId !== ref.id) } : c)), pendingSyncs: game.pendingSyncs.filter((r) => r.heroId !== ref.id), ...(game.pendingHits ? { pendingHits: game.pendingHits.filter((x) => x.heroId !== ref.id) } : {}) }
      break
    case 'villain': {
      if (!findVillain(game, ref.id)) return game
      // Its Titan challenge goes with it.
      const closed = game.challenges.filter((c) => c.linkedVillainId === ref.id).reduce((g, c) => closeRequests(g, c.id, clock), game)
      next = { ...closed, villains: closed.villains.filter((v) => v.id !== ref.id), challenges: closed.challenges.filter((c) => c.linkedVillainId !== ref.id) }
      break
    }
    case 'group':
      if (!findGroup(game, ref.id)) return game
      next = { ...game, groups: game.groups.filter((g) => g.id !== ref.id) }
      break
    case 'challenge': {
      if (!game.challenges.some((c) => c.id === ref.id)) return game
      const closed = closeRequests(game, ref.id, clock)
      next = { ...closed, challenges: closed.challenges.filter((c) => c.id !== ref.id) }
      break
    }
    case 'environment': {
      if (game.environment?.id !== ref.id) return game
      const { environment: _, ...rest } = game
      next = environmentLetsGo(rest)
      break
    }
  }
  return log(syncTurnOrder(next), clock, text ?? `${name} left the table.`, { gmOnly })
}

/** Reveals an item to players, or hides it again. */
export function setHidden(game: Game, ref: ItemRef, hidden: boolean, clock: Clock): Game {
  if (isHidden(game, ref) === hidden) return game
  let next: Game
  switch (ref.kind) {
    case 'villain':
      if (!findVillain(game, ref.id)) return game
      // A Titan's challenge follows its villain.
      next = { ...game, villains: game.villains.map((v) => (v.id === ref.id ? { ...v, hidden } : v)), challenges: game.challenges.map((c) => (c.linkedVillainId === ref.id ? { ...c, hidden } : c)) }
      if (hidden) next = game.challenges.filter((c) => c.linkedVillainId === ref.id).reduce((g, c) => closeRequests(g, c.id, clock), next)
      break
    case 'group':
      if (!findGroup(game, ref.id)) return game
      next = { ...game, groups: game.groups.map((g) => (g.id === ref.id ? { ...g, hidden } : g)) }
      break
    case 'challenge':
      if (!game.challenges.some((c) => c.id === ref.id)) return game
      next = { ...game, challenges: game.challenges.map((c) => (c.id === ref.id ? { ...c, hidden } : c)) }
      // Players can't answer for what they can't see, so what's waiting is closed.
      if (hidden) next = closeRequests(next, ref.id, clock)
      break
    case 'environment':
      if (game.environment?.id !== ref.id) return game
      next = { ...game, environment: { ...game.environment, hidden } }
      break
  }
  const name = itemName(game, ref)
  return log(syncTurnOrder(next), clock, hidden ? `The GM hid ${name} from players.` : `The GM revealed ${name}.`, { gmOnly: hidden })
}

/** A group's, challenge's or the environment's color in this game; unset goes back to its side's. */
export function setItemColor(game: Game, ref: ItemRef, color: CharColor | undefined): Game {
  const paint = <T extends { color?: CharColor }>(item: T): T => {
    const { color: _, ...rest } = item
    return (color ? { ...rest, color } : rest) as T
  }
  switch (ref.kind) {
    case 'group':
      return { ...game, groups: game.groups.map((g) => (g.id === ref.id ? paint(g) : g)) }
    case 'challenge':
      return { ...game, challenges: game.challenges.map((c) => (c.id === ref.id ? paint(c) : c)) }
    case 'environment':
      return game.environment?.id === ref.id ? { ...game, environment: paint(game.environment) } : game
    default:
      return game
  }
}

/** A villain's colors in this game, at once; a player's hero's when their device says so. Nothing is logged: they're cosmetic. */
export function setCharacterColors(game: Game, ref: { kind: 'hero' | 'villain'; id: string }, appearance: Appearance | undefined): Game {
  const paint = <T extends { sheet: { appearance?: Appearance } }>(copy: T): T => {
    const { appearance: _, ...sheet } = copy.sheet
    return { ...copy, sheet: appearance ? { ...sheet, appearance } : sheet }
  }
  return ref.kind === 'hero' ? { ...game, heroes: game.heroes.map((h) => (h.id === ref.id ? paint(h) : h)) } : { ...game, villains: game.villains.map((v) => (v.id === ref.id ? paint(v) : v)) }
}

/** What players see of a villain. */
export function setPlayersSee(game: Game, villainId: string, playersSee: PlayersSee): Game {
  const villain = findVillain(game, villainId)
  if (!villain || villain.playersSee === playersSee) return game
  return { ...game, villains: game.villains.map((v) => (v.id === villainId ? { ...v, playersSee } : v)) }
}

// ---- Heroes and villains in play ----

/** Shares a character's new history entries to the log under its name. */
function shareNew(game: Game, by: string, before: readonly PlayHistoryEntry[], after: readonly PlayHistoryEntry[], clock: Clock, gmOnly: boolean, text: (e: PlayHistoryEntry) => string = (e) => e.text): Game {
  const known = new Set(before.map((e) => e.id))
  const fresh = after.filter((e) => !known.has(e.id)).map((e) => ({ ...e, text: text(e) }))
  return shareHistory(game, by, fresh, clock, gmOnly)
}

/**
 * Changes a hero's play state in this game (`fn` gets the play state and the game's copy of the
 * sheet), and logs its new history entries. `share: false` keeps them out of the log, and
 * entries starting "GM: " (the GM's edits, ./hero-changes.ts) are logged without it.
 */
export function changeHeroPlay(game: Game, heroId: string, fn: (play: PlayState, sheet: Hero) => PlayState, clock: Clock, share = true): Game {
  const hero = findHero(game, heroId)
  if (!hero) return game
  const play = fn(hero.play, hero.sheet)
  if (play === hero.play) return game
  const next = { ...game, heroes: game.heroes.map((h) => (h.id === heroId ? { ...h, play } : h)) }
  return share ? shareNew(next, heroDisplayName(hero.sheet), hero.play.history, play.history, clock, false, (e) => e.text.replace(/^GM: /, '')) : next
}

/** Changes a villain's play state in this game, and logs its new history entries (only the GM's while it's hidden). */
export function changeVillainPlay(game: Game, villainId: string, fn: (play: VillainPlayState, sheet: Villain) => VillainPlayState, clock: Clock, share = true): Game {
  const villain = findVillain(game, villainId)
  if (!villain) return game
  const play = fn(villain.play, villain.sheet)
  if (play === villain.play) return game
  const next = { ...game, villains: game.villains.map((v) => (v.id === villainId ? { ...v, play } : v)) }
  return share ? shareNew(next, villainDisplayName(villain.sheet), villain.play.history, play.history, clock, villain.hidden) : next
}

/**
 * Gives a hero's or villain's copy a newer sheet (Update from library, section 9; an approved
 * sync request, section 8; a solo game re-copying, section 12). Play state stays, subject to
 * `reconcile`'s adjustments, which go in the character's history and the log. Only this game's
 * copy changes.
 */
export function updateSheet(game: Game, ref: { kind: 'hero'; id: string; sheet: Hero } | { kind: 'villain'; id: string; sheet: Villain }, clock: Clock, why = 'from the library'): Game {
  const at = clock.now.toISOString()
  if (ref.kind === 'hero') {
    const hero = findHero(game, ref.id)
    if (!hero) return game
    const { play, adjustments } = reconcile(hero.play, ref.sheet, hero.sheet)
    const text = `The sheet was updated ${why}.`
    const entry: PlayHistoryEntry = { id: clock.newId(), at, text, ...(adjustments.length ? { details: adjustments } : {}) }
    // A player's colors reach the game by themselves (docs/design/character-colors/spec.md, section 6): a sheet waiting for review may hold older ones.
    const { appearance: _, ...rest } = structuredClone(ref.sheet)
    const kept = hero.player ? (hero.sheet.appearance ? { appearance: hero.sheet.appearance } : {}) : ref.sheet.appearance ? { appearance: ref.sheet.appearance } : {}
    const updated = { ...hero, sheet: { ...rest, ...kept }, play: { ...play, history: [...play.history, entry] } }
    const next = { ...game, heroes: game.heroes.map((h) => (h.id === ref.id ? updated : h)), pendingSyncs: game.pendingSyncs.filter((r) => r.heroId !== ref.id) }
    return log(next, clock, `${heroDisplayName(ref.sheet)}: ${text}`, { details: adjustments })
  }
  const villain = findVillain(game, ref.id)
  if (!villain) return game
  const { play, adjustments } = reconcileVillain(villain.play, ref.sheet, villain.sheet)
  const text = `The sheet was updated ${why}.`
  const entry: PlayHistoryEntry = { id: clock.newId(), at, text, ...(adjustments.length ? { details: adjustments } : {}) }
  const updated = { ...villain, sheet: structuredClone(ref.sheet), play: { ...play, history: [...play.history, entry] } }
  const replaced = withTitanChallenge({ ...game, villains: game.villains.map((v) => (v.id === ref.id ? updated : v)) }, ref.id, clock)
  return log(replaced, clock, `${villainDisplayName(ref.sheet)}: ${text}`, { details: adjustments, gmOnly: villain.hidden })
}

/**
 * A hero's play state with this game's scene zone, which raises their zone (p. 14; heroes only,
 * ruling 64). A solo game has no tracker: the Play page's own scene control sets it.
 */
export function heroPlayInScene(game: HasTracker & { solo?: unknown }, play: PlayState): PlayState {
  if (game.solo) return play
  const zone = sceneZone(game)
  const { sceneZone: _, ...rest } = play
  return zone === 'green' ? rest : { ...rest, sceneZone: zone }
}

// ---- Making the scene more dangerous (p. 154) ----

/**
 * The villain's once-per-scene Overcome is decided. A success advances the tracker one box, which
 * the log says publicly; a hidden villain isn't named. A failure, or a tracker with no boxes left,
 * just spends the use.
 */
export function resolveDanger(game: Game, villainId: string, success: boolean, clock: Clock): Game {
  const villain = findVillain(game, villainId)
  if (!villain || villain.dangerUsed) return game
  const spend = (dangerUsed: NonNullable<VillainInGame['dangerUsed']>, g: Game = game) => ({ ...g, villains: g.villains.map((v) => (v.id === villainId ? { ...v, dangerUsed } : v)) })
  if (!success) return spend({ failed: true })
  const { tracker, position } = sceneOnTable(game)
  const box = position + 1
  const name = villainDisplayName(villain.sheet)
  if (box >= tracker.length) return log(spend({}), clock, villain.hidden ? 'The scene tracker has run out.' : `${name} made the scene more dangerous, but the scene tracker has run out.`)
  const moved = spend({ box }, changeCurrentScene(game, (s) => ({ ...s, position: box })))
  const label = boxLabel(tracker, box)
  return villain.hidden ? withLog(moved, [line(clock, `The scene tracker moved to ${label}.`), line(clock, `${name} made the scene more dangerous.`, { gmOnly: true })]) : log(moved, clock, `${name} made the scene more dangerous. The scene tracker moved to ${label}.`)
}

/** Takes it back: the tracker moves back if it moved, and the use returns. */
export function undoDanger(game: Game, villainId: string, clock: Clock): Game {
  const villain = findVillain(game, villainId)
  if (!villain?.dangerUsed) return game
  const { dangerUsed, ...rest } = villain
  const restored = { ...game, villains: game.villains.map((v) => (v.id === villainId ? rest : v)) }
  if (dangerUsed.box === undefined) return restored
  const { tracker, position } = sceneOnTable(game)
  const back = Math.max(0, position - 1)
  const moved = changeCurrentScene(restored, (s) => ({ ...s, position: back }))
  return log(moved, clock, villain.hidden ? `The scene tracker moved back to ${boxLabel(tracker, back)}.` : `Undid: ${villainDisplayName(villain.sheet)} advanced the tracker. It's back at ${boxLabel(tracker, back)}.`)
}

/** The row's words once the use is spent: "Used this scene. The tracker moved to Yellow 2." */
export function dangerText(used: NonNullable<VillainInGame['dangerUsed']>, tracker: readonly Zone[]): string {
  if (used.failed) return 'Used this scene. The roll failed.'
  return used.box === undefined ? 'Used this scene. The tracker had no boxes left.' : `Used this scene. The tracker moved to ${boxLabel(tracker, used.box)}.`
}

// ---- Groups and their members ----

/** "Minion 2" or "Lieutenant 2". */
export const memberLabel = (group: Pick<NpcGroup, 'kind'>, n: number) => `${group.kind === 'minions' ? 'Minion' : 'Lieutenant'} ${n}`
/** "Scrap drones 2", for naming a member's buttons and its log lines. */
export const memberName = (group: Pick<NpcGroup, 'name'>, n: number) => `${group.name} ${n}`

/** The group's dice, largest first, with how many members have each: d6 × 2, d4 × 1. */
export function groupSummary(group: Pick<NpcGroup, 'members'>): { die: Die; count: number }[] {
  return (['d12', 'd10', 'd8', 'd6', 'd4'] as const).map((die) => ({ die, count: group.members.filter((m) => m.die === die).length })).filter((g) => g.count > 0)
}

function changeGroup(game: Game, groupId: string, change: (g: NpcGroup) => NpcGroup): Game {
  return { ...game, groups: game.groups.map((g) => (g.id === groupId ? change(g) : g)) }
}

/** "1 of 4 acted". */
export const actedText = (group: Pick<NpcGroup, 'members'>) => `${group.members.filter((m) => m.acted).length} of ${group.members.length} acted`

/** The members ready to act (not acted yet). */
export const readyMembers = (group: Pick<NpcGroup, 'members'>) => group.members.filter((m) => !m.acted)

/** Every member of the matching groups is ready again, and its defenses are gone (no log line: it's part of a turn starting). */
function clearActed(game: Game, which: (g: NpcGroup) => boolean): Game {
  if (!game.groups.some((g) => which(g) && g.members.some((m) => m.acted || m.defenses))) return game
  return { ...game, groups: game.groups.map((g) => (which(g) ? { ...g, members: g.members.map((m) => (m.acted || m.defenses ? clearDefenses({ ...m, acted: false }) : m)) } : g)) }
}

/** The GM marks a member as acted, or not (its ⋯ menu). */
export function setMemberActed(game: Game, groupId: string, memberId: string, acted: boolean, clock: Clock): Game {
  const group = findGroup(game, groupId)
  const member = group?.members.find((m) => m.id === memberId)
  if (!group || !member || member.acted === acted) return game
  const next = changeGroup(game, groupId, (g) => ({ ...g, members: g.members.map((m) => (m.id === memberId ? { ...m, acted } : m)) }))
  return log(next, clock, `The GM marked ${memberName(group, member.n)} as ${acted ? 'acted' : 'not acted'}.`, { gmOnly: group.hidden })
}

/**
 * Removes a member; the last one gone removes the group and its turn-order entry. A member KO'd
 * by a save (`ko`) gets no line of its own: the save's line already says so.
 */
export function removeMember(game: Game, groupId: string, memberId: string, clock: Clock, why: 'removed' | 'shrank' | 'ko' = 'removed'): Game {
  const group = findGroup(game, groupId)
  const member = group?.members.find((m) => m.id === memberId)
  if (!group || !member) return game
  const gmOnly = group.hidden
  const name = memberName(group, member.n)
  const lines = why === 'ko' ? [] : [line(clock, why === 'shrank' ? `${name} shrank away and is gone.` : `${name} was removed.`, { gmOnly })]
  const members = group.members.filter((m) => m.id !== memberId)
  if (members.length) return withLog(changeGroup(game, groupId, (g) => ({ ...g, members })), lines)
  const without = syncTurnOrder({ ...game, groups: game.groups.filter((g) => g.id !== groupId) })
  return withLog(without, [...lines, line(clock, `All of ${group.name} are gone; the group left the table.`, { gmOnly })])
}

/** Drops a member one die size; on a d4 it's removed instead. */
export function shrinkMember(game: Game, groupId: string, memberId: string, clock: Clock): Game {
  const group = findGroup(game, groupId)
  const member = group?.members.find((m) => m.id === memberId)
  if (!group || !member) return game
  if (member.die === 'd4') return removeMember(game, groupId, memberId, clock, 'shrank')
  const die = stepDie(member.die, -1)
  const shrunk = changeGroup(game, groupId, (g) => ({ ...g, members: g.members.map((m) => (m.id === memberId ? { ...m, die } : m)) }))
  return log(shrunk, clock, `${memberName(group, member.n)} shrank to ${die}.`, { gmOnly: group.hidden })
}

export function addMemberMod(game: Game, groupId: string, memberId: string, mod: Omit<PlayMod, 'id'>, clock: Clock): Game {
  const group = findGroup(game, groupId)
  const member = group?.members.find((m) => m.id === memberId)
  if (!group || !member || !Number.isInteger(mod.value) || mod.value === 0) return game
  const added: PlayMod = { id: clock.newId(), label: mod.label.trim(), value: mod.value, ...(mod.persistent ? { persistent: true } : {}), ...(mod.exclusive ? { exclusive: true } : {}) }
  const next = changeGroup(game, groupId, (g) => ({ ...g, members: g.members.map((m) => (m.id === memberId ? { ...m, mods: [...m.mods, added] } : m)) }))
  return log(next, clock, `${memberName(group, member.n)} gained ${describeMod(added)}.`, { gmOnly: group.hidden })
}

export function removeMemberMod(game: Game, groupId: string, memberId: string, modId: string, clock: Clock): Game {
  const group = findGroup(game, groupId)
  const member = group?.members.find((m) => m.id === memberId)
  const mod = member?.mods.find((m) => m.id === modId)
  if (!group || !member || !mod) return game
  const next = changeGroup(game, groupId, (g) => ({ ...g, members: g.members.map((m) => (m.id === memberId ? { ...m, mods: m.mods.filter((x) => x.id !== modId) } : m)) }))
  return log(next, clock, `${memberName(group, member.n)}: removed ${describeMod(mod)}.`, { gmOnly: group.hidden })
}

// ---- Hits on heroes (ruling 65) ----

/** Takes `amount` off a hero's Health after `defense` (used up). No log line: the caller writes it. */
export function damageHero(game: Game, heroId: string, amount: number, defense: Defense | undefined, clock: Clock): Game {
  const { taken } = blockWith(amount, defense)
  return changeHeroPlay(
    game,
    heroId,
    (p, sheet) => {
      const after = defense ? removeDefense(p, defense.id) : p
      const built = buildSheet(sheet)
      const now = currentHealth(built, after)
      return now === undefined || taken === 0 ? after : setHealth(after, built, now - taken, clock)
    },
    clock,
  )
}

/** Who chooses a hero's defense: its player, or the GM for their own hero. */
export const defenseChooser = (hero: Pick<HeroInGame, 'player'>) => hero.player?.name || (hero.player ? 'The player' : 'The GM')

/**
 * Settles a hit that was waiting for a choice of defense: `defenseId`, or the default if it's
 * unset or gone. "Maya Reyes used Defend 5 against Gravelord's 8 damage: 3 taken."
 */
export function resolveHit(game: Game, hitId: string, defenseId: string | undefined, clock: Clock): Game {
  const hit = game.pendingHits?.find((h) => h.id === hitId)
  if (!hit) return game
  const rest = { ...game, pendingHits: game.pendingHits!.filter((h) => h.id !== hitId) }
  const hero = findHero(rest, hit.heroId)
  if (!hero) return rest
  const defense = pickDefense(defensesOf(hero.play), hit.amount, defenseId)
  const { taken } = blockWith(hit.amount, defense)
  const text = defense ? `${heroDisplayName(hero.sheet)} used ${defenseText(defense)} against ${hit.by}'s ${hit.amount} damage: ${taken} taken.` : `${heroDisplayName(hero.sheet)} took ${hit.amount} damage from ${hit.by}.`
  return damageHero(log(rest, clock, text, { by: hit.by, gmOnly: Boolean(hit.gmOnly) }), hit.heroId, hit.amount, defense, clock)
}

/** Puts a hit on a hero aside until its owner chooses a defense. */
export function holdHit(game: Game, hit: Omit<PendingHit, 'id' | 'at'>, clock: Clock): Game {
  return { ...game, pendingHits: [...(game.pendingHits ?? []), { ...hit, id: clock.newId(), at: clock.now.toISOString() }] }
}

// ---- Challenges ----

/** Its progress: "1 of 3", or "Done". */
export const stepsText = (challenge: Pick<Challenge, 'steps'>) => (challengeDone(challenge) ? 'Done' : `${challenge.steps.filter((s) => s.done).length} of ${challenge.steps.length}`)

/** The challenges a player's Overcome can go against, from what they were sent: revealed, and not yet done. */
export const overcomeOptions = (challenges: readonly Challenge[]) => challenges.filter((c) => !challengeDone(c) && !c.hidden).map((c) => ({ id: c.id, label: `Challenge: ${c.name} (${stepsText(c)})` }))

function changeChallenge(game: Game, challengeId: string, change: (c: Challenge) => Challenge): Game {
  return { ...game, challenges: game.challenges.map((c) => (c.id === challengeId ? change(c) : c)) }
}

/** Drops a challenge's waiting requests, telling each player (only them, and the GM) that it closed. */
export function closeRequests(game: Game, challengeId: string, clock: Clock): Game {
  const challenge = game.challenges.find((c) => c.id === challengeId)
  if (!challenge?.requests.length) return game
  const lines = challenge.requests.map((r): GameFeedEntry => ({ ...line(clock, 'The GM closed this challenge before answering.', { by: challenge.name }), forHero: r.heroId }))
  return withLog(changeChallenge(game, challengeId, (c) => ({ ...c, requests: [] })), lines)
}

/**
 * Checks or unchecks a step, logged in the GM's words, or the player's when `requestId` is the
 * Overcome it answers, which then clears. The last step done shows the "when it's done" text and
 * closes anything else waiting.
 */
export function setChallengeStep(game: Game, challengeId: string, index: number, done: boolean, clock: Clock, requestId?: string): Game {
  const challenge = game.challenges.find((c) => c.id === challengeId)
  const step = challenge?.steps[index]
  if (!challenge || !step || step.done === done) return game
  const gmOnly = challenge.hidden
  const request = challenge.requests.find((r) => r.id === requestId)
  const steps = challenge.steps.map((s, i) => (i === index ? { ...s, done } : s))
  const requests = request ? challenge.requests.filter((r) => r !== request) : challenge.requests
  const text = request ? `${heroLabelOf(game.heroes, request.heroId)}'s Overcome checked off "${step.label}".` : `The GM ${done ? 'checked off' : 'unchecked'} "${step.label}".`
  const next = log(changeChallenge(game, challengeId, (c) => ({ ...c, steps, requests })), clock, text, { gmOnly })
  if (challengeDone(challenge) || !challengeDone({ steps })) return next
  const finished = log(next, clock, `${challenge.name} is done.${challenge.whenDone ? ` ${challenge.whenDone}` : ''}`, { gmOnly })
  return closeRequests(finished, challengeId, clock)
}

/** The next step a request would check off. */
export const nextStep = (challenge: Pick<Challenge, 'steps'>) => challenge.steps.findIndex((s) => !s.done)

/** The GM answers a player's Overcome: check off the next step, or not this time. */
export function answerRequest(game: Game, challengeId: string, requestId: string, check: boolean, clock: Clock): Game {
  const challenge = game.challenges.find((c) => c.id === challengeId)
  const request = challenge?.requests.find((r) => r.id === requestId)
  if (!challenge || !request) return game
  if (check) return setChallengeStep(game, challengeId, nextStep(challenge), true, clock, requestId)
  const next = changeChallenge(game, challengeId, (c) => ({ ...c, requests: c.requests.filter((r) => r.id !== requestId) }))
  return log(next, clock, `${heroLabelOf(game.heroes, request.heroId)}'s Overcome didn't complete a step.`, { gmOnly: challenge.hidden })
}

/** Every step undone, so a long fight can repeat it. What's waiting stays: it's still a fair question. */
export function resetChallenge(game: Game, challengeId: string, clock: Clock): Game {
  const challenge = game.challenges.find((c) => c.id === challengeId)
  if (!challenge || !challenge.steps.some((s) => s.done)) return game
  return log(changeChallenge(game, challengeId, (c) => ({ ...c, steps: c.steps.map((s) => ({ ...s, done: false })) })), clock, `The GM reset ${challenge.name}.`, { gmOnly: challenge.hidden })
}

/** Renames a challenge's steps (⋯ Edit steps…). A blank one reads "Step 1". */
export function renameChallengeSteps(game: Game, challengeId: string, labels: readonly string[]): Game {
  return changeChallenge(game, challengeId, (c) => ({ ...c, steps: c.steps.map((s, i) => ({ ...s, label: (labels[i] ?? s.label).trim().slice(0, MAX_NAME) || `Step ${i + 1}` })) }))
}

/**
 * ⋯ "Give to the environment" or "Give to the GM", for a challenge added the wrong way. A Titan's
 * challenge stays the GM's, and with no environment there's no one else to give it to.
 */
export function setChallengeOwner(game: Game, challengeId: string, kind: Challenge['owner']['kind']): Game {
  const challenge = game.challenges.find((c) => c.id === challengeId)
  if (!challenge || challenge.linkedVillainId || challenge.owner.kind === kind || (kind === 'environment' && !game.environment)) return game
  return changeChallenge(game, challengeId, (c) => ({ ...c, owner: { kind } }))
}

/** ⋯ Edit steps…: the step names, and the optional description and "when it's done" text. */
export function editChallenge(game: Game, challengeId: string, edit: { labels: readonly string[]; description: string; whenDone: string }): Game {
  const description = edit.description.trim().slice(0, MAX_TEXT)
  const whenDone = edit.whenDone.trim().slice(0, MAX_TEXT)
  return changeChallenge(renameChallengeSteps(game, challengeId, edit.labels), challengeId, ({ description: _d, whenDone: _w, ...c }) => ({ ...c, ...(description ? { description } : {}), ...(whenDone ? { whenDone } : {}) }))
}

// ---- Turn order (popcorn) ----

/** Who hasn't acted this round and isn't acting now. */
export function waiting(game: Pick<Game, 'turn'>): ActorRef[] {
  return game.turn.order.filter((ref) => !sameActor(ref, game.turn.current) && !game.turn.acted.some((a) => sameActor(a, ref)))
}

export type TurnState = 'acted' | 'current' | 'waiting'

/** The strip: who acted this round in the order they did, then who's acting, then the rest in the fixed order. */
export function turnStrip(game: Pick<Game, 'turn'>): { ref: ActorRef; state: TurnState }[] {
  const acted = game.turn.acted.filter((ref) => game.turn.order.some((o) => sameActor(o, ref)))
  const current = game.turn.current ? [{ ref: game.turn.current, state: 'current' as const }] : []
  return [...acted.map((ref) => ({ ref, state: 'acted' as const })), ...current, ...waiting(game).map((ref) => ({ ref, state: 'waiting' as const }))]
}

const clearMinionDefenses = (p: PlayState): PlayState => (p.minions?.some((m) => m.defenses) ? { ...p, minions: p.minions.map(clearDefenses) } : p)

/**
 * A turn starting: the actor's reaction and defenses are cleared (that character's only, not at
 * round start; ruling 65), a group's members are ready again with no defenses, and when it's the environment's turn, the scene tracker
 * advances and the environment's groups are ready again.
 */
function startTurn(game: Game, ref: ActorRef, clock: Clock): Game {
  switch (ref.kind) {
    case 'environment':
      return advanceTracker(clearActed(game, (g) => g.owner.kind === 'environment'), clock)
    case 'group':
      return clearActed(game, (g) => g.id === ref.id)
    case 'hero': {
      // Hits still waiting for a choice take the default defense before the defenses go.
      const resolved = (game.pendingHits ?? []).filter((h) => h.heroId === ref.id).reduce((g, h) => resolveHit(g, h.id, undefined, clock), game)
      // The hero's defenses go, and its minions' (they act on its turn).
      return changeHeroPlay(resolved, ref.id, (p) => clearMinionDefenses(clearDefenses(setReactionUsed(p, false, clock))), clock, false)
    }
    case 'villain':
      return changeVillainPlay(game, ref.id, (p) => clearDefenses(setReactionUsed(p, false, clock)), clock, false)
    default:
      return game
  }
}

/** Whether the round is over: it has started and nobody is left to hand off to. */
export const roundOver = (game: Pick<Game, 'turn' | 'round'>) => game.round > 0 && waiting(game).length === 0

/** Whoever is acting hands off to someone who hasn't acted this round. */
export function handOff(game: Game, to: ActorRef, clock: Clock): Game {
  if (betweenIssues(game) || game.round === 0 || !waiting(game).some((w) => sameActor(w, to))) return game
  const from = game.turn.current
  const acted = from ? [...game.turn.acted, from] : game.turn.acted
  const next = { ...game, turn: { ...game.turn, acted, current: to } }
  const toName = itemName(game, to)
  const text = from ? `${itemName(game, from)} handed off to ${toName}.` : `${toName} is up.`
  const gmOnly = isHidden(game, to) || Boolean(from && isHidden(game, from))
  return startTurn(log(next, clock, text, { gmOnly }), to, clock)
}

/** Starts the next round (or the first) with `first` acting: allowed before round 1 and once a round is over. */
export function startRound(game: Game, first: ActorRef, clock: Clock): Game {
  if (betweenIssues(game) || !(game.round === 0 || roundOver(game)) || !game.turn.order.some((o) => sameActor(o, first))) return game
  const round = game.round + 1
  const next = { ...game, round, turn: { ...game.turn, acted: [], current: first } }
  const gmOnly = isHidden(game, first)
  const lines = gmOnly
    ? [line(clock, `Round ${round} started.`), line(clock, `${itemName(game, first)} goes first.`, { gmOnly: true })]
    : [line(clock, `Round ${round} started. ${itemName(game, first)} goes first.`)]
  return startTurn(withLog(next, lines), first, clock)
}

// The GM fixing mistakes: no turn-start effects.

/** Sets who's acting (or nobody). */
export function setCurrent(game: Game, ref: ActorRef | undefined, clock: Clock): Game {
  if (sameActor(ref, game.turn.current) || (!ref && !game.turn.current)) return game
  if (ref && !game.turn.order.some((o) => sameActor(o, ref))) return game
  const acted = ref ? game.turn.acted.filter((a) => !sameActor(a, ref)) : game.turn.acted
  const { current: _, ...turn } = game.turn
  const next = { ...game, turn: { ...turn, acted, ...(ref ? { current: ref } : {}) } }
  return log(next, clock, ref ? `The GM set ${itemName(game, ref)} as acting now.` : 'The GM set nobody as acting now.', { gmOnly: Boolean(ref && isHidden(game, ref)) })
}

/** Marks an actor as having acted this round, or not. */
export function setActed(game: Game, ref: ActorRef, acted: boolean, clock: Clock): Game {
  if (!game.turn.order.some((o) => sameActor(o, ref))) return game
  const has = game.turn.acted.some((a) => sameActor(a, ref))
  if (has === acted) return game
  const isCurrent = sameActor(ref, game.turn.current)
  const { current: _, ...turn } = game.turn
  const next = {
    ...game,
    turn: { ...turn, acted: acted ? [...game.turn.acted, ref] : game.turn.acted.filter((a) => !sameActor(a, ref)), ...(game.turn.current && !(acted && isCurrent) ? { current: game.turn.current } : {}) },
  }
  return log(next, clock, `The GM marked ${itemName(game, ref)} as ${acted ? 'acted' : 'not acted'} this round.`, { gmOnly: isHidden(game, ref) })
}

export function setRound(game: Game, round: number, clock: Clock): Game {
  if (!Number.isInteger(round) || round < 0 || round === game.round) return game
  return log({ ...game, round }, clock, round === 0 ? 'The GM set the game back to before the first round.' : `The GM set the round to ${round}.`)
}

// ---- Small edits ----

export function renameGame(game: Game, name: string): Game {
  return { ...game, name: name.trim() }
}

/**
 * A new code for the game (docs/design/game-table/game-table-spec-addendum-game-codes.md): the
 * old one stops working. While hosting, `moved` says who came along to the new code and who was
 * removed; the GM-only log line records it.
 */
export function setGameCode(game: Game, code: string, clock: Clock, moved?: { kept: readonly string[]; removed: readonly string[] }): Game {
  if (game.code === code) return game
  const parts = moved ? [moved.kept.length ? ` Kept: ${nameList(moved.kept)}.` : ' Kept: no one.', moved.removed.length ? ` Removed: ${nameList(moved.removed)}.` : ''] : []
  return log({ ...game, code }, clock, `You changed the game code.${parts.join('')}`, { by: GM, gmOnly: true })
}

export function setNotes(game: Game, notes: string): Game {
  return notes === game.notes ? game : { ...game, notes }
}
