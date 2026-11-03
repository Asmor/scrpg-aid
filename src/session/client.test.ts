import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '../game/model'
import { MemoryGameStore } from '../game/store'
import type { Hero } from '../hero/model'
import { completeHero } from '../test/heroes'
import { OFFLINE_AFTER, PlayerClient, RESULT_TIMEOUT, RETRY_EVERY, type Received } from './client'
import { HostSession } from './host'
import { fakeNetwork, type Transport } from './transport'

let n = 0
const clock = () => ({ now: new Date('2026-11-03T21:00:00Z'), newId: () => `id${++n}` })
const ROOM = 'ABCD-EFGH'
const maya = (name = 'Maya Reyes'): Hero => ({ ...completeHero(), id: 'maya-src', details: { ...completeHero().details, name } })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
})
afterEach(() => {
  vi.useRealTimers()
})

async function setup() {
  const net = fakeNetwork()
  const store = new MemoryGameStore()
  await store.save(createGame({ id: 'g', name: 'Thursday game' }))
  const host = new HostSession(net.connect, { room: ROOM, gameId: 'g', gm: 'Sam', removed: [] }, store, clock)
  const received: Received[] = []
  const client = new PlayerClient(net.connect, { room: ROOM, clientId: 'c1', name: 'Alex', heroSourceId: 'maya-src', sheet: maya() }, { onReceive: (r) => received.push(r), now: () => new Date('2026-11-03T21:42:00Z') })
  await net.settle()
  return { net, host, client, received }
}

