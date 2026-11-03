/**
 * The game table's rules (docs/design/game-table/spec.md, sections 3–9). Pure: each change
 * takes the game and returns the new one, with a line in the table log where the table should
 * know. A line about something hidden is marked `gmOnly`.
 *
 * Heroes and villains on the table are copies in the game (./model.ts), so everything about
 * them, names included, comes from the game itself, and the game's state changes directly: a
 * turn starting clears that character's reaction, and the GM's edits change the game's copy.
 */
import { nameList } from './names'
import { stepDie } from '../rules/dice'
import type { Die, Zone } from '../rules/types'
import { heroDisplayName, type Hero, type PlayHistoryEntry, type PlayMod, type PlayState } from '../hero/model'
import { describeMod, setReactionUsed, type Clock } from '../play/state'
import { clearDefenses } from '../play/defense'
import { FEED_LIMIT } from '../session/types'
import { villainDisplayName, type Villain, type VillainPlayState } from '../villain/model'
import { heroCopy, MAX_BOXES, MAX_GROUP_SIZE, MAX_STEPS, trackerFromCounts, villainCopy, type ActorRef, type Challenge, type Game, type GameFeedEntry, type HeroInGame, type NpcGroup, type PlayersSee, type TrackerCounts, type VillainInGame } from './model'
import { reconcile, reconcileVillain } from './reconcile'

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
export function sceneZone(game: Pick<Game, 'scene'>): Zone {
  return game.scene.tracker[game.scene.position] ?? 'green'
}

/** How many boxes of each zone the tracker has. */
export function trackerCounts(tracker: readonly Zone[]): TrackerCounts {
  return { green: tracker.filter((z) => z === 'green').length, yellow: tracker.filter((z) => z === 'yellow').length, red: tracker.filter((z) => z === 'red').length }
}

/** A box's name: "Green 3" for the third green box. */
export function boxLabel(tracker: readonly Zone[], index: number): string {
  const zone = tracker[index]
  if (!zone) return ''
  return `${ZONE_NAME[zone]} ${tracker.slice(0, index + 1).filter((z) => z === zone).length}`
}

/** The GM moves the tracker to a box (correcting it). */
export function setTrackerPosition(game: Game, position: number, clock: Clock): Game {
  if (!Number.isInteger(position) || position < 0 || position >= game.scene.tracker.length || position === game.scene.position) return game
  return log({ ...game, scene: { ...game.scene, position } }, clock, `The GM moved the scene tracker to ${boxLabel(game.scene.tracker, position)}.`)
}

/** Advances the tracker one box (the environment's turn); on the last box it stays and the log says so. */
export function advanceTracker(game: Game, clock: Clock): Game {
  const next = game.scene.position + 1
  if (next >= game.scene.tracker.length) return log(game, clock, 'The scene tracker has run out.')
  return log({ ...game, scene: { ...game.scene, position: next } }, clock, `The scene tracker moved to ${boxLabel(game.scene.tracker, next)}.`)
}

/** Whether box counts are allowed: each 0–MAX_BOXES, and at least one box. */
export function validCounts(counts: TrackerCounts): boolean {
  const all = [counts.green, counts.yellow, counts.red]
  return all.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_BOXES) && all.some((n) => n > 0)
}

/** Scene setup: the scene's name and the box counts, and optionally back to the first box. */
export function setupScene(game: Game, setup: { name: string; counts: TrackerCounts; reset: boolean }, clock: Clock): Game {
  if (!validCounts(setup.counts)) return game
  const tracker = trackerFromCounts(setup.counts)
  const position = setup.reset ? 0 : Math.min(game.scene.position, tracker.length - 1)
  const name = setup.name.trim()
  const scene = { name, tracker, position }
  const lines: string[] = []
  if (name !== game.scene.name) lines.push(name ? `The scene is now ${name}.` : 'The scene has no name now.')
  if (tracker.join() !== game.scene.tracker.join()) lines.push(`The scene tracker now has ${setup.counts.green} green, ${setup.counts.yellow} yellow and ${setup.counts.red} red ${tracker.length === 1 ? 'box' : 'boxes'}.`)
  if (position !== game.scene.position || (lines.length && setup.reset)) lines.push(`The scene tracker is at ${boxLabel(tracker, position)}.`)
  return withLog({ ...game, scene }, lines.map((text) => line(clock, text)))
}

// ---- What's on the table ----

