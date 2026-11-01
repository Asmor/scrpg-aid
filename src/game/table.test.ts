import { describe, expect, it } from 'vitest'
import type { Clock } from '../play/state'
import { createGame, duplicateGame, gameDisplayName, type ActorRef, type Game } from './model'
import {
  addChallenge,
  addGroup,
  addLocalHero,
  addMemberMod,
  addVillain,
  advanceTracker,
  boxLabel,
  groupSummary,
  handOff,
  isHidden,
  recordMemberRoll,
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
  trackerCounts,
  turnStrip,
  waiting,
  withLog,
} from './table'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-01T12:00:00Z'), newId: () => `id${++n}` }
}

const names = (ref: ActorRef) => ({ h1: 'Maya Reyes', v1: 'Gravelord', v2: 'Rust Hound' })[ref.id] ?? `?${ref.id}`
const texts = (game: Game) => game.feed.map((e) => e.text)
const last = (game: Game) => game.feed.at(-1)!

/** A game with a hero (id h1), a revealed villain (v1), a revealed group and a revealed environment. */
function table(c = clock()) {
  let game = createGame({ id: 'g', now: c.now })
  game = { ...game, heroes: [{ id: 'h1', source: { kind: 'local', heroId: 'hero-a' } }] }
  game = addVillain(game, 'v1', 'Gravelord', c, false)
  game = addGroup(game, { kind: 'minions', name: 'Scrap drones', die: 'd6', count: 3, hidden: false }, c)
  game = setEnvironment(game, { name: 'Collapsing Foundry', hidden: false }, c)
  const groupId = game.groups[0]!.id
  const envId = game.environment!.id
  return { game: { ...game, feed: [] }, c, groupId, envId }
}

describe('a new game', () => {
  it('starts with 3 green, 3 yellow and 2 red boxes at the first box, before round 1', () => {
    const game = createGame()
    expect(game.scene.tracker).toEqual(['green', 'green', 'green', 'yellow', 'yellow', 'yellow', 'red', 'red'])
    expect(game.scene.position).toBe(0)
    expect(game.round).toBe(0)
    expect(gameDisplayName(game)).toBe('Unnamed game')
  })

  it('duplicates with no play state, keeping what is on the table', () => {
    const { game } = table()
    const started = startRound(game, { kind: 'hero', id: 'h1' }, names, clock()).game
    const copy = duplicateGame({ ...started, name: 'Thursday', tags: ['campaign'] }, { id: 'copy' })
    expect(copy).toMatchObject({ id: 'copy', name: 'Thursday (copy)', tags: ['campaign'], round: 0, feed: [] })
    expect(copy.turn.acted).toEqual([])
    expect(copy.turn.current).toBeUndefined()
    expect(copy.villains).toEqual(started.villains)
  })
})

