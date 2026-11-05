import { describe, expect, it } from 'vitest'
import type { Hero } from '../hero/model'
import { addMod, emptyPlay, setHealth, setReactionUsed, type Clock } from '../play/state'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import type { Villain } from '../villain/model'
import { duplicateGame } from './scenes'
import { createGame, gameDisplayName, heroCopy, sceneOnTable, trackerFromCounts, villainCopy, type Game } from './model'
import { project, viewName } from './project'
import {
  addChallenge,
  addGroup,
  addHero,
  addMemberMod,
  addVillain,
  advanceTracker,
  dangerText,
  resolveDanger,
  undoDanger,
  boxLabel,
  changeHeroPlay,
  changeVillainPlay,
  copyOf,
  groupSummary,
  handOff,
  heroPlayInScene,
  isHidden,
  itemName,
  removeFromTable,
  removeMember,
  removeMemberMod,
  roundOver,
  sceneZone,
  setActed,
  setChallengeStep,
  setCurrent,
  setEnvironment,
  setHidden,
  setPlayersSee,
  setRound,
  setTrackerPosition,
  setupScene,
  shrinkMember,
  startRound,
  stepsText,
  syncTurnOrder,
  turnStrip,
  updateSheet,
  waiting,
  withLog,
} from './table'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-01T12:00:00Z'), newId: () => `id${++n}` }
}

/** Library documents: a hero, and two villains. */
function hero(): Hero {
  const h = { ...completeHero(), id: 'hero-a' }
  h.details = { ...h.details, name: 'Maya Reyes' }
  return h
}
function villain(id: string, name: string): Villain {
  const v = { ...adaptiveBruiser(), id }
  v.details = { ...v.details, name }
  return v
}
const gravelord = () => villain('lib-v1', 'Gravelord')
const rustHound = () => villain('lib-v2', 'Rust Hound')
const texts = (game: Game) => game.feed.map((e) => e.text)
const last = (game: Game) => game.feed.at(-1)!

/** A game with a hero's copy (id h1), a revealed villain's copy (v1), a revealed group and a revealed environment. */
function table(c = clock()) {
  let game = createGame({ id: 'g', now: c.now })
  game = syncTurnOrder({ ...game, heroes: [heroCopy(hero(), 'h1')], villains: [villainCopy(gravelord(), 'v1', false)] })
  game = addGroup(game, { kind: 'minions', name: 'Scrap drones', die: 'd6', count: 3, hidden: false }, c)
  game = setEnvironment(game, { name: 'Collapsing Foundry', hidden: false }, c)
  const groupId = game.groups[0]!.id
  const envId = game.environment!.id
  return { game: { ...game, feed: [] }, c, groupId, envId }
}

