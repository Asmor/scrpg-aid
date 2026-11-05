import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { createGame, type Game } from '../game/model'
import { MemoryGameStore } from '../game/store'
import { addChallenge, addVillain, setChallengeStep } from '../game/table'
import type { Hero } from '../hero/model'
import { currentHealth } from '../play/state'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { HostSession, type HostSaved } from './host'
import { readHostMessage, type HostMessage } from './protocol'
import { fakeNetwork } from './transport'

let n = 0
const clock = () => ({ now: new Date('2026-11-03T21:00:00Z'), newId: () => `id${++n}` })
const ROOM = 'ABCD-EFGH'

const maya = (): Hero => ({ ...completeHero(), id: 'maya-src', details: { ...completeHero().details, name: 'Maya Reyes' } })

/** A device on the network that records what the GM's device sends it. */
function client(net: ReturnType<typeof fakeNetwork>) {
  const got: HostMessage[] = []
  const t = net.connect(ROOM)
  t.onMessage((raw) => {
    const msg = readHostMessage(raw)
    if (msg) got.push(msg)
  })
  return {
    got,
    send: (msg: unknown) => t.send(msg),
    leave: () => t.leave(),
    last: <T extends HostMessage['type']>(type: T) => got.filter((m): m is Extract<HostMessage, { type: T }> => m.type === type).at(-1),
  }
}

const hello = (clientId: string, sheet: Hero = maya(), name = 'Alex') => ({ v: 6, type: 'hello', role: 'player', clientId, name, heroSourceId: sheet.id, sheet })

async function setup(game: Game = createGame({ id: 'g', name: 'Thursday game' })) {
  const net = fakeNetwork()
  const store = new MemoryGameStore()
  await store.save(game)
  const saves: HostSaved[] = []
  const host = new HostSession(net.connect, { room: ROOM, gameId: game.id, gm: 'Sam', removed: [] }, store, clock, (s) => saves.push(s))
  return { net, store, host, saves }
}

