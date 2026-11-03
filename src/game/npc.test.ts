import { describe, expect, it } from 'vitest'
import type { Clock } from '../play/state'
import { createGame, type Game, type NpcGroup } from './model'
import { project } from './project'
import { tableViewProblem } from '../session/protocol'
import { parseSavedGame, gameToSaved } from './serialize'
import { actedText, addGroup, handOff, readyMembers, setEnvironment, setMemberActed, startRound, syncTurnOrder } from './table'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-03T12:00:00Z'), newId: () => `id${++n}` }
}

const markAll = (game: Game, groupId: string, c: Clock) => game.groups.find((g) => g.id === groupId)!.members.reduce((g, m) => setMemberActed(g, groupId, m.id, true, c), game)

/** Burglars (GM, 3 members), Rooftop drones (the environment's, 2 members), and the environment. */
function table() {
  const c = clock()
  let game = addGroup(createGame({ id: 'g' }), { kind: 'minions', name: 'Burglars', die: 'd6', count: 3, hidden: false }, c)
  game = addGroup(game, { kind: 'minions', name: 'Rooftop drones', die: 'd4', count: 2, hidden: false }, c)
  game = setEnvironment(game, { name: 'Rooftop Heist', hidden: false }, c)
  const [burglars, drones] = game.groups as [NpcGroup, NpcGroup]
  // Environment groups come from the environment's turn (NPCs phase 3); made here by hand.
  game = syncTurnOrder({ ...game, groups: game.groups.map((g) => (g.id === drones.id ? { ...g, owner: { kind: 'environment' as const } } : g)) })
  return { game, c, burglars: burglars.id, drones: drones.id, env: game.environment!.id }
}

describe('groups on the table', () => {
  it('start with the GM running them, any action allowed, and everyone ready', () => {
    const { game, burglars } = table()
    const g = game.groups.find((x) => x.id === burglars)!
    expect(g.owner).toEqual({ kind: 'gm' })
    expect(g.actions).toBe('any')
    expect(actedText(g)).toBe('0 of 3 acted')
    expect(readyMembers(g)).toHaveLength(3)
  })

  it("gives only the GM's groups a turn-order entry", () => {
    const { game, burglars, env } = table()
    expect(game.turn.order).toEqual([
      { kind: 'group', id: burglars },
      { kind: 'environment', id: env },
    ])
  })

  it('marks a member acted or not, logging it', () => {
    const { game, c, burglars } = table()
    const id = game.groups[0]!.members[1]!.id
    let g = setMemberActed(game, burglars, id, true, c)
    expect(actedText(g.groups[0]!)).toBe('1 of 3 acted')
    expect(g.feed.at(-1)!.text).toBe('The GM marked Burglars 2 as acted.')
    expect(setMemberActed(g, burglars, id, true, c)).toBe(g)
    g = setMemberActed(g, burglars, id, false, c)
    expect(actedText(g.groups[0]!)).toBe('0 of 3 acted')
  })

  it("makes a group's members ready when its turn starts, and the environment's groups on the environment's turn", () => {
    const { game, c, burglars, drones, env } = table()
    let g = markAll(markAll(game, burglars, c), drones, c)
    g = startRound(g, { kind: 'group', id: burglars }, c)
    expect(actedText(g.groups[0]!)).toBe('0 of 3 acted')
    expect(actedText(g.groups[1]!)).toBe('2 of 2 acted')
    g = handOff(g, { kind: 'environment', id: env }, c)
    expect(actedText(g.groups[1]!)).toBe('0 of 2 acted')
  })

  it('sends players who has acted', () => {
    const { game, c, burglars } = table()
    const g = setMemberActed(game, burglars, game.groups[0]!.members[0]!.id, true, c)
    const view = project(g, 'player')
    expect(view.groups[0]!.members.map((m) => m.acted)).toEqual([true, false, false])
    expect(view.groups[1]!.owner).toEqual({ kind: 'environment' })
  })

  it('logs marking a hidden group for the GM only', () => {
    const c = clock()
    const game = addGroup(createGame(), { kind: 'lieutenants', name: 'Secret choir', die: 'd8', count: 1, hidden: true }, c)
    const g = setMemberActed(game, game.groups[0]!.id, game.groups[0]!.members[0]!.id, true, c)
    expect(g.feed.at(-1)).toMatchObject({ text: 'The GM marked Secret choir 1 as acted.', gmOnly: true })
  })

  it('makes a GM group ready when it is handed the turn', () => {
    const { game, c, burglars, env } = table()
    let g = startRound(game, { kind: 'environment', id: env }, c)
    g = markAll(g, burglars, c)
    g = handOff(g, { kind: 'group', id: burglars }, c)
    expect(actedText(g.groups[0]!)).toBe('0 of 3 acted')
  })

  it('turns away a group with a bad owner, actions or acted', () => {
    const { game } = table()
    const bad = (change: (g: NpcGroup) => object) => ({ ...game, groups: [change(game.groups[0]!)] })
    const readable = (g: object) => parseSavedGame(gameToSaved(g as Game)).ok
    expect(readable(game)).toBe(true)
    expect(readable(bad((g) => ({ ...g, owner: { kind: 'hero' } })))).toBe(false)
    expect(readable(bad((g) => ({ ...g, actions: ['dance'] })))).toBe(false)
    expect(readable(bad((g) => ({ ...g, actions: 'some' })))).toBe(false)
    expect(readable(bad((g) => ({ ...g, members: g.members.map((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'acted'))) })))).toBe(false)
    expect(readable(bad((g) => ({ ...g, actions: ['attack', 'hinder'] })))).toBe(true)
    const view = project(game, 'player')
    expect(tableViewProblem(view)).toBeUndefined()
    expect(tableViewProblem({ ...view, groups: [{ ...view.groups[0]!, owner: { kind: 'hero' } }] })).toBeDefined()
    expect(tableViewProblem({ ...view, groups: [{ ...view.groups[0]!, actions: ['dance'] }] })).toBeDefined()
  })
})