describe('a new game', () => {
  it('starts with one current scene on the Standard tracker (2 / 4 / 2), at the first box, before round 1', () => {
    const game = createGame()
    expect(sceneOnTable(game).tracker).toEqual(['green', 'green', 'yellow', 'yellow', 'yellow', 'yellow', 'red', 'red'])
    expect(sceneOnTable(game)).toMatchObject({ position: 0, number: 1, total: 1 })
    expect(game.scenes.map((s) => s.state)).toEqual(['now'])
    expect(game.round).toBe(0)
    expect(gameDisplayName(game)).toBe('Unnamed game')
  })

  it('duplicates as a fresh setup: no players, fresh play state, keeping what is on the table', () => {
    const { game, c } = table()
    let started = startRound(game, { kind: 'hero', id: 'h1' }, c)
    started = changeVillainPlay(started, 'v1', (p) => setHealth(p, { maxHealth: 55 }, 20, c), c)
    started = { ...started, heroes: [...started.heroes, { ...heroCopy({ ...hero(), id: 'hero-b' }, 'h2'), player: { clientId: 'p1', name: 'Alex' } }] }
    started = syncTurnOrder(started)
    const copy = duplicateGame({ ...started, name: 'Thursday', tags: ['campaign'] }, { id: 'copy' })
    expect(copy).toMatchObject({ id: 'copy', name: 'Thursday (copy)', tags: ['campaign'], round: 0, feed: [], pendingSyncs: [] })
    expect(copy.turn.acted).toEqual([])
    expect(copy.turn.current).toBeUndefined()
    // The player's hero leaves; the GM's own stays.
    expect(copy.heroes.map((h) => h.id)).toEqual(['h1'])
    expect(copy.turn.order.some((o) => o.id === 'h2')).toBe(false)
    expect(copy.villains.map((v) => v.id)).toEqual(['v1'])
    expect(copy.villains[0]!.play).toEqual({ reactionUsed: false, mods: [], twists: [], history: [] })
    expect(copy.villains[0]!.sheet).toEqual(started.villains[0]!.sheet)
  })

  it('names the copy of an unnamed game "Unnamed game (copy)", and gives it no code of its own yet', () => {
    expect(duplicateGame(createGame(), { id: 'copy' }).name).toBe('Unnamed game (copy)')
    expect(duplicateGame({ ...createGame(), code: 'ABCD-EFGH' }, { id: 'copy' })).not.toHaveProperty('code')
  })

  it('tells two heroes with the same name apart by their players', () => {
    const c = clock()
    let g = addHero(createGame(), hero(), c)
    g = addHero(g, { ...hero(), id: 'hero-b' }, c, { clientId: 'p1', name: 'Alex' })
    expect(g.heroes.map((h) => itemName(g, { kind: 'hero', id: h.id }))).toEqual(["Maya Reyes · GM's hero", 'Maya Reyes · Alex'])
    const view = project(g, 'player')
    const name = (h: (typeof view.heroes)[number]) => h.sheet.details.name
    expect(view.heroes.map((h) => viewName(view, { kind: 'hero', id: h.id }, name))).toEqual(["Maya Reyes · GM's hero", 'Maya Reyes · Alex'])
    // Different names stay as they are.
    const one = addHero(createGame(), hero(), c)
    expect(itemName(one, { kind: 'hero', id: one.heroes[0]!.id })).toBe('Maya Reyes')
  })
})

describe('the scene tracker', () => {
  it('names boxes by zone and counts them', () => {
    const { tracker } = sceneOnTable(createGame())
    expect(boxLabel(tracker, 0)).toBe('Green 1')
    expect(boxLabel(tracker, 2)).toBe('Yellow 1')
    expect(boxLabel(tracker, 7)).toBe('Red 2')
  })

  it('gives the scene zone from the current box', () => {
    const c = clock()
    let game = createGame()
    expect(sceneZone({ scene: sceneOnTable(game) })).toBe('green')
    game = setTrackerPosition(game, 3, c)
    expect(sceneZone({ scene: sceneOnTable(game) })).toBe('yellow')
    expect(last(game).text).toBe('The GM moved the scene tracker to Yellow 2.')
  })

  it('advances one box, and says when it has run out', () => {
    const c = clock()
    let game = setTrackerPosition(createGame(), 1, c)
    game = advanceTracker(game, c)
    expect(sceneOnTable(game).position).toBe(2)
    expect(last(game).text).toBe('The scene tracker moved to Yellow 1.')
    game = advanceTracker(setTrackerPosition(game, 7, c), c)
    expect(sceneOnTable(game).position).toBe(7)
    expect(last(game).text).toBe('The scene tracker has run out.')
  })

  it('ignores a position off the tracker', () => {
    const game = createGame()
    expect(setTrackerPosition(game, 8, clock())).toBe(game)
    expect(setTrackerPosition(game, -1, clock())).toBe(game)
  })

  it('sets up the scene: name, box counts and reset', () => {
    const c = clock()
    let game = setTrackerPosition(createGame(), 6, c)
    game = setupScene(game, { name: ' The Foundry ', counts: { green: 2, yellow: 1, red: 1 }, reset: false }, c)
    expect(sceneOnTable(game)).toMatchObject({ name: 'The Foundry', tracker: ['green', 'green', 'yellow', 'red'], position: 3 })
    expect(texts(game)).toContain('The scene is now The Foundry.')
    game = setupScene(game, { name: 'The Foundry', counts: { green: 2, yellow: 1, red: 1 }, reset: true }, c)
    expect(sceneOnTable(game).position).toBe(0)
    expect(last(game).text).toBe('The scene tracker is at Green 1.')
  })

  it('refuses box counts out of range or with no boxes', () => {
    const game = createGame()
    expect(setupScene(game, { name: '', counts: { green: 0, yellow: 0, red: 0 }, reset: false }, clock())).toBe(game)
    expect(setupScene(game, { name: '', counts: { green: 11, yellow: 0, red: 0 }, reset: false }, clock())).toBe(game)
  })
})

