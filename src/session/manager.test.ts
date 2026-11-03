import { describe, expect, it, vi } from 'vitest'
import { CACHE_EVERY, SessionManager } from './manager'
import { localSessionStore, memoryStorage } from './storage'
import { fakeNetwork } from './transport'
import { createGame } from '../game/model'
import { MemoryGameStore } from '../game/store'
import { MemoryJoinedStore } from '../game/joined-store'
import { completeHero } from '../test/heroes'

let n = 0
const clock = () => ({ now: new Date('2026-10-27T10:00:00Z'), newId: () => `id${++n}` })

describe('the device’s session', () => {
  it('joins a hosted game, one session at a time, saving it to rejoin after a reload, and leaves', async () => {
    const net = fakeNetwork()
    const storage = memoryStorage()
    const games = new MemoryGameStore()
    await games.save(createGame({ id: 'g1' }))
    const manager = new SessionManager(net.connect, localSessionStore(storage), clock, games)
    let changes = 0
    manager.subscribe(() => changes++)
    manager.hostGame('g1', 'Sam')
    const hero = { ...completeHero(), id: 'maya' }
    manager.joinGame({ room: 'ABCD-EFGH', name: ' Alex ', hero })
    // Joining stops hosting, and forgets it.
    expect(manager.getSnapshot().hosting).toBeUndefined()
    expect(storage.data.has('scrpg.session.host')).toBe(false)
    const playing = manager.getSnapshot().playing!
    expect(playing.info).toMatchObject({ room: 'ABCD-EFGH', name: 'Alex', heroSourceId: 'maya' })
    expect(manager.name()).toBe('Alex')
    expect(manager.lastGame()).toEqual({ room: 'ABCD-EFGH', at: '2026-10-27T10:00:00.000Z' })
    // Joining the same game with the same hero carries on.
    manager.joinGame({ room: 'ABCD-EFGH', name: 'Alex', hero })
    expect(manager.getSnapshot().playing).toBe(playing)

    manager.suspend()
    expect(manager.getSnapshot().playing).toBeUndefined()
    manager.resume()
    expect(manager.getSnapshot().playing!.info.room).toBe('ABCD-EFGH')
    manager.resume()

    manager.leaveGame()
    expect(manager.getSnapshot().playing).toBeUndefined()
    expect(storage.data.has('scrpg.session.playing')).toBe(false)
    manager.leaveGame()
    expect(changes).toBeGreaterThan(4)
    manager.markNoteSeen('g:h')
    expect(manager.noteSeen('g:h')).toBe(true)
  })

  it('remembers a sync request waiting for the GM across reloads', async () => {
    const net = fakeNetwork()
    const games = new MemoryGameStore()
    await games.save(createGame({ id: 'g1' }))
    const gmDevice = new SessionManager(net.connect, localSessionStore(memoryStorage()), clock, games)
    gmDevice.hostGame('g1', 'Sam')
    const room = gmDevice.getSnapshot().hosting!.room
    const storage = memoryStorage()
    const manager = new SessionManager(net.connect, localSessionStore(storage), clock)
    const hero = { ...completeHero(), id: 'maya' }
    manager.joinGame({ room, name: 'Alex', hero })
    await net.settle()
    const playing = manager.getSnapshot().playing!
    expect(playing.requestSync(hero)).toBe(true)
    expect(localSessionStore(storage).loadPlaying()!.syncWaiting).toBe(true)
    // After a reload, it's still waiting.
    manager.suspend()
    manager.resume()
    expect(manager.getSnapshot().playing!.getSnapshot().syncWaiting).toBe(true)
    await net.settle()
    expect(manager.getSnapshot().playing!.cancelSync()).toBe(true)
    expect(localSessionStore(storage).loadPlaying()!.syncWaiting).toBeUndefined()
  })

  it('hosts a game from the table, remembering the name, resuming after a reload and stopping', async () => {
    const net = fakeNetwork()
    const storage = memoryStorage()
    const games = new MemoryGameStore()
    await games.save(createGame({ id: 'g1' }))
    const manager = new SessionManager(net.connect, localSessionStore(storage), clock, games)
    manager.joinGame({ room: 'WXYZ-2345', name: 'Alex', hero: completeHero() })
    manager.hostGame('g1', '  Sam ')
    const host = manager.getSnapshot().hosting!
    expect(host.gameId).toBe('g1')
    expect(host.gm).toBe('Sam')
    // Hosting leaves the game being played.
    expect(manager.getSnapshot().playing).toBeUndefined()
    expect(storage.data.has('scrpg.session.playing')).toBe(false)
    expect(manager.name()).toBe('Sam')
    // Hosting the same game again keeps the session.
    manager.hostGame('g1', 'Sam')
    expect(manager.getSnapshot().hosting).toBe(host)

    manager.suspend()
    manager.resume()
    expect(manager.getSnapshot().hosting).toMatchObject({ room: host.room, gameId: 'g1', gm: 'Sam' })

    await manager.stopHosting()
    expect(manager.getSnapshot().hosting).toBeUndefined()
    expect(storage.data.has('scrpg.session.host')).toBe(false)
    await manager.stopHosting()
  })

  it("can't host without a game store, and forgets a broken saved host", () => {
    const storage = memoryStorage()
    const manager = new SessionManager(fakeNetwork().connect, localSessionStore(storage), clock)
    manager.hostGame('g1', 'Sam')
    expect(manager.getSnapshot().hosting).toBeUndefined()
    storage.setItem('scrpg.session.host', JSON.stringify({ v: 1, room: 'X', gameId: 'g', gm: 'S', removed: [] }))
    const throwing = new SessionManager(() => {
      throw new Error('no network')
    }, localSessionStore(storage), clock, new MemoryGameStore())
    throwing.resume()
    expect(storage.data.has('scrpg.session.host')).toBe(false)
  })

  it("caches each state from the GM in the joined games store, to open later without the GM", async () => {
    const net = fakeNetwork()
    const games = new MemoryGameStore()
    await games.save({ ...createGame({ id: 'g1' }), name: 'Thursday game' })
    const gmDevice = new SessionManager(net.connect, localSessionStore(memoryStorage()), clock, games)
    gmDevice.hostGame('g1', 'Sam')
    const room = gmDevice.getSnapshot().hosting!.room
    const joined = new MemoryJoinedStore()
    const manager = new SessionManager(net.connect, localSessionStore(memoryStorage()), clock, undefined, joined)
    manager.joinGame({ room, name: 'Alex', hero: { ...completeHero(), id: 'maya' } })
    await net.settle()
    await new Promise((r) => setTimeout(r, 0))
    const [cached] = await joined.list()
    expect(cached).toMatchObject({ id: 'g1', room, gm: 'Sam', heroSourceId: 'maya', name: 'Alex', table: { name: 'Thursday game' } })
    expect(cached!.heroId).toBe(gmDevice.getSnapshot().hosting!.game!.heroes[0]!.id)
  })

  it('spaces cache writes in a busy game: the first at once, then the latest after a second', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const net = fakeNetwork()
      const games = new MemoryGameStore()
      await games.save(createGame({ id: 'g1' }))
      const gmDevice = new SessionManager(net.connect, localSessionStore(memoryStorage()), clock, games)
      gmDevice.hostGame('g1', 'Sam')
      const host = gmDevice.getSnapshot().hosting!
      const joined = new MemoryJoinedStore()
      const save = vi.spyOn(joined, 'save')
      const manager = new SessionManager(net.connect, localSessionStore(memoryStorage()), clock, undefined, joined)
      manager.joinGame({ room: host.room, name: 'Alex', hero: { ...completeHero(), id: 'maya' } })
      await net.settle()
      expect(save).toHaveBeenCalledTimes(1)
      host.apply((g) => ({ ...g, name: 'One' }))
      host.apply((g) => ({ ...g, name: 'Two' }))
      await net.settle()
      expect(save).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(CACHE_EVERY)
      expect(save).toHaveBeenCalledTimes(2)
      expect(save.mock.calls.at(-1)![0].table.name).toBe('Two')
      // Leaving writes anything still waiting.
      host.apply((g) => ({ ...g, name: 'Three' }))
      await net.settle()
      manager.leaveGame()
      expect(save.mock.calls.at(-1)![0].table.name).toBe('Three')
    } finally {
      vi.useRealTimers()
    }
  })
})
