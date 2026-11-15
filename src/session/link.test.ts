import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGame } from '../game/model'
import { project } from '../game/project'
import type { Hero } from '../hero/model'
import { completeHero } from '../test/heroes'
import { PlayerClient } from './client'
import { RESYNC_EVERY } from './link'
import { MAX_TEXT, PROTOCOL_VERSION } from './protocol'
import { fakeNetwork } from './transport'

const ROOM = 'ABCD-EFGH'
const maya: Hero = { ...completeHero(), id: 'maya-src' }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
})
afterEach(() => {
  vi.useRealTimers()
})

/** A player's device and a stand-in for the GM's device that records what it hears. */
async function setup() {
  const net = fakeNetwork()
  let now = new Date('2026-11-09T12:00:00Z').getTime()
  const client = new PlayerClient(net.connect, { room: ROOM, clientId: 'c1', name: 'Alex', heroSourceId: 'maya-src', sheet: maya }, { now: () => new Date(now) })
  const gm = net.connect(ROOM)
  const heard: { type: string; peer: string }[] = []
  gm.onMessage((m, peer) => heard.push({ type: (m as { type: string }).type, peer }))
  await net.settle()
  const table = project(createGame({ id: 'g', name: 'Thursday game' }), 'player')
  const state = (version: number, feedText = 'All fine.') => ({ v: PROTOCOL_VERSION, type: 'state', room: ROOM, version, gm: 'Sam', table: { ...table, feed: [{ id: `f${version}`, at: '2026-11-09T12:00:00Z', by: 'GM', text: feedText }] } })
  const hellos = () => heard.filter((h) => h.type === 'hello').length
  return { net, client, gm, state, hellos, tick: (ms: number) => void (now += ms) }
}

describe('the link to the GM', () => {
  it("shows Out of sync for a state from the GM it can't read, keeps the last one, and asks again", async () => {
    const { net, client, gm, state, hellos } = await setup()
    gm.send(state(1))
    await net.settle()
    expect(client.getSnapshot()).toMatchObject({ status: 'live', received: { version: 1 } })
    const before = hellos()
    gm.send(state(2, 'x'.repeat(MAX_TEXT + 1)))
    await net.settle()
    expect(client.getSnapshot()).toMatchObject({ status: 'live', outOfSync: true, received: { version: 1 } })
    expect(hellos()).toBe(before + 1)
    // The next state that reads clears it.
    gm.send(state(3))
    await net.settle()
    expect(client.getSnapshot().outOfSync).toBeUndefined()
    expect(client.getSnapshot().received!.version).toBe(3)
  })

  it(`asks again at most every ${RESYNC_EVERY / 1000} seconds`, async () => {
    const { net, gm, state, hellos, tick } = await setup()
    gm.send(state(1))
    await net.settle()
    const before = hellos()
    gm.send(state(2, 'x'.repeat(MAX_TEXT + 1)))
    gm.send(state(3, 'x'.repeat(MAX_TEXT + 1)))
    await net.settle()
    expect(hellos()).toBe(before + 1)
    tick(RESYNC_EVERY)
    gm.send(state(4, 'x'.repeat(MAX_TEXT + 1)))
    await net.settle()
    expect(hellos()).toBe(before + 2)
  })

  it("ignores another peer's state, readable or not, once the GM is known", async () => {
    const { net, client, gm, state } = await setup()
    gm.send(state(1))
    await net.settle()
    const other = net.connect(ROOM)
    await net.settle()
    other.send(state(9, 'x'.repeat(MAX_TEXT + 1)))
    other.send(state(10))
    await net.settle()
    expect(client.getSnapshot().outOfSync).toBeUndefined()
    expect(client.getSnapshot().received!.version).toBe(1)
  })

  it("reads a GM's version refusal from another version, saying which side should reload", async () => {
    for (const [v, refused] of [
      [PROTOCOL_VERSION + 1, 'version'],
      [PROTOCOL_VERSION - 1, 'oldHost'],
    ] as const) {
      const { net, client, gm } = await setup()
      gm.send({ v, type: 'refused', reason: 'version' })
      await net.settle()
      expect(client.getSnapshot()).toMatchObject({ status: 'refused', refused })
    }
  })

  it('ignores anything else from another version', async () => {
    const { net, client, gm } = await setup()
    gm.send({ v: PROTOCOL_VERSION + 1, type: 'refused', reason: 'full' })
    gm.send({ v: PROTOCOL_VERSION + 1, type: 'removed' })
    await net.settle()
    expect(client.getSnapshot().status).toBe('connecting')
  })
})
