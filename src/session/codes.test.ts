import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '../game/model'
import { MemoryGameStore } from '../game/store'
import { setGameCode } from '../game/table'
import type { Hero } from '../hero/model'
import { completeHero } from '../test/heroes'
import { PlayerClient } from './client'
import { HostSession, CODE_HANDOFF_MS } from './host'
import { OFFLINE_AFTER } from './link'
import { SessionManager } from './manager'
import { readClientMessage, readHostMessage } from './protocol'
import { localSessionStore, memoryStorage } from './storage'
import { fakeNetwork } from './transport'
import { ObserverClient } from './watch'

let n = 0
const clock = () => ({ now: new Date('2026-11-03T21:00:00Z'), newId: () => `id${++n}` })
const OLD = 'ABCD-EFGH'
const NEW = 'K7QX-2MRT'
const hero = (id: string, name: string): Hero => ({ ...completeHero(), id, details: { ...completeHero().details, name } })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
})
afterEach(() => {
  vi.useRealTimers()
})

async function setup() {
  const net = fakeNetwork()
  const store = new MemoryGameStore()
  await store.save({ ...createGame({ id: 'g', name: 'Thursday game' }), code: OLD })
  const host = new HostSession(net.connect, { room: OLD, gameId: 'g', gm: 'Sam', removed: [] }, store, clock)
  const player = (clientId: string, name: string, h: Hero, gameId?: string, room = OLD) =>
    new PlayerClient(net.connect, { room, clientId, name, heroSourceId: h.id, sheet: h, ...(gameId ? { gameId } : {}) }, { newId: () => `n${++n}` })
  await net.settle()
  return { net, store, host, player }
}

describe('a new game code while hosting', () => {
  it('moves kept players and screens to the new code with their places, removes the rest, and logs it for the GM', async () => {
    const { net, store, host, player } = await setup()
    const alex = player('c1', 'Alex', hero('maya', 'Maya Reyes'))
    const jo = player('c2', 'Jo', hero('chaos', 'Captain Chaos'))
    const tv = new ObserverClient(net.connect, { room: OLD, clientId: 'tv1', screenName: 'Living room TV' })
    await net.settle()
    const maya = host.game!.heroes.find((h) => h.sourceId === 'maya')!
    alex.act({ kind: 'health', by: -5 })
    await net.settle()
    const health = host.game!.heroes.find((h) => h.id === maya.id)!.play.health
    expect(health).toBeDefined()

    const change = host.changeCode(NEW, new Set(['c1', 'tv1']))
    expect(change).toEqual({ from: OLD, code: NEW, kept: ['Alex', 'Living room TV'], removed: ['Jo'], needsCode: [] })
    expect(host.room).toBe(NEW)
    await net.settle()

    // Kept: followed to the new code, same hero copy, play state intact, told once.
    expect(alex.room).toBe(NEW)
    expect(alex.formerRooms).toEqual([OLD])
    expect(alex.getSnapshot().status).toBe('live')
    expect(alex.heroId).toBe(maya.id)
    expect(host.game!.heroes.find((h) => h.id === maya.id)!.play.health).toBe(health)
    expect(alex.getSnapshot().notices.at(-1)).toMatchObject({ kind: 'codeChanged', code: NEW })
    expect(tv.room).toBe(NEW)
    expect(tv.getSnapshot().status).toBe('live')
    expect(host.getSnapshot().connected).toEqual(new Set(['c1']))
    expect(host.getSnapshot().observers).toEqual([{ clientId: 'tv1', screenName: 'Living room TV' }])

    // Removed: told, their hero leaves the table, and they can't come back.
    expect(jo.getSnapshot()).toMatchObject({ status: 'refused', refused: 'removed' })
    expect(host.game!.heroes.map((h) => h.sourceId)).toEqual(['maya'])
    const joAgain = player('c2', 'Jo', hero('chaos', 'Captain Chaos'), undefined, NEW)
    await net.settle()
    expect(joAgain.getSnapshot()).toMatchObject({ status: 'refused', refused: 'removed' })

    // The game keeps the new code, and the GM-only line says who came along.
    expect(host.game!.code).toBe(NEW)
    expect(host.game!.feed.at(-1)).toMatchObject({ text: 'You changed the game code. Kept: Alex and Living room TV. Removed: Jo.', gmOnly: true })
    await host.settled
    const saved = await store.get('g')
    expect(saved.status === 'found' && saved.game.code).toBe(NEW)
  })

  it('closes the old code: nobody finds a game there afterwards', async () => {
    const { net, host, player } = await setup()
    host.changeCode(NEW, new Set())
    vi.advanceTimersByTime(CODE_HANDOFF_MS)
    await net.settle()
    const late = player('c9', 'Late', hero('maya', 'Maya Reyes'))
    await net.settle()
    expect(late.getSnapshot().status).toBe('connecting')
    vi.advanceTimersByTime(OFFLINE_AFTER)
    expect(late.getSnapshot().status).toBe('offline')
    expect(host.game!.heroes).toEqual([])
    late.leave()
  })

  it('names players who were away, and lets them back in with the new code and their place', async () => {
    const { net, host, player } = await setup()
    const priya = player('c3', 'Priya', hero('swarm', 'Swarmwright'))
    await net.settle()
    const heroId = priya.heroId!
    priya.leave()
    await net.settle()
    const change = host.changeCode(NEW, new Set())
    expect(change!.needsCode).toEqual(['Priya'])
    expect(change!.removed).toEqual([])
    expect(host.getSnapshot().needsNewCode).toEqual(new Set(['c3']))

    const back = player('c3', 'Priya', hero('swarm', 'Swarmwright'), 'g', NEW)
    await net.settle()
    expect(back.getSnapshot().status).toBe('live')
    expect(back.heroId).toBe(heroId)
    expect(host.game!.heroes).toHaveLength(1)
    expect(host.getSnapshot().needsNewCode.size).toBe(0)
  })

  it('turns away a saved game whose code now belongs to another game', async () => {
    const { net, player } = await setup()
    const stranger = player('c4', 'Alex', hero('maya', 'Maya Reyes'), 'some-other-game')
    await net.settle()
    expect(stranger.getSnapshot()).toMatchObject({ status: 'refused', refused: 'wrongGame' })
  })

  it('ignores a code change or removal from anyone but the GM', async () => {
    const { net, player } = await setup()
    const alex = player('c1', 'Alex', hero('maya', 'Maya Reyes'))
    await net.settle()
    const impostor = net.connect(OLD)
    impostor.send({ v: 8, type: 'codeChanged', code: NEW })
    impostor.send({ v: 8, type: 'removed' })
    await net.settle()
    expect(alex.room).toBe(OLD)
    expect(alex.getSnapshot().status).toBe('live')
  })

  it('reads the new messages, and turns away malformed ones', () => {
    expect(readHostMessage({ v: 8, type: 'codeChanged', code: NEW })).toEqual({ v: 8, type: 'codeChanged', code: NEW })
    expect(readHostMessage({ v: 8, type: 'codeChanged', code: 'k7qx-2mrt' })).toBeUndefined()
    expect(readHostMessage({ v: 8, type: 'removed' })).toEqual({ v: 8, type: 'removed' })
    expect(readHostMessage({ v: 8, type: 'removed', reason: 5 })).toBeUndefined()
    expect(readHostMessage({ v: 8, type: 'refused', reason: 'wrongGame' })).toBeDefined()
    const hello = { v: 8, type: 'hello', role: 'player', clientId: 'c1', name: 'Alex', heroSourceId: 'maya', sheet: hero('maya', 'Maya'), gameId: 'g' }
    expect(readClientMessage(hello)).toEqual(hello)
    expect(readClientMessage({ ...hello, gameId: '' })).toBeUndefined()
  })
})