describe('hidden items', () => {
  it('start hidden, are logged for the GM only, and enter the turn order when revealed', () => {
    const c = clock()
    let game = addVillain(createGame(), rustHound(), c)
    const v2 = game.villains[0]!.id
    expect(isHidden(game, { kind: 'villain', id: v2 })).toBe(true)
    expect(last(game)).toMatchObject({ text: 'The GM brought in Rust Hound, hidden from players.', gmOnly: true })
    expect(game.turn.order).toEqual([])
    game = setHidden(game, { kind: 'villain', id: v2 }, false, c)
    expect(last(game).text).toBe('The GM revealed Rust Hound.')
    expect(last(game).gmOnly).toBeUndefined()
    expect(game.turn.order).toEqual([{ kind: 'villain', id: v2 }])
  })

  it('keeps a hidden-again actor in the turn order', () => {
    const c = clock()
    let game = addVillain(createGame(), rustHound(), c, false)
    const v2 = game.villains[0]!.id
    game = setHidden(game, { kind: 'villain', id: v2 }, true, c)
    expect(last(game)).toMatchObject({ text: 'The GM hid Rust Hound from players.', gmOnly: true })
    expect(game.turn.order).toEqual([{ kind: 'villain', id: v2 }])
  })

  it('hides and reveals groups, challenges and the environment', () => {
    const c = clock()
    let game = addGroup(createGame(), { kind: 'lieutenants', name: 'Static Choir', die: 'd10', count: 2, hidden: true }, c)
    game = addChallenge(game, { name: 'Shut down the crucible', steps: 3, hidden: true }, c)
    game = setEnvironment(game, { name: 'Foundry', hidden: true }, c)
    const refs = [
      { kind: 'group' as const, id: game.groups[0]!.id },
      { kind: 'challenge' as const, id: game.challenges[0]!.id },
      { kind: 'environment' as const, id: game.environment!.id },
    ]
    expect(refs.every((r) => isHidden(game, r))).toBe(true)
    for (const r of refs) game = setHidden(game, r, false, c)
    expect(refs.some((r) => isHidden(game, r))).toBe(false)
    // The challenge isn't an actor.
    expect(game.turn.order.map((o) => o.kind)).toEqual(['group', 'environment'])
  })

  it('sets what players see of a villain', () => {
    const { game } = table()
    expect(game.villains[0]!.playersSee).toBe('status')
    expect(setPlayersSee(game, 'v1', 'name').villains[0]!.playersSee).toBe('name')
    expect(setPlayersSee(game, 'nope', 'name')).toBe(game)
  })
})