/** Something the GM can hide: an opposition item or the environment. */
export type ItemRef = { kind: 'villain' | 'group' | 'challenge' | 'environment'; id: string }

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
    case 'group':
      return findGroup(game, ref.id)?.name ?? 'A group'
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
export function copyOf(game: Pick<Game, 'heroes' | 'villains'>, kind: 'hero' | 'villain', sourceId: string): HeroInGame | VillainInGame | undefined {
  return kind === 'hero' ? game.heroes.find((h) => h.sourceId === sourceId) : game.villains.find((v) => v.sourceId === sourceId)
}

/** Copies a hero into the game with fresh play state: one of the GM's own, or (Phase 2) a joining player's. */
export function addHero(game: Game, hero: Hero, clock: Clock, player?: HeroInGame['player']): Game {
  if (copyOf(game, 'hero', hero.id)) return game
  const added = { ...game, heroes: [...game.heroes, heroCopy(hero, clock.newId(), player)] }
  return log(syncTurnOrder(added), clock, `${heroDisplayName(hero)} joined the table.`)
}

/** Copies a villain into the game with fresh play state (hidden unless said otherwise). */
export function addVillain(game: Game, villain: Villain, clock: Clock, hidden = true): Game {
  if (copyOf(game, 'villain', villain.id)) return game
  const name = villainDisplayName(villain)
  const added = { ...game, villains: [...game.villains, villainCopy(villain, clock.newId(), hidden)] }
  return log(syncTurnOrder(added), clock, hidden ? `The GM brought in ${name}, hidden from players.` : `${name} joined the table.`, { gmOnly: hidden })
}

const GROUP_WORD = { minions: ['minion', 'minions'], lieutenants: ['lieutenant', 'lieutenants'] } as const

/** Quick add: a group whose members all start with the same die. */
export function addGroup(game: Game, group: { kind: NpcGroup['kind']; name: string; die: Die; count: number; hidden: boolean }, clock: Clock): Game {
  if (!Number.isInteger(group.count) || group.count < 1 || group.count > MAX_GROUP_SIZE) return game
  const name = group.name.trim() || (group.kind === 'minions' ? 'Minions' : 'Lieutenants')
  const members = Array.from({ length: group.count }, (_, i) => ({ id: clock.newId(), n: i + 1, die: group.die, mods: [], acted: false }))
  const added: NpcGroup = { id: clock.newId(), kind: group.kind, name, hidden: group.hidden, owner: { kind: 'gm' }, actions: 'any', members }
  const word = GROUP_WORD[group.kind][group.count === 1 ? 0 : 1]
  const text = `The GM added ${name} (${group.count} ${group.die} ${word})${group.hidden ? ', hidden from players' : ''}.`
  return log(syncTurnOrder({ ...game, groups: [...game.groups, added] }), clock, text, { gmOnly: group.hidden })
}

export function addChallenge(game: Game, challenge: { name: string; steps: number; hidden: boolean }, clock: Clock): Game {
  if (!Number.isInteger(challenge.steps) || challenge.steps < 1 || challenge.steps > MAX_STEPS) return game
  const name = challenge.name.trim() || 'Challenge'
  const added: Challenge = { id: clock.newId(), name, hidden: challenge.hidden, steps: Array.from({ length: challenge.steps }, () => false) }
  return log({ ...game, challenges: [...game.challenges, added] }, clock, `The GM added the challenge ${name}${challenge.hidden ? ', hidden from players' : ''}.`, { gmOnly: challenge.hidden })
}

/** Sets the environment; a new one replaces the old (one per game). */
export function setEnvironment(game: Game, environment: { name: string; hidden: boolean }, clock: Clock): Game {
  const name = environment.name.trim() || 'Environment'
  const replaced = { ...game, environment: { id: clock.newId(), name, hidden: environment.hidden } }
  return log(syncTurnOrder(replaced), clock, `The environment is now ${name}${environment.hidden ? ', hidden from players' : ''}.`, { gmOnly: environment.hidden })
}

/** Removes an item or a hero from the table (and from the turn order). */
export function removeFromTable(game: Game, ref: ItemRef | ActorRef, clock: Clock): Game {
  const name = itemName(game, ref)
  const gmOnly = ref.kind !== 'hero' && isHidden(game, ref)
  let next: Game
  switch (ref.kind) {
    case 'hero':
      if (!game.heroes.some((h) => h.id === ref.id)) return game
      next = { ...game, heroes: game.heroes.filter((h) => h.id !== ref.id), pendingSyncs: game.pendingSyncs.filter((r) => r.heroId !== ref.id) }
      break
    case 'villain':
      if (!findVillain(game, ref.id)) return game
      next = { ...game, villains: game.villains.filter((v) => v.id !== ref.id) }
      break
    case 'group':
      if (!findGroup(game, ref.id)) return game
      next = { ...game, groups: game.groups.filter((g) => g.id !== ref.id) }
      break
    case 'challenge':
      if (!game.challenges.some((c) => c.id === ref.id)) return game
      next = { ...game, challenges: game.challenges.filter((c) => c.id !== ref.id) }
      break
    case 'environment': {
      if (game.environment?.id !== ref.id) return game
      const { environment: _, ...rest } = game
      next = rest
      break
    }
  }
  return log(syncTurnOrder(next), clock, `${name} left the table.`, { gmOnly })
}

