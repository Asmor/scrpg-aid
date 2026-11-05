import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame, type Game } from '../game/model'
import { MemoryGameStore } from '../game/store'
import { addVillain, setNotes, setPlayersSee } from '../game/table'
import type { Hero } from '../hero/model'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { HostSession } from './host'
import { OFFLINE_AFTER, RETRY_EVERY } from './link'
import { SessionManager } from './manager'
import { OBSERVER_LIMIT, readHostMessage, type HostMessage } from './protocol'
import { localSessionStore, memoryStorage } from './storage'
import { fakeNetwork } from './transport'
import { ObserverClient, readWatchingSaved } from './watch'

let n = 0
const clock = () => ({ now: new Date('2026-11-03T21:00:00Z'), newId: () => `id${++n}` })
const ROOM = 'ABCD-EFGH'
const maya = (): Hero => ({ ...completeHero(), id: 'maya-src', details: { ...completeHero().details, name: 'Maya Reyes' } })
const watchHello = (clientId: string, screenName = 'Living room TV') => ({ v: 7, type: 'hello', role: 'observer', clientId, screenName })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
})
afterEach(() => {
  vi.useRealTimers()
})

/** A game with a hidden villain, a revealed one players see by status only, and notes. */
function table(): Game {
  let g = createGame({ id: 'g', name: 'Thursday game' })
  g = addVillain(g, { ...adaptiveBruiser(), id: 'v-hidden' }, clock())
  g = addVillain(g, { ...adaptiveBruiser(), id: 'v-shown' }, clock())
  const shown = g.villains.find((v) => v.sourceId === 'v-shown')!
  g = { ...g, villains: g.villains.map((v) => (v.id === shown.id ? { ...v, hidden: false } : v)) }
  g = setPlayersSee(g, shown.id, 'status')
  return setNotes(g, 'The crucible is a trap.')
}

async function setup(game: Game = table()) {
  const net = fakeNetwork()
  const store = new MemoryGameStore()
  await store.save(game)
  const host = new HostSession(net.connect, { room: ROOM, gameId: game.id, gm: 'Sam', removed: [] }, store, clock)
  await net.settle()
  return { net, store, host }
}

/** A device on the network that records what the GM's device sends it. */
function peer(net: ReturnType<typeof fakeNetwork>) {
  const got: HostMessage[] = []
  const t = net.connect(ROOM)
  t.onMessage((raw) => {
    const msg = readHostMessage(raw)
    if (msg) got.push(msg)
  })
  return { got, send: (msg: unknown) => t.send(msg), leave: () => t.leave(), last: <T extends HostMessage['type']>(type: T) => got.filter((m): m is Extract<HostMessage, { type: T }> => m.type === type).at(-1) }
}