describe('hosting a game', () => {
  it("copies a joining player's hero in with fresh play state, and sends them the game", async () => {
    const { net, host, store } = await setup()
    const alex = client(net)
    alex.send(hello('c1'))
    await net.settle()
    const hero = host.game!.heroes[0]!
    expect(hero).toMatchObject({ sourceId: 'maya-src', player: { clientId: 'c1', name: 'Alex', since: '2026-11-03T21:00:00.000Z' } })
    expect(hero.play.health).toBeUndefined()
    expect(host.getSnapshot().connected).toEqual(new Set(['c1']))
    const state = alex.last('state')!
    expect(state).toMatchObject({ room: ROOM, gm: 'Sam', you: { heroId: hero.id, since: '2026-11-03T21:00:00.000Z' } })
    expect(state.table.heroes[0]!.player).toEqual({ name: 'Alex', since: '2026-11-03T21:00:00.000Z' })
    await net.settle()
    const saved = await store.get('g')
    expect(saved.status === 'found' && saved.game.heroes).toHaveLength(1)
  })

  it("sends each player their own Overcome requests and closed lines, and observers none", async () => {
    const { net, host } = await setup(addChallenge(createGame({ id: 'g', name: 'Thursday game' }), { name: 'Furnace', steps: 1, hidden: false, whenDone: 'It stops.' }, clock()))
    const alex = client(net)
    const bo = client(net)
    const tv = client(net)
    alex.send(hello('c1'))
    bo.send(hello('c2', { ...maya(), id: 'bo-src', details: { ...maya().details, name: 'Paradigm' } }, 'Bo'))
    tv.send({ v: 6, type: 'hello', role: 'observer', clientId: 'tv', screenName: 'TV' })
    await net.settle()
    const heroOf = (src: string) => host.game!.heroes.find((h) => h.sourceId === src)!.id
    const challengeId = host.game!.challenges[0]!.id
    const requests = (who: ReturnType<typeof client>) => who.last('state')!.table.challenges[0]!.requests
    alex.send({ v: 6, type: 'action', id: 'a1', heroId: heroOf('maya-src'), action: { kind: 'overcomeChallenge', challengeId, total: 9, trait: 'Agility' }, basedOn: 0 })
    await net.settle()
    expect(alex.last('result')).toMatchObject({ id: 'a1', ok: true })
    expect(requests(alex).map((r) => r.total)).toEqual([9])
    expect(requests(bo)).toEqual([])
    expect(requests(tv)).toEqual([])
    expect(alex.last('state')!.table.challenges[0]!.whenDone).toBeUndefined()

    host.apply((g) => setChallengeStep(g, challengeId, 0, true, clock()))
    await net.settle()
    const closed = (who: ReturnType<typeof client>) => who.last('state')!.table.feed.filter((e) => e.text === 'The GM closed this challenge before answering.')
    expect(closed(alex)).toHaveLength(1)
    expect(closed(bo)).toEqual([])
    expect(closed(tv)).toEqual([])
    expect(tv.last('state')!.table.challenges[0]!.whenDone).toBe('It stops.')
  })

  it('picks the game’s copy back up when the same player rejoins, keeping its play state', async () => {
    const { net, host } = await setup()
    const alex = client(net)
    alex.send(hello('c1'))
    await net.settle()
    const heroId = host.game!.heroes[0]!.id
    alex.send({ v: 6, type: 'action', id: 'a1', heroId, action: { kind: 'health', by: -5 }, basedOn: 1 })
    await net.settle()
    alex.leave()
    await net.settle()
    expect(host.getSnapshot().connected.size).toBe(0)
    const again = client(net)
    again.send(hello('c1', { ...maya(), details: { ...maya().details, name: 'Maya R.' } }, 'Alex B'))
    await net.settle()
    expect(host.game!.heroes).toHaveLength(1)
    // The game's copy is kept (the new sheet only comes in through a sync request); the name follows the player.
    expect(host.game!.heroes[0]!.sheet.details.name).toBe('Maya Reyes')
    expect(host.game!.heroes[0]!.player!.name).toBe('Alex B')
    const sheet = buildSheet(host.game!.heroes[0]!.sheet)
    expect(currentHealth(sheet, host.game!.heroes[0]!.play)).toBe(sheet.maxHealth! - 5)
    expect(again.last('state')!.you!.heroId).toBe(heroId)
  })

  it('refuses a hero being played on another connected device, and lets another device take over once it has gone', async () => {
    const { net, host } = await setup()
    const alex = client(net)
    alex.send(hello('c1'))
    await net.settle()
    const other = client(net)
    other.send(hello('c2'))
    await net.settle()
    expect(other.last('refused')).toMatchObject({ reason: 'taken' })
    alex.leave()
    await net.settle()
    other.send(hello('c2'))
    await net.settle()
    expect(host.game!.heroes[0]!.player!.clientId).toBe('c2')
  })

  it('applies an action, sending the new state and then the result', async () => {
    const { net, host } = await setup()
    const alex = client(net)
    alex.send(hello('c1'))
    await net.settle()
    const heroId = host.game!.heroes[0]!.id
    const versionBefore = host.getSnapshot().version
    alex.send({ v: 6, type: 'action', id: 'a1', heroId, action: { kind: 'heroPoints', by: 1 }, basedOn: versionBefore })
    await net.settle()
    expect(host.game!.heroes[0]!.play.heroPoints).toBe(1)
    expect(host.getSnapshot().version).toBe(versionBefore + 1)
    const types = alex.got.slice(-2).map((m) => m.type)
    expect(types).toEqual(['state', 'result'])
    expect(alex.last('result')).toEqual({ v: 6, type: 'result', id: 'a1', ok: true })
    expect(alex.last('state')!.table.heroes[0]!.play.heroPoints).toBe(1)
  })

  it('answers an action sent again without applying it twice', async () => {
    const { net, host } = await setup()
    const alex = client(net)
    alex.send(hello('c1'))
    await net.settle()
    const heroId = host.game!.heroes[0]!.id
    const action = { v: 6, type: 'action', id: 'a1', heroId, action: { kind: 'heroPoints', by: 1 }, basedOn: 0 }
    alex.send(action)
    alex.send(action)
    await net.settle()
    expect(host.game!.heroes[0]!.play.heroPoints).toBe(1)
    expect(alex.got.filter((m) => m.type === 'result')).toEqual([
      { v: 6, type: 'result', id: 'a1', ok: true },
      { v: 6, type: 'result', id: 'a1', ok: true },
    ])
  })

  it("refuses an action with a reason, and one for someone else's hero", async () => {
    const { net, host } = await setup()
    const alex = client(net)
    alex.send(hello('c1'))
    const sam = client(net)
    sam.send(hello('c2', { ...completeHero(), id: 'jo-src' }, 'Sam'))
    await net.settle()
    const heroId = host.game!.heroes[0]!.id
    alex.send({ v: 6, type: 'action', id: 'a1', heroId, action: { kind: 'heroPoints', by: -1 }, basedOn: 0 })
    sam.send({ v: 6, type: 'action', id: 'a2', heroId, action: { kind: 'heroPoints', by: 1 }, basedOn: 0 })
    await net.settle()
    expect(alex.last('result')).toEqual({ v: 6, type: 'result', id: 'a1', ok: false, reason: 'you have no hero points to spend' })
    expect(sam.last('result')).toEqual({ v: 6, type: 'result', id: 'a2', ok: false, reason: "that hero isn't yours" })
    expect(host.game!.heroes[0]!.play.heroPoints).toBe(0)
  })

  it('refuses setting Health the player had not seen change', async () => {
    const { net, host } = await setup()
    const alex = client(net)
    alex.send(hello('c1'))
    await net.settle()
    const heroId = host.game!.heroes[0]!.id
    const seen = host.getSnapshot().version
    host.apply((g) => ({ ...g, heroes: g.heroes.map((h) => ({ ...h, play: { ...h.play, health: 14 } })) }))
    alex.send({ v: 6, type: 'action', id: 'a1', heroId, action: { kind: 'setHealth', value: 20 }, basedOn: seen })
    await net.settle()
    expect(alex.last('result')).toMatchObject({ ok: false, reason: 'your Health had already changed to 14. Check it and try again' })
  })

  it("never sends players hidden things or the GM's notes", async () => {
    const game = { ...addVillain(createGame({ id: 'g' }), adaptiveBruiser(), clock(), true), notes: 'secret plan' }
    const { net } = await setup(game)
    const alex = client(net)
    alex.send(hello('c1'))
    await net.settle()
    const json = JSON.stringify(alex.got)
    expect(json).not.toContain('secret plan')
    expect(json).not.toContain(game.villains[0]!.id)
  })

  it('takes sync requests into the game, one per hero, and approves or declines them', async () => {
    const { net, host } = await setup()
    const alex = client(net)
    alex.send(hello('c1'))
    await net.settle()
    const heroId = host.game!.heroes[0]!.id
    const changed = { ...maya(), details: { ...maya().details, name: 'Maya Reyes II' } }
    alex.send({ v: 6, type: 'syncRequest', heroId, sheet: maya() })
    alex.send({ v: 6, type: 'syncRequest', heroId, sheet: changed })
    await net.settle()
    expect(host.game!.pendingSyncs).toMatchObject([{ heroId, sheet: { details: { name: 'Maya Reyes II' } } }])
    expect(host.game!.feed.at(-1)).toMatchObject({ gmOnly: true, text: 'Alex asked to update Maya Reyes to match their sheet.' })
    // Players never see the request.
    expect(JSON.stringify(alex.last('state'))).not.toContain('Maya Reyes II')

    host.declineSync(heroId)
    await net.settle()
    expect(host.game!.pendingSyncs).toEqual([])
    expect(alex.last('syncResult')).toEqual({ v: 6, type: 'syncResult', heroId, approved: false, adjustments: [] })
    expect(host.game!.heroes[0]!.sheet.details.name).toBe('Maya Reyes')

    alex.send({ v: 6, type: 'syncRequest', heroId, sheet: changed })
    await net.settle()
    host.approveSync(heroId)
    await net.settle()
    expect(host.game!.heroes[0]!.sheet.details.name).toBe('Maya Reyes II')
    expect(host.game!.pendingSyncs).toEqual([])
    expect(alex.last('syncResult')).toMatchObject({ heroId, approved: true })
  })

  it('cancels a sync request', async () => {
    const { net, host } = await setup()
    const alex = client(net)
    alex.send(hello('c1'))
    await net.settle()
    const heroId = host.game!.heroes[0]!.id
    alex.send({ v: 6, type: 'syncRequest', heroId, sheet: maya() })
    alex.send({ v: 6, type: 'syncCancel', heroId })
    await net.settle()
    expect(host.game!.pendingSyncs).toEqual([])
    expect(host.game!.feed.at(-1)).toMatchObject({ gmOnly: true, text: 'The request to update Maya Reyes was cancelled.' })
  })

  it('removes a player and their hero, and refuses them from then on', async () => {
    const { net, host, saves } = await setup()
    const alex = client(net)
    alex.send(hello('c1'))
    await net.settle()
    host.removePlayer(host.game!.heroes[0]!.id)
    await net.settle()
    expect(host.game!.heroes).toEqual([])
    expect(alex.last('removed')).toBeDefined()
    expect(saves.at(-1)!.removed).toEqual(['c1'])
    alex.send(hello('c1'))
    await net.settle()
    expect(host.game!.heroes).toEqual([])
    expect(alex.last('refused')).toMatchObject({ reason: 'removed' })
  })

  it('tells a peer on an older version to update, and ignores junk', async () => {
    const { net } = await setup()
    const old = client(net)
    old.send({ v: 1, type: 'hello', clientId: 'c9' })
    old.send('junk')
    await net.settle()
    expect(old.got).toEqual([{ v: 6, type: 'refused', reason: 'version' }])
  })

  it("handles a hello that arrives before the game has loaded, and says when the game can't be found", async () => {
    const net = fakeNetwork()
    const store = new MemoryGameStore()
    await store.save(createGame({ id: 'g' }))
    const alex = client(net)
    const host = new HostSession(net.connect, { room: ROOM, gameId: 'g', gm: 'Sam', removed: [] }, store, clock)
    alex.send(hello('c1'))
    await net.settle()
    expect(host.game!.heroes).toHaveLength(1)
    const missing = new HostSession(fakeNetwork().connect, { room: ROOM, gameId: 'nope', gm: 'Sam', removed: [] }, store, clock)
    await new Promise((r) => setTimeout(r, 0))
    expect(missing.getSnapshot().error).toBe('The game was deleted.')
    // And it takes no one in.
    const net2 = fakeNetwork()
    const gone = new HostSession(net2.connect, { room: ROOM, gameId: 'nope', gm: 'Sam', removed: [] }, store, clock)
    await new Promise((r) => setTimeout(r, 0))
    const late = client(net2)
    late.send(hello('c1'))
    await net2.settle()
    expect(late.got).toEqual([])
    expect(gone.game).toBeUndefined()
  })

  it('applies the GM’s own changes, saving each one and counting versions', async () => {
    const { net, host, store } = await setup()
    await net.settle()
    host.apply((g) => ({ ...g, notes: 'one' }))
    host.apply((g) => g)
    host.apply((g) => ({ ...g, notes: 'two' }))
    await net.settle()
    await new Promise((r) => setTimeout(r, 0))
    expect(host.getSnapshot().version).toBe(2)
    const saved = await store.get('g')
    expect(saved.status === 'found' && saved.game.notes).toBe('two')
  })
})