describe('the device’s session and new codes', () => {
  it('keeps a game’s code across hosting, and replaces it while not hosting', async () => {
    const net = fakeNetwork()
    const games = new MemoryGameStore()
    await games.save(createGame({ id: 'g' }))
    const manager = new SessionManager(net.connect, localSessionStore(memoryStorage()), clock, games)
    await manager.hostGame('g', 'Sam')
    const first = manager.getSnapshot().hosting!.room
    await manager.stopHosting()
    await manager.hostGame('g', 'Sam')
    expect(manager.getSnapshot().hosting!.room).toBe(first)
    await manager.stopHosting()

    const result = await manager.newCode('g')
    expect(result.ok && result.code).not.toBe(first)
    const saved = await games.get('g')
    expect(saved.status === 'found' && saved.game.code).toBe(result.ok && result.code)
    expect(saved.status === 'found' && saved.game.feed.at(-1)).toMatchObject({ text: 'You changed the game code.', gmOnly: true })
    expect(await manager.newCode('missing')).toEqual({ ok: false, error: 'The game was deleted.' })
  })

  it('changes the code of the hosted game through the hosting session', async () => {
    const net = fakeNetwork()
    const games = new MemoryGameStore()
    await games.save(createGame({ id: 'g' }))
    const manager = new SessionManager(net.connect, localSessionStore(memoryStorage()), clock, games)
    await manager.hostGame('g', 'Sam')
    await net.settle()
    const host = manager.getSnapshot().hosting!
    const before = host.room
    const result = await manager.newCode('g', new Set())
    expect(result.ok && result.change?.from).toBe(before)
    expect(host.room).not.toBe(before)
    manager.suspend()
  })

  it('remembers the new code a player or screen followed, for after a reload', async () => {
    const net = fakeNetwork()
    const games = new MemoryGameStore()
    await games.save({ ...createGame({ id: 'g' }), code: OLD })
    const host = new HostSession(net.connect, { room: OLD, gameId: 'g', gm: 'Sam', removed: [] }, games, clock)
    const playerStorage = memoryStorage()
    const playing = new SessionManager(net.connect, localSessionStore(playerStorage), clock)
    playing.joinGame({ room: OLD, name: 'Alex', hero: hero('maya', 'Maya Reyes') })
    const screenStorage = memoryStorage()
    const watching = new SessionManager(net.connect, localSessionStore(screenStorage), clock)
    watching.watchGame({ room: OLD, screenName: 'TV' })
    await net.settle()
    expect(localSessionStore(playerStorage).loadPlaying()!.gameId).toBe('g')
    host.changeCode(NEW, new Set(host.getSnapshot().observers.map((o) => o.clientId).concat([...host.getSnapshot().connected])))
    await net.settle()
    expect(localSessionStore(playerStorage).loadPlaying()!.room).toBe(NEW)
    expect(playing.lastGame()!.room).toBe(NEW)
    expect(localSessionStore(screenStorage).loadWatching()!.room).toBe(NEW)
    expect(watching.getSnapshot().watching!.info.room).toBe(NEW)
    playing.suspend()
    watching.suspend()
  })

  it('logs a new code with nobody kept', () => {
    const g = setGameCode(createGame({ id: 'g' }), NEW, clock(), { kept: [], removed: ['Jo', 'Al', 'Bo'] })
    expect(g.feed.at(-1)!.text).toBe('You changed the game code. Kept: no one. Removed: Jo, Al and Bo.')
    expect(setGameCode(g, NEW, clock())).toBe(g)
  })
})