describe('the turn order', () => {
  it('has one entry per hero, villain, group and the environment, in a fixed order', () => {
    const { game } = table()
    expect(game.turn.order.map((o) => o.kind)).toEqual(['hero', 'villain', 'group', 'environment'])
  })

  it('a GM’s own hero is copied in and joins it straight away, once', () => {
    const c = clock()
    const maya = hero()
    let game = addHero(createGame(), maya, c)
    const copy = game.heroes[0]!
    expect(copy).toMatchObject({ sourceId: 'hero-a', play: emptyPlay() })
    expect(copy.player).toBeUndefined()
    expect(copy.sheet).toEqual(maya)
    expect(copy.sheet).not.toBe(maya)
    expect(game.turn.order).toEqual([{ kind: 'hero', id: copy.id }])
    expect(last(game).text).toBe('Maya Reyes joined the table.')
    expect(addHero(game, hero(), c)).toBe(game)
    expect(copyOf(game, 'hero', 'hero-a')).toBe(copy)
  })

  it('starts round 1 with whoever the GM picks', () => {
    const { game, c } = table()
    expect(handOff(game, { kind: 'villain', id: 'v1' }, c)).toBe(game)
    const started = startRound(game, { kind: 'villain', id: 'v1' }, c)
    expect(started.round).toBe(1)
    expect(started.turn.current).toEqual({ kind: 'villain', id: 'v1' })
    expect(last(started).text).toBe('Round 1 started. Gravelord goes first.')
  })

  it('hands off only to actors who have not acted, then ends the round', () => {
    const { game, c, groupId, envId } = table()
    let g = startRound(game, { kind: 'hero', id: 'h1' }, c)
    g = handOff(g, { kind: 'villain', id: 'v1' }, c)
    expect(g.turn.current).toEqual({ kind: 'villain', id: 'v1' })
    expect(last(g).text).toBe('Maya Reyes handed off to Gravelord.')
    // Maya has acted; Gravelord is acting.
    expect(handOff(g, { kind: 'hero', id: 'h1' }, c)).toBe(g)
    expect(handOff(g, { kind: 'villain', id: 'v1' }, c)).toBe(g)
    expect(waiting(g)).toEqual([
      { kind: 'group', id: groupId },
      { kind: 'environment', id: envId },
    ])
    g = handOff(g, { kind: 'group', id: groupId }, c)
    expect(roundOver(g)).toBe(false)
    g = handOff(g, { kind: 'environment', id: envId }, c)
    expect(roundOver(g)).toBe(true)
    // A new round can start with anyone, the current actor included.
    const next = startRound(g, { kind: 'environment', id: envId }, c)
    expect(next.round).toBe(2)
    expect(next.turn.acted).toEqual([])
    expect(next.turn.current).toEqual({ kind: 'environment', id: envId })
  })

  it('refuses a new round while someone has yet to act', () => {
    const { game, c } = table()
    const g = startRound(game, { kind: 'hero', id: 'h1' }, c)
    expect(startRound(g, { kind: 'villain', id: 'v1' }, c)).toBe(g)
  })

  it('advances the scene tracker when the environment’s turn starts', () => {
    const { game, c, envId } = table()
    let g = startRound(game, { kind: 'hero', id: 'h1' }, c)
    expect(sceneOnTable(g).position).toBe(0)
    g = handOff(g, { kind: 'environment', id: envId }, c)
    expect(sceneOnTable(g).position).toBe(1)
    expect(texts(g).slice(-2)).toEqual(['Maya Reyes handed off to Collapsing Foundry.', 'The scene tracker moved to Green 2.'])
    // Starting a round with the environment advances it too.
    const fresh = table()
    const r = startRound(fresh.game, { kind: 'environment', id: fresh.envId }, fresh.c)
    expect(sceneOnTable(r).position).toBe(1)
  })

  it('shows acted actors in the order they acted, then the current one, then the rest', () => {
    const { game, c, groupId, envId } = table()
    let g = startRound(game, { kind: 'group', id: groupId }, c)
    g = handOff(g, { kind: 'villain', id: 'v1' }, c)
    expect(turnStrip(g)).toEqual([
      { ref: { kind: 'group', id: groupId }, state: 'acted' },
      { ref: { kind: 'villain', id: 'v1' }, state: 'current' },
      { ref: { kind: 'hero', id: 'h1' }, state: 'waiting' },
      { ref: { kind: 'environment', id: envId }, state: 'waiting' },
    ])
  })

  it('logs a handoff to a hidden actor for the GM only', () => {
    const { game, c } = table()
    let g = addVillain(game, rustHound(), c)
    const v2 = g.villains.at(-1)!.id
    g = setHidden(g, { kind: 'villain', id: v2 }, false, c)
    g = setHidden(g, { kind: 'villain', id: v2 }, true, c)
    g = startRound(g, { kind: 'hero', id: 'h1' }, c)
    g = handOff(g, { kind: 'villain', id: v2 }, c)
    expect(last(g)).toMatchObject({ text: 'Maya Reyes handed off to Rust Hound.', gmOnly: true })
  })

  it('removing an actor takes it out of the turn order, including when acting', () => {
    const { game, c } = table()
    let g = startRound(game, { kind: 'villain', id: 'v1' }, c)
    g = removeFromTable(g, { kind: 'villain', id: 'v1' }, c)
    expect(g.turn.current).toBeUndefined()
    expect(g.turn.order.some((o) => o.kind === 'villain')).toBe(false)
    expect(last(g).text).toBe('Gravelord left the table.')
  })

  it('clears only the starting actor’s reaction when its turn starts, in its play state', () => {
    const { game, c } = table()
    let g = changeHeroPlay(game, 'h1', (p) => setReactionUsed(p, true, c), c, false)
    g = changeVillainPlay(g, 'v1', (p) => setReactionUsed(p, true, c), c, false)
    g = startRound(g, { kind: 'villain', id: 'v1' }, c)
    expect(g.villains[0]!.play.reactionUsed).toBe(false)
    expect(g.villains[0]!.play.history.at(-1)!.text).toBe('Reaction ready again.')
    // Round start isn't a turn start for anyone else.
    expect(g.heroes[0]!.play.reactionUsed).toBe(true)
    g = handOff(g, { kind: 'hero', id: 'h1' }, c)
    expect(g.heroes[0]!.play.reactionUsed).toBe(false)
    // Not logged to the table: it's the table's own doing.
    expect(texts(g)).not.toContain('Reaction ready again.')
  })

  describe('the GM fixing mistakes', () => {
    it('sets who is acting, with no turn-start effects', () => {
      const { game, c, envId } = table()
      let g = startRound(game, { kind: 'hero', id: 'h1' }, c)
      g = setCurrent(g, { kind: 'environment', id: envId }, c)
      expect(g.turn.current).toEqual({ kind: 'environment', id: envId })
      expect(sceneOnTable(g).position).toBe(0)
      expect(last(g).text).toBe('The GM set Collapsing Foundry as acting now.')
    })

    it('marks an actor as acted or not', () => {
      const { game, c } = table()
      let g = startRound(game, { kind: 'hero', id: 'h1' }, c)
      g = setActed(g, { kind: 'villain', id: 'v1' }, true, c)
      expect(g.turn.acted).toEqual([{ kind: 'villain', id: 'v1' }])
      g = setActed(g, { kind: 'villain', id: 'v1' }, false, c)
      expect(g.turn.acted).toEqual([])
      // Marking the current actor as acted means nobody is acting.
      g = setActed(g, { kind: 'hero', id: 'h1' }, true, c)
      expect(g.turn.current).toBeUndefined()
    })

    it('sets the round number', () => {
      const { game, c } = table()
      const g = setRound(game, 3, c)
      expect(g.round).toBe(3)
      expect(last(g).text).toBe('The GM set the round to 3.')
      expect(setRound(g, -1, c)).toBe(g)
    })
  })
})