describe("a player's device", () => {
  it('joins, getting the game and its own hero, and caches what it receives', async () => {
    const { host, client, received } = await setup()
    expect(client.getSnapshot().status).toBe('live')
    expect(client.heroId).toBe(host.game!.heroes[0]!.id)
    expect(client.getSnapshot().received).toMatchObject({ room: ROOM, gm: 'Sam', at: '2026-11-03T21:42:00.000Z' })
    expect(received.at(-1)!.table.heroes[0]!.sheet.details.name).toBe('Maya Reyes')
  })

  it('sends an action and shows it pending until the result, with no change before', async () => {
    const { net, client } = await setup()
    expect(client.act({ kind: 'heroPoints', by: 1 })).toBe(true)
    expect(client.getSnapshot().pending).toHaveLength(1)
    expect(client.getSnapshot().received!.table.heroes[0]!.play.heroPoints).toBe(0)
    await net.settle()
    expect(client.getSnapshot().pending).toEqual([])
    expect(client.getSnapshot().received!.table.heroes[0]!.play.heroPoints).toBe(1)
  })

  it('shows why an action was refused', async () => {
    const { net, client } = await setup()
    client.act({ kind: 'heroPoints', by: -1 })
    await net.settle()
    expect(client.getSnapshot().notices).toMatchObject([{ kind: 'rejected', text: 'Not applied: you have no hero points to spend.' }])
    client.dismiss(client.getSnapshot().notices[0]!.id)
    expect(client.getSnapshot().notices).toEqual([])
  })

  it("says when an action didn't reach the GM within 5 seconds, and tries it again once", async () => {
    const net = fakeNetwork()
    const store = new MemoryGameStore()
    await store.save(createGame({ id: 'g' }))
    const host = new HostSession(net.connect, { room: ROOM, gameId: 'g', gm: 'Sam', removed: [] }, store, clock)
    // A device whose messages to the GM are lost after joining.
    let drop = false
    const lossy = (room: string): Transport => {
      const t = net.connect(room)
      return { ...t, send: (m, to) => (drop ? undefined : t.send(m, to)) }
    }
    const client = new PlayerClient(lossy, { room: ROOM, clientId: 'c1', name: 'Alex', heroSourceId: 'maya-src', sheet: maya() })
    await net.settle()
    drop = true
    client.act({ kind: 'heroPoints', by: 1 })
    await net.settle()
    vi.advanceTimersByTime(RESULT_TIMEOUT)
    const notice = client.getSnapshot().notices[0]!
    expect(notice).toMatchObject({ kind: 'unreachable', text: "Didn't reach the GM. Nothing changed." })
    expect(client.getSnapshot().pending[0]!.timedOut).toBe(true)
    drop = false
    expect(client.retry(notice.retry!)).toBe(true)
    await net.settle()
    expect(client.getSnapshot().pending).toEqual([])
    expect(client.getSnapshot().notices).toEqual([])
    expect(host.game!.heroes[0]!.play.heroPoints).toBe(1)
  })

  it('pauses actions while the GM is away, goes offline after 30 seconds, and keeps trying', async () => {
    const { net, host, client } = await setup()
    host.leave()
    await net.settle()
    expect(client.getSnapshot().status).toBe('reconnecting')
    expect(client.act({ kind: 'heroPoints', by: 1 })).toBe(false)
    vi.advanceTimersByTime(OFFLINE_AFTER)
    expect(client.getSnapshot().status).toBe('offline')
    // The cached game stays.
    expect(client.getSnapshot().received!.table.heroes).toHaveLength(1)

    // The GM hosts again (same room); the next try finds them.
    const store = new MemoryGameStore()
    await store.save({ ...createGame({ id: 'g' }), heroes: host.game!.heroes })
    const back = new HostSession(net.connect, { room: ROOM, gameId: 'g', gm: 'Sam', removed: [] }, store, clock)
    vi.advanceTimersByTime(RETRY_EVERY)
    await net.settle()
    expect(client.getSnapshot().status).toBe('live')
    expect(back.getSnapshot().connected).toEqual(new Set(['c1']))
  })

  it('starts from a cached game, read-only, going offline if the GM never answers', async () => {
    const net = fakeNetwork()
    const cached: Received = { room: ROOM, version: 3, table: { ...(await import('../game/project')).project(createGame({ id: 'g', name: 'Thursday game' }), 'player') }, gm: 'Sam', at: '2026-11-02T21:42:00.000Z' }
    const client = new PlayerClient(net.connect, { room: ROOM, clientId: 'c1', name: 'Alex', heroSourceId: 'maya-src', sheet: maya() }, { cached })
    expect(client.getSnapshot()).toMatchObject({ status: 'connecting', received: cached })
    expect(client.act({ kind: 'reaction', used: true })).toBe(false)
    // A cache offered later doesn't replace what's shown.
    client.showCached({ ...cached, gm: 'Someone else' })
    expect(client.getSnapshot().received!.gm).toBe('Sam')
    const fresh = new PlayerClient(net.connect, { room: ROOM, clientId: 'c2', name: 'Jo', heroSourceId: 'x', sheet: maya() })
    fresh.showCached({ ...cached, room: 'WXYZ-2345' })
    expect(fresh.getSnapshot().received).toBeUndefined()
    fresh.showCached(cached)
    expect(fresh.getSnapshot().received).toEqual(cached)
    fresh.leave()
    vi.advanceTimersByTime(OFFLINE_AFTER)
    expect(client.getSnapshot().status).toBe('offline')
    client.leave()
  })

  it('asks for a sheet update, waits, and hears the GM approve or decline', async () => {
    const { net, host, client } = await setup()
    const waits: boolean[] = []
    const watched = new PlayerClient(net.connect, { room: ROOM, clientId: 'c1', name: 'Alex', heroSourceId: 'maya-src', sheet: maya() }, { onSyncWaiting: (w) => waits.push(w) })
    client.leave()
    await net.settle()
    expect(watched.requestSync(maya('Maya Reyes II'))).toBe(true)
    expect(watched.getSnapshot().syncWaiting).toBe(true)
    await net.settle()
    host.declineSync(watched.heroId!)
    await net.settle()
    expect(watched.getSnapshot()).toMatchObject({ syncWaiting: false, notices: [{ kind: 'notSynced', text: "Not updated. The GM kept the game's copy. You can ask again from My hero ⋯." }] })
    watched.requestSync(maya('Maya Reyes II'))
    await net.settle()
    host.approveSync(watched.heroId!)
    await net.settle()
    expect(watched.getSnapshot().notices.at(-1)).toMatchObject({ kind: 'synced', text: 'Updated. The GM approved: Maya Reyes II now matches your sheet.' })
    watched.requestSync(maya('Maya Reyes III'))
    expect(watched.cancelSync()).toBe(true)
    await net.settle()
    expect(host.game!.pendingSyncs).toEqual([])
    expect(waits).toEqual([true, false, true, false, true, false])
  })

  it('is told when the GM removed it, and when the GM runs an older app', async () => {
    const { net, host, client } = await setup()
    host.removePlayer(client.heroId!)
    await net.settle()
    expect(client.getSnapshot()).toMatchObject({ status: 'refused', refused: 'removed' })

    const net2 = fakeNetwork()
    const oldGm = net2.connect(ROOM)
    oldGm.onPeerJoin((peer) => oldGm.send({ v: 1, type: 'state', state: {} }, peer))
    const other = new PlayerClient(net2.connect, { room: ROOM, clientId: 'c2', name: 'Jo', heroSourceId: 'x', sheet: maya() })
    await net2.settle()
    expect(other.getSnapshot()).toMatchObject({ status: 'refused', refused: 'oldHost' })
  })
})
