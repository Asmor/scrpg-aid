import { describe, expect, it } from 'vitest'
import { emptyPlay, setHealth } from '../play/state'
import { GmSession, PlayerSession } from './controller'
import { fakeNetwork, type Transport } from './transport'
import type { GmSaved, HeroSummary, PlayerSaved } from './types'

let n = 0
const clock = () => ({ now: new Date('2026-10-27T10:00:00Z'), newId: () => `id${++n}` })
const hero = (name: string): HeroSummary => ({ name, mods: [], twists: [] })
const ROOM = 'ABCD-EFGH'
const player = (net: ReturnType<typeof fakeNetwork>, clientId: string, extra: Partial<PlayerSaved> = {}, save?: (s: PlayerSaved) => void) =>
  new PlayerSession(net.connect, { v: 1, room: ROOM, clientId, heroId: `hero-${clientId}`, applied: [], ...extra }, clock, save)

describe('a session over the network', () => {
  it('connects players to the GM, who tells everyone who’s there', async () => {
    const net = fakeNetwork()
    const saves: GmSaved[] = []
    const gm = new GmSession(net.connect, { room: ROOM }, clock, (s) => saves.push(s))
    const ace = player(net, 'c1')
    ace.updateHero(hero('Ace'))
    const bolt = player(net, 'c2')
    bolt.updateHero(hero('Bolt'))
    expect(ace.getSnapshot().status).toBe('connecting')
    await net.settle()
    expect(gm.state.members.map((m) => [m.clientId, m.hero?.name, m.connected])).toEqual([
      ['c1', 'Ace', true],
      ['c2', 'Bolt', true],
    ])
    for (const p of [ace, bolt]) {
      expect(p.getSnapshot().status).toBe('connected')
      expect(p.getSnapshot().state?.members.map((m) => m.hero?.name)).toEqual(['Ace', 'Bolt'])
    }
    expect(saves.at(-1)?.state).toEqual(gm.state)
  })

  it('sends the hero once it’s known, even after the hello', async () => {
    const net = fakeNetwork()
    const gm = new GmSession(net.connect, { room: ROOM }, clock)
    const ace = player(net, 'c1')
    await net.settle()
    expect(gm.state.members[0]!.hero).toBeUndefined()
    ace.updateHero(hero('Ace'))
    ace.updateHero(hero('Ace'))
    await net.settle()
    expect(gm.state.members[0]!.hero?.name).toBe('Ace')
  })

  it('passes the scene, shared history, and mods between players through the GM', async () => {
    const net = fakeNetwork()
    const gm = new GmSession(net.connect, { room: ROOM }, clock)
    const saved: PlayerSaved[] = []
    const ace = player(net, 'c1', {}, (s) => saved.push(s))
    ace.updateHero(hero('Ace'))
    const bolt = player(net, 'c2')
    bolt.updateHero(hero('Bolt'))
    await net.settle()

    gm.setScene('red')
    await net.settle()
    const synced = ace.sync(emptyPlay())
    expect(synced?.sceneZone).toBe('red')
    expect(ace.sync(synced!)).toBeUndefined()

    // Ace's history reaches the feed; sharing again sends nothing new.
    const history = setHealth(emptyPlay(), { maxHealth: 30, healthRanges: { max: 30, green: [30, 23], yellow: [22, 12], red: [11, 1] } }, 26, clock()).history
    ace.share(history)
    ace.share(history)
    await net.settle()
    expect(gm.state.feed.filter((e) => e.by === 'Ace').map((e) => e.text)).toEqual(['Lost 4 HP (30 → 26).'])
    expect(saved.at(-1)?.sharedUpTo).toBe(history.at(-1)!.id)

    expect(ace.giveMod('c2', { label: 'rallied', value: 2 })).toBe(true)
    await net.settle()
    const boosted = bolt.sync(emptyPlay())
    expect(boosted?.mods).toEqual([{ id: expect.stringMatching(/^c1:/), label: 'rallied', value: 2 }])
    await net.settle()
    // Bolt acknowledged it, so the GM stops holding it.
    expect(gm.state.inbox).toEqual([])
  })

  it('remembers mods already added, so a removed one doesn’t come back', async () => {
    const net = fakeNetwork()
    const gm = new GmSession(net.connect, { room: ROOM }, clock)
    const saved: PlayerSaved[] = []
    const ace = player(net, 'c1', {}, (s) => saved.push(s))
    await net.settle()
    expect(gm.giveMod('c1', { label: 'tied up', value: -3 })).toBe(true)
    expect(gm.giveMod('nobody', { label: 'x', value: 1 })).toBe(false)
    await net.settle()
    const net2 = fakeNetwork()
    // The same inbox, seen again by a player who already added the mod (the ack was lost).
    const gm2 = new GmSession(net2.connect, { room: ROOM, state: gm.state }, clock)
    expect(ace.sync(emptyPlay())?.mods).toHaveLength(1)
    const again = player(net2, 'c1', saved.at(-1))
    await net2.settle()
    expect(again.sync(emptyPlay())?.mods ?? []).toEqual([])
    await net2.settle()
    expect(gm2.state.inbox).toEqual([])
  })

  it('notices when a player or the GM drops, and picks up again when they return', async () => {
    const net = fakeNetwork()
    const gmSaves: GmSaved[] = []
    const gm = new GmSession(net.connect, { room: ROOM }, clock, (s) => gmSaves.push(s))
    const ace = player(net, 'c1')
    ace.updateHero(hero('Ace'))
    await net.settle()
    const [gmPeer, acePeer] = net.peerIds()

    net.disconnect(acePeer!)
    await net.settle()
    expect(gm.state.members[0]!.connected).toBe(false)

    // A reloaded player gets a new peer id but keeps their client id.
    const ace2 = player(net, 'c1')
    await net.settle()
    expect(gm.state.members).toHaveLength(1)
    expect(gm.state.members[0]!.connected).toBe(true)

    net.disconnect(gmPeer!)
    await net.settle()
    expect(ace2.getSnapshot().status).toBe('disconnected')
    expect(ace2.giveMod('c1', { label: 'x', value: 1 })).toBe(false)

    // The GM reloads: same room, saved state, everyone marked away until they say hello.
    const gm2 = new GmSession(net.connect, gmSaves.at(-1)!, clock)
    expect(gm2.state.members[0]!.connected).toBe(false)
    await net.settle()
    expect(ace2.getSnapshot().status).toBe('connected')
    expect(gm2.state.members[0]!.connected).toBe(true)
    expect(gm2.state.feed.filter((e) => e.text.includes('joined'))).toHaveLength(1)
  })

  it('ignores a second peer claiming to be the GM, other rooms, and junk', async () => {
    const net = fakeNetwork()
    const gm = new GmSession(net.connect, { room: ROOM }, clock)
    const ace = player(net, 'c1')
    await net.settle()
    const impostor = net.connect(ROOM)
    impostor.send({ v: 1, type: 'state', state: { ...gm.state, scene: 'red' } })
    impostor.send({ v: 1, type: 'hello' })
    impostor.send('junk')
    await net.settle()
    expect(ace.getSnapshot().state?.scene).toBe('green')
    expect(gm.state.members).toHaveLength(1)

    // A player whose first GM message names another room ignores it.
    const net2 = fakeNetwork()
    const lost = player(net2, 'c9')
    const other = net2.connect(ROOM)
    other.send({ v: 1, type: 'state', state: { ...gm.state, room: 'ZZZZ-ZZZZ' } })
    await net2.settle()
    expect(lost.getSnapshot().status).toBe('connecting')
  })

  it('keeps rooms with different passwords apart, and leaves cleanly', async () => {
    const net = fakeNetwork()
    const gm = new GmSession(net.connect, { room: ROOM, password: 'secret' }, clock)
    const wrong = player(net, 'c1', { password: 'guess' })
    const right = player(net, 'c2', { password: 'secret' })
    await net.settle()
    expect(wrong.getSnapshot().status).toBe('connecting')
    expect(right.getSnapshot().status).toBe('connected')
    expect([gm.room, gm.password, right.room, right.heroId, right.clientId]).toEqual([ROOM, 'secret', ROOM, 'hero-c2', 'c2'])
    right.leave()
    await net.settle()
    expect(gm.state.members.find((m) => m.clientId === 'c2')?.connected).toBe(false)
    gm.removeMember('c2')
    expect(gm.state.members.map((m) => m.clientId)).toEqual([])
  })

  it('holds history back while the GM is away, and shares it when they return', async () => {
    const net = fakeNetwork()
    const saves: GmSaved[] = []
    new GmSession(net.connect, { room: ROOM }, clock, (s) => saves.push(s))
    const ace = player(net, 'c1')
    ace.updateHero(hero('Ace'))
    expect(ace.sync(emptyPlay())).toBeUndefined()
    await net.settle()
    net.disconnect(net.peerIds()[0]!)
    await net.settle()
    const history = [{ id: 'h1', at: 'a', text: 'Took a minor twist: Sprained ankle.' }]
    ace.share(history)
    const gm2 = new GmSession(net.connect, saves.at(-1)!, clock)
    await net.settle()
    ace.share(history)
    await net.settle()
    expect(gm2.state.feed.at(-1)).toMatchObject({ by: 'Ace', text: 'Took a minor twist: Sprained ankle.' })
  })

  it('shares a long history in batches the GM accepts', async () => {
    const net = fakeNetwork()
    const gm = new GmSession(net.connect, { room: ROOM }, clock)
    const ace = player(net, 'c1')
    ace.updateHero(hero('Ace'))
    await net.settle()
    const history = Array.from({ length: 120 }, (_, i) => ({ id: `h${i}`, at: 'a', text: `Entry ${i}` }))
    ace.share(history)
    await net.settle()
    expect(gm.state.feed.filter((e) => e.by === 'Ace')).toHaveLength(120)
  })

  it('finds a reloaded GM who joined before the old connection was noticed gone', async () => {
    const net = fakeNetwork()
    const saves: GmSaved[] = []
    new GmSession(net.connect, { room: ROOM }, clock, (s) => saves.push(s))
    const ace = player(net, 'c1')
    await net.settle()
    const oldGm = net.peerIds()[0]!
    const gm2 = new GmSession(net.connect, saves.at(-1)!, clock)
    await net.settle()
    net.disconnect(oldGm)
    await net.settle()
    expect(ace.getSnapshot().status).toBe('connected')
    expect(gm2.state.members[0]!.connected).toBe(true)
  })

  it('marks a browser’s old self away when it says hello as someone else', async () => {
    const net = fakeNetwork()
    const gm = new GmSession(net.connect, { room: ROOM }, clock)
    const raw = net.connect(ROOM)
    raw.send({ v: 1, type: 'hello', clientId: 'first' })
    await net.settle()
    raw.send({ v: 1, type: 'hello', clientId: 'second' })
    await net.settle()
    expect(gm.state.members.map((m) => [m.clientId, m.connected])).toEqual([
      ['first', false],
      ['second', true],
    ])
  })

  it('does nothing with messages that arrive after leaving', () => {
    // Trystero still delivers for a moment after leave(); the fake network doesn't, so use a stub.
    const handlers: { message?: (m: unknown, p: string) => void; join?: (p: string) => void } = {}
    const sent: unknown[] = []
    const stub: Transport = {
      send: (m) => void sent.push(m),
      onMessage: (h) => void (handlers.message = h),
      onPeerJoin: (h) => void (handlers.join = h),
      onPeerLeave: () => {},
      leave: () => {},
    }
    const saves: GmSaved[] = []
    const gm = new GmSession(() => stub, { room: ROOM }, clock, (s) => saves.push(s))
    const before = gm.state
    gm.leave()
    handlers.message!({ v: 1, type: 'hello', clientId: 'late', hero: hero('Late') }, 'p9')
    handlers.join!('p9')
    expect(gm.state).toBe(before)
    expect(saves).toHaveLength(1)
    expect(sent).toEqual([])
  })

  it('acknowledges mods once per state from the GM', async () => {
    const net = fakeNetwork()
    const gm = new GmSession(net.connect, { room: ROOM }, clock)
    const sent: unknown[] = []
    const ace = new PlayerSession(
      (room, pw) => {
        const t = net.connect(room, pw)
        return { ...t, send: (m, to) => (sent.push(m), t.send(m, to)) }
      },
      { v: 1, room: ROOM, clientId: 'c1', heroId: 'h', applied: [] },
      clock,
    )
    await net.settle()
    gm.giveMod('c1', { label: 'x', value: 1 })
    gm.giveMod('c1', { label: 'y', value: 2 })
    await net.settle()
    // Syncing twice on the same state from the GM acknowledges once.
    const play = ace.sync(emptyPlay())!
    ace.sync(play)
    const acks = () => sent.filter((m) => (m as { type: string }).type === 'ack').length
    expect(acks()).toBe(1)
    // A new state with something waiting is acknowledged again.
    gm.giveMod('c1', { label: 'z', value: 3 })
    await net.settle()
    ace.sync(play)
    expect(acks()).toBe(2)
  })

  it('shows a connection problem until the GM is reached', async () => {
    const net = fakeNetwork()
    let report!: (message: string) => void
    const ace = new PlayerSession(
      (room, pw) => ({ ...net.connect(room, pw), onError: (h) => void (report = h) }),
      { v: 1, room: ROOM, clientId: 'c1', heroId: 'h', applied: [] },
      clock,
    )
    report('could not connect to peer p1')
    expect(ace.getSnapshot()).toMatchObject({ status: 'connecting', error: 'could not connect to peer p1' })
    new GmSession(net.connect, { room: ROOM }, clock)
    await net.settle()
    expect(ace.getSnapshot().status).toBe('connected')
    expect(ace.getSnapshot().error).toBeUndefined()
    report('a later problem')
    expect(ace.getSnapshot().error).toBeUndefined()
  })
})