describe('the scene tracker', () => {
  it('names boxes by zone and counts them', () => {
    const tracker = createGame().scene.tracker
    expect(boxLabel(tracker, 0)).toBe('Green 1')
    expect(boxLabel(tracker, 3)).toBe('Yellow 1')
    expect(boxLabel(tracker, 7)).toBe('Red 2')
    expect(trackerCounts(tracker)).toEqual({ green: 3, yellow: 3, red: 2 })
  })

  it('gives the scene zone from the current box', () => {
    const c = clock()
    let game = createGame()
    expect(sceneZone(game)).toBe('green')
    game = setTrackerPosition(game, 4, c)
    expect(sceneZone(game)).toBe('yellow')
    expect(last(game).text).toBe('The GM moved the scene tracker to Yellow 2.')
  })

  it('advances one box, and says when it has run out', () => {
    const c = clock()
    let game = setTrackerPosition(createGame(), 2, c)
    game = advanceTracker(game, c)
    expect(game.scene.position).toBe(3)
    expect(last(game).text).toBe('The scene tracker moved to Yellow 1.')
    game = advanceTracker(setTrackerPosition(game, 7, c), c)
    expect(game.scene.position).toBe(7)
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
    expect(game.scene).toEqual({ name: 'The Foundry', tracker: ['green', 'green', 'yellow', 'red'], position: 3 })
    expect(texts(game)).toContain('The scene is now The Foundry.')
    game = setupScene(game, { name: 'The Foundry', counts: { green: 2, yellow: 1, red: 1 }, reset: true }, c)
    expect(game.scene.position).toBe(0)
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
    let game = addVillain(createGame(), 'v2', 'Rust Hound', c)
    expect(isHidden(game, { kind: 'villain', id: 'v2' })).toBe(true)
    expect(last(game)).toMatchObject({ text: 'The GM brought in Rust Hound, hidden from players.', gmOnly: true })
    expect(game.turn.order).toEqual([])
    game = setHidden(game, { kind: 'villain', id: 'v2' }, false, names, c)
    expect(last(game).text).toBe('The GM revealed Rust Hound.')
    expect(last(game).gmOnly).toBeUndefined()
    expect(game.turn.order).toEqual([{ kind: 'villain', id: 'v2' }])
  })

  it('keeps a hidden-again actor in the turn order', () => {
    const c = clock()
    let game = addVillain(createGame(), 'v2', 'Rust Hound', c, false)
    game = setHidden(game, { kind: 'villain', id: 'v2' }, true, names, c)
    expect(last(game)).toMatchObject({ text: 'The GM hid Rust Hound from players.', gmOnly: true })
    expect(game.turn.order).toEqual([{ kind: 'villain', id: 'v2' }])
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
    for (const r of refs) game = setHidden(game, r, false, names, c)
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

  it('a local hero joins it straight away, once', () => {
    const c = clock()
    let game = addLocalHero(createGame(), 'hero-a', 'Maya Reyes', c)
    expect(game.turn.order).toEqual([{ kind: 'hero', id: game.heroes[0]!.id }])
    expect(last(game).text).toBe('Maya Reyes joined the table.')
    expect(addLocalHero(game, 'hero-a', 'Maya Reyes', c)).toBe(game)
  })

  it('starts round 1 with whoever the GM picks', () => {
    const { game, c } = table()
    expect(handOff(game, { kind: 'villain', id: 'v1' }, names, c).game).toBe(game)
    const { game: started, started: who } = startRound(game, { kind: 'villain', id: 'v1' }, names, c)
    expect(started.round).toBe(1)
    expect(who).toEqual({ kind: 'villain', id: 'v1' })
    expect(last(started).text).toBe('Round 1 started. Gravelord goes first.')
  })

  it('hands off only to actors who have not acted, then ends the round', () => {
    const { game, c, groupId, envId } = table()
    let g = startRound(game, { kind: 'hero', id: 'h1' }, names, c).game
    const result = handOff(g, { kind: 'villain', id: 'v1' }, names, c)
    g = result.game
    expect(result.started).toEqual({ kind: 'villain', id: 'v1' })
    expect(last(g).text).toBe('Maya Reyes handed off to Gravelord.')
    // Maya has acted; Gravelord is acting.
    expect(handOff(g, { kind: 'hero', id: 'h1' }, names, c).game).toBe(g)
    expect(handOff(g, { kind: 'villain', id: 'v1' }, names, c).game).toBe(g)
    expect(waiting(g)).toEqual([
      { kind: 'group', id: groupId },
      { kind: 'environment', id: envId },
    ])
    g = handOff(g, { kind: 'group', id: groupId }, names, c).game
    expect(roundOver(g)).toBe(false)
    g = handOff(g, { kind: 'environment', id: envId }, names, c).game
    expect(roundOver(g)).toBe(true)
    // A new round can start with anyone, the current actor included.
    const next = startRound(g, { kind: 'environment', id: envId }, names, c).game
    expect(next.round).toBe(2)
    expect(next.turn.acted).toEqual([])
    expect(next.turn.current).toEqual({ kind: 'environment', id: envId })
  })

  it('refuses a new round while someone has yet to act', () => {
    const { game, c } = table()
    const g = startRound(game, { kind: 'hero', id: 'h1' }, names, c).game
    expect(startRound(g, { kind: 'villain', id: 'v1' }, names, c).game).toBe(g)
  })

  it('advances the scene tracker when the environment’s turn starts', () => {
    const { game, c, envId } = table()
    let g = startRound(game, { kind: 'hero', id: 'h1' }, names, c).game
    expect(g.scene.position).toBe(0)
    g = handOff(g, { kind: 'environment', id: envId }, names, c).game
    expect(g.scene.position).toBe(1)
    expect(texts(g).slice(-2)).toEqual(['Maya Reyes handed off to Collapsing Foundry.', 'The scene tracker moved to Green 2.'])
    // Starting a round with the environment advances it too.
    const fresh = table()
    const r = startRound(fresh.game, { kind: 'environment', id: fresh.envId }, names, fresh.c).game
    expect(r.scene.position).toBe(1)
  })

  it('shows acted actors in the order they acted, then the current one, then the rest', () => {
    const { game, c, groupId, envId } = table()
    let g = startRound(game, { kind: 'group', id: groupId }, names, c).game
    g = handOff(g, { kind: 'villain', id: 'v1' }, names, c).game
    expect(turnStrip(g)).toEqual([
      { ref: { kind: 'group', id: groupId }, state: 'acted' },
      { ref: { kind: 'villain', id: 'v1' }, state: 'current' },
      { ref: { kind: 'hero', id: 'h1' }, state: 'waiting' },
      { ref: { kind: 'environment', id: envId }, state: 'waiting' },
    ])
  })

  it('logs a handoff to a hidden actor for the GM only', () => {
    const { game, c } = table()
    let g = addVillain(game, 'v2', 'Rust Hound', c)
    g = setHidden(g, { kind: 'villain', id: 'v2' }, false, names, c)
    g = setHidden(g, { kind: 'villain', id: 'v2' }, true, names, c)
    g = startRound(g, { kind: 'hero', id: 'h1' }, names, c).game
    g = handOff(g, { kind: 'villain', id: 'v2' }, names, c).game
    expect(last(g)).toMatchObject({ text: 'Maya Reyes handed off to Rust Hound.', gmOnly: true })
  })

  it('removing an actor takes it out of the turn order, including when acting', () => {
    const { game, c } = table()
    let g = startRound(game, { kind: 'villain', id: 'v1' }, names, c).game
    g = removeFromTable(g, { kind: 'villain', id: 'v1' }, names, c)
    expect(g.turn.current).toBeUndefined()
    expect(g.turn.order.some((o) => o.kind === 'villain')).toBe(false)
    expect(last(g).text).toBe('Gravelord left the table.')
  })

  describe('the GM fixing mistakes', () => {
    it('sets who is acting, with no turn-start effects', () => {
      const { game, c, envId } = table()
      let g = startRound(game, { kind: 'hero', id: 'h1' }, names, c).game
      g = setCurrent(g, { kind: 'environment', id: envId }, names, c)
      expect(g.turn.current).toEqual({ kind: 'environment', id: envId })
      expect(g.scene.position).toBe(0)
      expect(last(g).text).toBe('The GM set Collapsing Foundry as acting now.')
    })

    it('marks an actor as acted or not', () => {
      const { game, c } = table()
      let g = startRound(game, { kind: 'hero', id: 'h1' }, names, c).game
      g = setActed(g, { kind: 'villain', id: 'v1' }, true, names, c)
      expect(g.turn.acted).toEqual([{ kind: 'villain', id: 'v1' }])
      g = setActed(g, { kind: 'villain', id: 'v1' }, false, names, c)
      expect(g.turn.acted).toEqual([])
      // Marking the current actor as acted means nobody is acting.
      g = setActed(g, { kind: 'hero', id: 'h1' }, true, names, c)
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

  it('gives members their own mods, used up by their rolls unless persistent', () => {
    const { game, c, groupId } = table()
    const memberId = game.groups[0]!.members[0]!.id
    let g = addMemberMod(game, groupId, memberId, { label: 'Dazed', value: -1 }, c)
    g = addMemberMod(g, groupId, memberId, { label: 'Swarm', value: 1, persistent: true }, c)
    const mods = g.groups[0]!.members[0]!.mods
    expect(mods.map((m) => m.label)).toEqual(['Dazed', 'Swarm'])
    g = recordMemberRoll(g, groupId, memberId, { action: 'attack', value: 4, mods }, c)
    expect(g.groups[0]!.members[0]!.mods.map((m) => m.label)).toEqual(['Swarm'])
    expect(g.feed.at(-2)).toMatchObject({ by: 'Scrap drones', text: 'Scrap drones 1 took Attack:' })
    expect(last(g).text).toBe('Scrap drones 1 used up Dazed.')
    g = removeMemberMod(g, groupId, memberId, g.groups[0]!.members[0]!.mods[0]!.id, c)
    expect(g.groups[0]!.members[0]!.mods).toEqual([])
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
    expect(stepsText(game.challenges[0]!)).toBe('1 of 3 done')
    expect(last(game).text).toBe('Shut down the crucible: 1 of 3 done.')
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