describe('watching a hosted game', () => {
  it('sends an observer the observer projection, with no hero of its own and nothing hidden or private', async () => {
    const { net, host } = await setup()
    const tv = new ObserverClient(net.connect, { room: ROOM, clientId: 'tv1', screenName: 'Living room TV' }, () => new Date('2026-11-03T21:42:00Z'))
    await net.settle()
    expect(tv.getSnapshot().status).toBe('live')
    const received = tv.getSnapshot().received!
    expect(received).toMatchObject({ room: ROOM, gm: 'Sam', at: '2026-11-03T21:42:00.000Z' })
    expect(received.you).toBeUndefined()
    const json = JSON.stringify(received.table)
    const hidden = host.game!.villains.find((v) => v.hidden)!
    expect(json).not.toContain(hidden.id)
    expect(json).not.toContain('crucible')
    expect(received.table.villains).toHaveLength(1)
    expect(received.table.villains[0]!.health).toBeUndefined()
    // The GM sees the screen by name; it isn't a player.
    expect(host.getSnapshot().observers).toEqual([{ clientId: 'tv1', screenName: 'Living room TV' }])
    expect(host.getSnapshot().connected.size).toBe(0)
  })

  it('keeps observers up to date as the game changes, and they leave the list when they go', async () => {
    const { net, host } = await setup()
    const tv = new ObserverClient(net.connect, { room: ROOM, clientId: 'tv1', screenName: 'TV' })
    await net.settle()
    host.apply((g) => ({ ...g, name: 'Friday game' }))
    await net.settle()
    expect(tv.getSnapshot().received!.table.name).toBe('Friday game')
    tv.leave()
    await net.settle()
    expect(host.getSnapshot().observers).toEqual([])
  })

  it("ignores anything but hello from an observer, and doesn't let it act for a hero", async () => {
    const { net, host } = await setup()
    const alex = peer(net)
    alex.send({ v: 7, type: 'hello', role: 'player', clientId: 'c1', name: 'Alex', heroSourceId: 'maya-src', sheet: maya() })
    await net.settle()
    const heroId = host.game!.heroes[0]!.id
    const tv = peer(net)
    tv.send(watchHello('tv1'))
    await net.settle()
    const version = host.getSnapshot().version
    tv.send({ v: 7, type: 'action', id: 'a1', heroId, action: { kind: 'health', by: -5 }, basedOn: version })
    tv.send({ v: 7, type: 'syncRequest', heroId, sheet: maya() })
    await net.settle()
    expect(host.getSnapshot().version).toBe(version)
    expect(tv.last('result')).toBeUndefined()
    expect(host.game!.pendingSyncs).toEqual([])
  })

  it('refuses observers past the limit, but takes the same screen back', async () => {
    const { net, host } = await setup()
    const screens = Array.from({ length: OBSERVER_LIMIT }, () => peer(net))
    screens.forEach((s, i) => s.send(watchHello(`tv${i}`, `Screen ${i}`)))
    await net.settle()
    expect(host.getSnapshot().observers).toHaveLength(OBSERVER_LIMIT)
    const extra = peer(net)
    extra.send(watchHello('tv-extra'))
    await net.settle()
    expect(extra.last('refused')).toMatchObject({ reason: 'full' })
    expect(extra.last('state')).toBeUndefined()
    // A screen reconnecting with its own id isn't a new one.
    const again = peer(net)
    again.send(watchHello('tv0', 'Screen 0'))
    await net.settle()
    expect(again.last('state')).toBeDefined()
    expect(host.getSnapshot().observers).toHaveLength(OBSERVER_LIMIT)
  })

  it('removes an observer, who is refused from then on, and saves the removal for after a reload', async () => {
    const { net, host, store } = await setup()
    const saves: unknown[] = []
    host.leave()
    const gm = new HostSession(net.connect, { room: ROOM, gameId: 'g', gm: 'Sam', removed: [] }, store, clock, (s) => saves.push(s))
    const tv = new ObserverClient(net.connect, { room: ROOM, clientId: 'tv1', screenName: 'TV' })
    await net.settle()
    gm.removeObserver('tv1')
    await net.settle()
    expect(tv.getSnapshot()).toMatchObject({ status: 'refused', refused: 'removed' })
    expect(gm.getSnapshot().observers).toEqual([])
    expect(saves.at(-1)).toMatchObject({ removed: ['tv1'] })
    const later = peer(net)
    later.send(watchHello('tv1'))
    await net.settle()
    expect(later.last('refused')).toMatchObject({ reason: 'removed' })
    expect(gm.getSnapshot().observers).toEqual([])
  })

  it('keeps showing the last table when the GM goes away, then goes offline and retries', async () => {
    const { net, host } = await setup()
    const tv = new ObserverClient(net.connect, { room: ROOM, clientId: 'tv1', screenName: 'TV' })
    await net.settle()
    host.leave()
    await net.settle()
    expect(tv.getSnapshot().status).toBe('reconnecting')
    expect(tv.getSnapshot().received).toBeDefined()
    vi.advanceTimersByTime(OFFLINE_AFTER)
    expect(tv.getSnapshot().status).toBe('offline')
    // The GM comes back: the next retry finds them.
    new HostSession(net.connect, { room: ROOM, gameId: 'g', gm: 'Sam', removed: [] }, (await setup()).store, clock)
    vi.advanceTimersByTime(RETRY_EVERY)
    await net.settle()
    expect(tv.getSnapshot().status).toBe('live')
    tv.leave()
  })
})

describe('the device’s watching session', () => {
  it('watches one game at a time, remembers the screen name, resumes after a reload and stops', async () => {
    const net = fakeNetwork()
    const storage = memoryStorage()
    const games = new MemoryGameStore()
    await games.save(createGame({ id: 'g1' }))
    const manager = new SessionManager(net.connect, localSessionStore(storage), clock, games)
    await manager.hostGame('g1', 'Sam')
    manager.watchGame({ room: ROOM, screenName: ' Living room TV ' })
    // Watching stops hosting, and forgets it.
    expect(manager.getSnapshot().hosting).toBeUndefined()
    expect(storage.data.has('scrpg.session.host')).toBe(false)
    const watching = manager.getSnapshot().watching!
    expect(watching.info).toMatchObject({ room: ROOM, screenName: 'Living room TV' })
    expect(manager.screenName()).toBe('Living room TV')
    manager.watchGame({ room: ROOM, screenName: 'Living room TV' })
    expect(manager.getSnapshot().watching).toBe(watching)

    manager.suspend()
    expect(manager.getSnapshot().watching).toBeUndefined()
    manager.resume()
    expect(manager.getSnapshot().watching!.room).toBe(ROOM)

    // Joining as a player stops watching.
    manager.joinGame({ room: ROOM, name: 'Alex', hero: maya() })
    expect(manager.getSnapshot().watching).toBeUndefined()
    expect(storage.data.has('scrpg.session.watching')).toBe(false)

    manager.watchGame({ room: ROOM, screenName: 'TV' })
    expect(manager.getSnapshot().playing).toBeUndefined()
    expect(storage.data.has('scrpg.session.playing')).toBe(false)
    manager.stopWatching()
    expect(manager.getSnapshot().watching).toBeUndefined()
    expect(storage.data.has('scrpg.session.watching')).toBe(false)
    manager.stopWatching()
  })

  it('reads only well-formed saved watching sessions', () => {
    expect(readWatchingSaved({ v: 1, room: ROOM, screenName: 'TV' })).toEqual({ v: 1, room: ROOM, screenName: 'TV' })
    expect(readWatchingSaved({ v: 7, room: ROOM, screenName: 'TV' })).toBeUndefined()
    expect(readWatchingSaved({ v: 1, room: '', screenName: 'TV' })).toBeUndefined()
    const store = localSessionStore(null)
    store.saveScreenName('TV')
    expect(store.loadScreenName()).toBe('')
    expect(store.loadWatching()).toBeUndefined()
  })
})