describe('heroes and villains in play', () => {
  it('changes a hero’s copy and logs its new history under the hero’s name, without "GM: "', () => {
    const { game, c } = table()
    const g = changeHeroPlay(game, 'h1', (p) => ({ ...setHealth(p, { maxHealth: 30 }, 26, c), history: [...p.history, { id: 'x', at: c.now.toISOString(), text: 'GM: Lost 4 HP (30 → 26).' }] }), c)
    expect(g.heroes[0]!.play.health).toBe(26)
    expect(last(g)).toMatchObject({ by: 'Maya Reyes', text: 'Lost 4 HP (30 → 26).' })
    expect(changeHeroPlay(game, 'nope', (p) => p, c)).toBe(game)
    expect(changeHeroPlay(game, 'h1', (p) => p, c)).toBe(game)
  })

  it('keeps a hidden villain’s changes out of what players see in the log', () => {
    const c = clock()
    let g = addVillain(createGame(), rustHound(), c)
    const id = g.villains[0]!.id
    g = changeVillainPlay(g, id, (p) => addMod(p, { label: 'cornered', value: -1 }, c), c)
    expect(last(g)).toMatchObject({ by: 'Rust Hound', gmOnly: true })
    expect(g.villains[0]!.play.mods).toHaveLength(1)
  })

  it('gives the same villain separate state in two games', () => {
    const c = clock()
    let one = addVillain(createGame({ id: 'one' }), gravelord(), c, false)
    const two = addVillain(createGame({ id: 'two' }), gravelord(), c, false)
    one = changeVillainPlay(one, one.villains[0]!.id, (p) => setHealth(p, { maxHealth: 55 }, 10, c), c)
    expect(one.villains[0]!.play.health).toBe(10)
    expect(two.villains[0]!.play.health).toBeUndefined()
  })

  it('names actors from the game’s copies', () => {
    const { game } = table()
    expect(itemName(game, { kind: 'hero', id: 'h1' })).toBe('Maya Reyes')
    expect(itemName(game, { kind: 'villain', id: 'v1' })).toBe('Gravelord')
    expect(itemName(game, { kind: 'villain', id: 'gone' })).toBe('A villain')
  })

  it('gives heroes the tracker’s zone as their scene zone, except in a solo game', () => {
    const c = clock()
    const { game } = table()
    const yellow = setTrackerPosition(game, 3, c)
    expect(heroPlayInScene({ scene: sceneOnTable(yellow) }, emptyPlay()).sceneZone).toBe('yellow')
    expect(heroPlayInScene({ scene: sceneOnTable(game) }, { ...emptyPlay(), sceneZone: 'red' }).sceneZone).toBeUndefined()
    const solo = { scene: sceneOnTable(yellow), solo: { kind: 'hero' as const, sourceId: 'hero-a' } }
    expect(heroPlayInScene(solo, { ...emptyPlay(), sceneZone: 'red' }).sceneZone).toBe('red')
  })

  it('updates a villain’s copy from the library, keeping play state subject to the adjustments, and logs it', () => {
    const { game, c } = table()
    let g = changeVillainPlay(game, 'v1', (p) => addMod(setHealth(p, { maxHealth: 55 }, 50, c), { label: 'cornered', value: -1 }, c), c)
    const newer = gravelord()
    newer.archetype = { ...newer.archetype!, id: 'bruiser' }
    newer.heroCount = 2 // 45 max Health now
    g = updateSheet(g, { kind: 'villain', id: 'v1', sheet: newer }, c)
    const copy = g.villains[0]!
    expect(copy.sheet).toEqual(newer)
    expect(copy.play.health).toBe(45)
    expect(copy.play.mods).toHaveLength(1)
    expect(copy.play.history.at(-1)).toMatchObject({ text: 'The sheet was updated from the library.', details: ['Health lowered to 45, the new max.'] })
    expect(last(g)).toMatchObject({ text: 'Gravelord: The sheet was updated from the library.', details: ['Health lowered to 45, the new max.'] })
    expect(updateSheet(g, { kind: 'villain', id: 'gone', sheet: newer }, c)).toBe(g)
  })

  it('updates a hero’s copy and clears its sync request', () => {
    const { game, c } = table()
    const newer = hero()
    newer.details = { ...newer.details, name: 'Maya R.' }
    let g: Game = { ...game, pendingSyncs: [{ heroId: 'h1', sheet: newer, at: c.now.toISOString() }] }
    g = updateSheet(g, { kind: 'hero', id: 'h1', sheet: newer }, c, 'to match the player’s sheet')
    expect(g.heroes[0]!.sheet.details.name).toBe('Maya R.')
    expect(g.pendingSyncs).toEqual([])
    expect(last(g).text).toBe('Maya R.: The sheet was updated to match the player’s sheet.')
  })

  it('removing a hero drops its sync request too', () => {
    const { game, c } = table()
    const g = removeFromTable({ ...game, pendingSyncs: [{ heroId: 'h1', sheet: hero(), at: c.now.toISOString() }] }, { kind: 'hero', id: 'h1' }, c)
    expect(g.heroes).toEqual([])
    expect(g.pendingSyncs).toEqual([])
    expect(last(g).text).toBe('Maya Reyes left the table.')
  })
})