/** Reveals an item to players, or hides it again. */
export function setHidden(game: Game, ref: ItemRef, hidden: boolean, clock: Clock): Game {
  if (isHidden(game, ref) === hidden) return game
  let next: Game
  switch (ref.kind) {
    case 'villain':
      if (!findVillain(game, ref.id)) return game
      next = { ...game, villains: game.villains.map((v) => (v.id === ref.id ? { ...v, hidden } : v)) }
      break
    case 'group':
      if (!findGroup(game, ref.id)) return game
      next = { ...game, groups: game.groups.map((g) => (g.id === ref.id ? { ...g, hidden } : g)) }
      break
    case 'challenge':
      if (!game.challenges.some((c) => c.id === ref.id)) return game
      next = { ...game, challenges: game.challenges.map((c) => (c.id === ref.id ? { ...c, hidden } : c)) }
      break
    case 'environment':
      if (game.environment?.id !== ref.id) return game
      next = { ...game, environment: { ...game.environment, hidden } }
      break
  }
  const name = itemName(game, ref)
  return log(syncTurnOrder(next), clock, hidden ? `The GM hid ${name} from players.` : `The GM revealed ${name}.`, { gmOnly: hidden })
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
    const updated = { ...hero, sheet: structuredClone(ref.sheet), play: { ...play, history: [...play.history, entry] } }
    const next = { ...game, heroes: game.heroes.map((h) => (h.id === ref.id ? updated : h)), pendingSyncs: game.pendingSyncs.filter((r) => r.heroId !== ref.id) }
    return log(next, clock, `${heroDisplayName(ref.sheet)}: ${text}`, { details: adjustments })
  }
  const villain = findVillain(game, ref.id)
  if (!villain) return game
  const { play, adjustments } = reconcileVillain(villain.play, ref.sheet, villain.sheet)
  const text = `The sheet was updated ${why}.`
  const entry: PlayHistoryEntry = { id: clock.newId(), at, text, ...(adjustments.length ? { details: adjustments } : {}) }
  const updated = { ...villain, sheet: structuredClone(ref.sheet), play: { ...play, history: [...play.history, entry] } }
  return log({ ...game, villains: game.villains.map((v) => (v.id === ref.id ? updated : v)) }, clock, `${villainDisplayName(ref.sheet)}: ${text}`, { details: adjustments, gmOnly: villain.hidden })
}

/**
 * A hero's play state with this game's scene zone, which raises their zone (p. 14; heroes only,
 * ruling 64). A solo game has no tracker: the Play page's own scene control sets it.
 */
export function heroPlayInScene(game: Pick<Game, 'scene' | 'solo'>, play: PlayState): PlayState {
  if (game.solo) return play
  const zone = sceneZone(game)
  const { sceneZone: _, ...rest } = play
  return zone === 'green' ? rest : { ...rest, sceneZone: zone }
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

// ---- Challenges ----

/** "1 of 3 done". */
export const stepsText = (challenge: Pick<Challenge, 'steps'>) => `${challenge.steps.filter(Boolean).length} of ${challenge.steps.length} done`

export function setChallengeStep(game: Game, challengeId: string, index: number, done: boolean, clock: Clock): Game {
  const challenge = game.challenges.find((c) => c.id === challengeId)
  if (!challenge || index < 0 || index >= challenge.steps.length || challenge.steps[index] === done) return game
  const steps = challenge.steps.map((s, i) => (i === index ? done : s))
  const next = { ...game, challenges: game.challenges.map((c) => (c.id === challengeId ? { ...c, steps } : c)) }
  return log(next, clock, `${challenge.name}: ${stepsText({ steps })}.`, { gmOnly: challenge.hidden })
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
    case 'hero':
      return changeHeroPlay(game, ref.id, (p) => clearDefenses(setReactionUsed(p, false, clock)), clock, false)
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
  if (game.round === 0 || !waiting(game).some((w) => sameActor(w, to))) return game
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
  if (!(game.round === 0 || roundOver(game)) || !game.turn.order.some((o) => sameActor(o, first))) return game
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
