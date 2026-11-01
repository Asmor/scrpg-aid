import { describe, expect, it } from 'vitest'
import { SessionManager } from './manager'
import { localSessionStore, memoryStorage } from './storage'
import { fakeNetwork } from './transport'

let n = 0
const clock = () => ({ now: new Date('2026-10-27T10:00:00Z'), newId: () => `id${++n}` })

describe('the browser’s session', () => {
  it('hosts, joins, and leaves, one session at a time, saving it to resume', async () => {
    const net = fakeNetwork()
    const storage = memoryStorage()
    const manager = new SessionManager(net.connect, localSessionStore(storage), clock)
    let changes = 0
    manager.subscribe(() => changes++)
    manager.host('pw')
    const gm = manager.getSnapshot().gm!
    expect(gm.room).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(gm.password).toBe('pw')
    expect(storage.data.has('scrpg.session.gm')).toBe(true)

    // Joining as a player ends the hosting, and forgets it.
    manager.join({ room: gm.room, heroId: 'h1', sharedUpTo: 'x' })
    const player = manager.getSnapshot().player!
    expect(manager.getSnapshot().gm).toBeUndefined()
    expect(storage.data.has('scrpg.session.gm')).toBe(false)
    expect(JSON.parse(storage.data.get('scrpg.session.player')!)).toMatchObject({ room: gm.room, heroId: 'h1', sharedUpTo: 'x', applied: [] })

    // Suspending keeps the save; resuming reconnects to it.
    manager.suspend()
    expect(manager.getSnapshot()).toEqual({})
    const again = new SessionManager(net.connect, localSessionStore(storage), clock)
    again.resume()
    expect(again.getSnapshot().player?.clientId).toBe(player.clientId)
    again.resume()
    expect(again.getSnapshot().player?.heroId).toBe('h1')

    again.leave()
    expect(again.getSnapshot()).toEqual({})
    expect(storage.data.has('scrpg.session.player')).toBe(false)
    // The game joined is remembered after leaving, to join again.
    expect(again.lastGame()).toEqual({ room: gm.room, at: '2026-10-27T10:00:00.000Z' })
    again.join({ room: 'WXYZ-2345', password: 'pw', heroId: 'h2' })
    expect(again.lastGame()).toEqual({ room: 'WXYZ-2345', password: 'pw', at: '2026-10-27T10:00:00.000Z' })
    expect(changes).toBeGreaterThan(0)
  })

  it('resumes a GM session', () => {
    const net = fakeNetwork()
    const storage = memoryStorage()
    const first = new SessionManager(net.connect, localSessionStore(storage), clock)
    first.host()
    const room = first.getSnapshot().gm!.room
    first.suspend()
    const second = new SessionManager(net.connect, localSessionStore(storage), clock)
    second.resume()
    expect(second.getSnapshot().gm?.room).toBe(room)
    const empty = new SessionManager(net.connect, localSessionStore(memoryStorage()), clock)
    empty.resume()
    expect(empty.getSnapshot()).toEqual({})
  })

  it('stays in a game it’s asked to join again, and forgets a save that can’t start', () => {
    const net = fakeNetwork()
    const storage = memoryStorage()
    const manager = new SessionManager(net.connect, localSessionStore(storage), clock)
    manager.join({ room: 'ABCD-EFGH', heroId: 'h1' })
    const first = manager.getSnapshot().player
    manager.join({ room: 'ABCD-EFGH', heroId: 'h1' })
    expect(manager.getSnapshot().player).toBe(first)
    manager.join({ room: 'ABCD-EFGH', heroId: 'h2' })
    expect(manager.getSnapshot().player).not.toBe(first)

    const broken = new SessionManager(
      () => {
        throw new Error('bad config')
      },
      localSessionStore(storage),
      clock,
    )
    broken.resume()
    expect(broken.getSnapshot()).toEqual({})
    expect(storage.data.has('scrpg.session.player')).toBe(false)
  })
})