describe('groups', () => {
  it('summarizes dice largest first', () => {
    const { game, c, groupId } = table()
    const member = game.groups[0]!.members[2]!.id
    const g = shrinkMember(game, groupId, member, c)
    expect(groupSummary(g.groups[0]!)).toEqual([
      { die: 'd6', count: 2 },
      { die: 'd4', count: 1 },
    ])
    expect(last(g).text).toBe('Scrap drones 3 shrank to d4.')
  })

  it('removes a d4 member when it shrinks, and the group with its last member', () => {
    const c = clock()
    let game = addGroup(createGame(), { kind: 'minions', name: 'Rats', die: 'd4', count: 1, hidden: false }, c)
    const groupId = game.groups[0]!.id
    expect(game.turn.order).toEqual([{ kind: 'group', id: groupId }])
    game = shrinkMember(game, groupId, game.groups[0]!.members[0]!.id, c)
    expect(game.groups).toEqual([])
    expect(game.turn.order).toEqual([])
    expect(texts(game).slice(-2)).toEqual(['Rats 1 shrank away and is gone.', 'All of Rats are gone; the group left the table.'])
  })

  it('keeps member numbers when one is removed', () => {
    const { game, c, groupId } = table()
    const g = removeMember(game, groupId, game.groups[0]!.members[0]!.id, c)
    expect(g.groups[0]!.members.map((m) => m.n)).toEqual([2, 3])
  })

  it('gives members their own mods, and removes them', () => {
    const { game, c, groupId } = table()
    const memberId = game.groups[0]!.members[0]!.id
    let g = addMemberMod(game, groupId, memberId, { label: 'Dazed', value: -1 }, c)
    g = addMemberMod(g, groupId, memberId, { label: 'Swarm', value: 1, persistent: true }, c)
    const mods = g.groups[0]!.members[0]!.mods
    expect(mods.map((m) => m.label)).toEqual(['Dazed', 'Swarm'])
    g = removeMemberMod(g, groupId, memberId, mods[0]!.id, c)
    expect(g.groups[0]!.members[0]!.mods.map((m) => m.label)).toEqual(['Swarm'])
    expect(last(g).text).toBe("Scrap drones 1: removed '-1 Dazed' penalty.")
  })

  it('refuses a group size out of range', () => {
    const game = createGame()
    expect(addGroup(game, { kind: 'minions', name: 'x', die: 'd6', count: 0, hidden: true }, clock())).toBe(game)
    expect(addGroup(game, { kind: 'minions', name: 'x', die: 'd6', count: 21, hidden: true }, clock())).toBe(game)
  })
})

describe('challenges', () => {
  it('checks steps and counts them', () => {
    const c = clock()
    let game = addChallenge(createGame(), { name: 'Shut down the crucible', steps: 3, hidden: false }, c)
    const id = game.challenges[0]!.id
    game = setChallengeStep(game, id, 0, true, c)
    expect(stepsText(game.challenges[0]!)).toBe('1 of 3')
    expect(last(game).text).toBe('The GM checked off "Step 1".')
    expect(setChallengeStep(game, id, 5, true, c)).toBe(game)
  })
})

describe('the environment', () => {
  it('is replaced by a new one', () => {
    const { game, c, envId } = table()
    const g = setEnvironment(game, { name: 'Flooded Tunnels', hidden: true }, c)
    expect(g.environment!.name).toBe('Flooded Tunnels')
    expect(g.turn.order.some((o) => o.id === envId)).toBe(false)
  })
})

describe('the log', () => {
  it('keeps the newest 200 lines', () => {
    const c = clock()
    const many = Array.from({ length: 205 }, (_, i) => ({ id: `e${i}`, at: c.now.toISOString(), by: 'GM', text: `${i}` }))
    const game = withLog(createGame(), many)
    expect(game.feed).toHaveLength(200)
    expect(game.feed[0]!.text).toBe('5')
  })
})

describe('making the scene more dangerous', () => {
  const start = (hidden = false) => {
    const c = clock()
    const game = addVillain(createGame(), { ...adaptiveBruiser(), id: 'v', details: { ...adaptiveBruiser().details, name: 'Gravelord' } }, c, hidden)
    return { c, game, id: game.villains[0]!.id }
  }
  const box = (g: Game) => g.scenes[0]!.position

  it('a success advances one box with a public line, once', () => {
    const { c, game, id } = start()
    const g = resolveDanger(game, id, true, c)
    expect(box(g)).toBe(1)
    expect(g.villains[0]!.dangerUsed).toEqual({ box: 1 })
    expect(last(g)).toMatchObject({ text: 'Gravelord made the scene more dangerous. The scene tracker moved to Green 2.' })
    expect(last(g).gmOnly).toBeUndefined()
    expect(resolveDanger(g, id, true, c)).toBe(g)
    expect(dangerText(g.villains[0]!.dangerUsed!, trackerFromCounts(g.scenes[0]!.tracker))).toBe('Used this scene. The tracker moved to Green 2.')
  })

  it('a failure spends it and moves nothing', () => {
    const { c, game, id } = start()
    const g = resolveDanger(game, id, false, c)
    expect(box(g)).toBe(0)
    expect(g.feed).toEqual(game.feed)
    expect(dangerText(g.villains[0]!.dangerUsed!, [])).toBe('Used this scene. The roll failed.')
    expect(undoDanger(g, id, c).villains[0]!.dangerUsed).toBeUndefined()
    expect(box(undoDanger(g, id, c))).toBe(0)
  })

  it("a hidden villain isn't named to players, though the tracker moves for all", () => {
    const { c, game, id } = start(true)
    const g = resolveDanger(game, id, true, c)
    const lines = g.feed.slice(game.feed.length)
    expect(lines.map((e) => [e.text, Boolean(e.gmOnly)])).toEqual([
      ['The scene tracker moved to Green 2.', false],
      ['Gravelord made the scene more dangerous.', true],
    ])
    expect(last(undoDanger(g, id, c))).toMatchObject({ text: 'The scene tracker moved back to Green 1.' })
  })

  it('on the last box the use is spent and the log says the tracker has run out', () => {
    const { c, game, id } = start()
    const end = setTrackerPosition(game, trackerFromCounts(game.scenes[0]!.tracker).length - 1, c)
    const g = resolveDanger(end, id, true, c)
    expect(box(g)).toBe(box(end))
    expect(g.villains[0]!.dangerUsed).toEqual({})
    expect(dangerText({}, [])).toBe('Used this scene. The tracker had no boxes left.')
    expect(box(undoDanger(g, id, c))).toBe(box(end))
  })

  it('undo moves the tracker back and restores the use', () => {
    const { c, game, id } = start()
    const g = undoDanger(resolveDanger(game, id, true, c), id, c)
    expect(box(g)).toBe(0)
    expect(g.villains[0]!.dangerUsed).toBeUndefined()
    expect(last(g).text).toBe("Undid: Gravelord advanced the tracker. It's back at Green 1.")
    expect(undoDanger(game, id, c)).toBe(game)
  })
})
