import { describe, expect, it } from 'vitest'
import { gmAddVillain, gmGiveMod, gmReceive, gmRemoveMember, gmRemoveVillain, gmSetConnected, gmSetScene, gmShareVillain, gmTakeVillainMods, gmUpdateVillain, memberName, newSession } from './gm'
import { FEED_LIMIT, INBOX_LIMIT, MEMBER_LIMIT, readGmMessage, readGmSaved, type HeroSummary } from './types'

let n = 0
const clock = () => ({ now: new Date('2026-10-27T10:00:00Z'), newId: () => `id${++n}` })
const hero = (name: string): HeroSummary => ({ name, mods: [], twists: [] })
const joined = () => {
  let s = newSession('ABCD-EFGH')
  s = gmReceive(s, 'c1', { v: 1, type: 'hello', clientId: 'c1', hero: hero('Ace') }, clock())
  s = gmReceive(s, 'c2', { v: 1, type: 'hello', clientId: 'c2', hero: hero('Bolt') }, clock())
  return s
}

describe('the GM’s session', () => {
  it('adds players who say hello, once, and notes it in the feed', () => {
    const s = joined()
    expect(s.members.map((m) => [m.clientId, m.hero?.name, m.connected])).toEqual([
      ['c1', 'Ace', true],
      ['c2', 'Bolt', true],
    ])
    expect(s.feed.map((e) => [e.by, e.text])).toEqual([
      ['GM', 'Ace joined the game.'],
      ['GM', 'Bolt joined the game.'],
    ])
    // Saying hello again (after a reload) reconnects without a second "joined", keeping the hero.
    const away = gmSetConnected(s, 'c1', false)
    expect(away.members[0]!.connected).toBe(false)
    const back = gmReceive(away, 'c1', { v: 1, type: 'hello', clientId: 'c1' }, clock())
    expect(back.members[0]).toEqual({ clientId: 'c1', hero: hero('Ace'), connected: true })
    expect(back.feed).toHaveLength(2)
    expect(gmSetConnected(back, 'c1', true)).toBe(back)
    expect(gmSetConnected(back, 'nobody', false)).toBe(back)
  })

  it('updates a hero, and ignores messages from strangers', () => {
    const s = gmReceive(joined(), 'c1', { v: 1, type: 'hero', hero: { ...hero('Ace'), health: 12 } }, clock())
    expect(s.members[0]!.hero?.health).toBe(12)
    const stranger = gmReceive(s, 'zz', { v: 1, type: 'hero', hero: hero('Who') }, clock())
    expect(stranger).toBe(s)
    expect(gmReceive(s, 'zz', { v: 1, type: 'feed', entries: [{ id: 'e', at: 'x', text: 'hi' }] }, clock())).toBe(s)
    expect(memberName({})).toBe('A player')
  })

  it('adds shared history to the feed once, and keeps only the latest entries', () => {
    const entry = { id: 'e1', at: '2026-10-27T10:01:00.000Z', text: 'Used ability Inflict:', details: ['Max: 7 (Fire d8)'] }
    let s = gmReceive(joined(), 'c1', { v: 1, type: 'feed', entries: [entry] }, clock())
    s = gmReceive(s, 'c1', { v: 1, type: 'feed', entries: [entry] }, clock())
    expect(s.feed.at(-1)).toEqual({ id: 'c1:e1', at: '2026-10-27T10:00:00.000Z', by: 'Ace', text: entry.text, details: entry.details })
    expect(s.feed).toHaveLength(3)
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `x${i}`, at: 'x', text: `${i}` }))
    for (let i = 0; i < 5; i++) s = gmReceive(s, 'c2', { v: 1, type: 'feed', entries: many.map((e) => ({ ...e, id: `${e.id}-${i}` })) }, clock())
    expect(s.feed).toHaveLength(FEED_LIMIT)
    expect(s.feed.at(-1)?.text).toBe('49')
  })

  it('holds mods given to a player until their browser acknowledges them', () => {
    let s = gmReceive(joined(), 'c1', { v: 1, type: 'giveMod', id: 'g1', to: 'c2', mod: { label: 'rallied', value: 2 } }, clock())
    expect(s.inbox).toEqual([{ id: 'c1:g1', to: 'c2', from: 'Ace', mod: { label: 'rallied', value: 2 } }])
    // Sent twice, held once; to someone who isn't here, ignored.
    expect(gmReceive(s, 'c1', { v: 1, type: 'giveMod', id: 'g1', to: 'c2', mod: { label: 'rallied', value: 2 } }, clock())).toBe(s)
    expect(gmReceive(s, 'c1', { v: 1, type: 'giveMod', id: 'g2', to: 'zz', mod: { label: 'x', value: 1 } }, clock())).toBe(s)
    s = gmGiveMod(s, 'c2', { label: 'tied up', value: -3 }, clock())
    expect(s.inbox.at(-1)).toMatchObject({ to: 'c2', from: 'GM', mod: { label: 'tied up', value: -3 } })
    expect(gmGiveMod(s, 'zz', { label: 'x', value: 1 }, clock())).toBe(s)
    expect(gmGiveMod(s, 'c2', { label: 'x', value: 0 }, clock())).toBe(s)
    // Only the recipient can acknowledge.
    expect(gmReceive(s, 'c1', { v: 1, type: 'ack', ids: ['c1:g1'] }, clock()).inbox).toHaveLength(2)
    expect(gmReceive(s, 'c2', { v: 1, type: 'ack', ids: s.inbox.map((i) => i.id) }, clock()).inbox).toEqual([])
  })

  it('sets the scene, noting it in the feed', () => {
    const s = gmSetScene(joined(), 'yellow', clock())
    expect(s.scene).toBe('yellow')
    expect(s.feed.at(-1)).toMatchObject({ by: 'GM', text: 'The GM set the scene to Yellow.' })
    expect(gmSetScene(s, 'yellow', clock())).toBe(s)
  })

  it('removes a player, with mods still waiting for them', () => {
    let s = gmGiveMod(joined(), 'c2', { label: 'x', value: 1 }, clock())
    s = gmRemoveMember(s, 'c2', clock())
    expect(s.members.map((m) => m.clientId)).toEqual(['c1'])
    expect(s.inbox).toEqual([])
    expect(s.feed.at(-1)?.text).toBe('Bolt was removed from the game.')
    expect(gmRemoveMember(s, 'c2', clock())).toBe(s)
  })

  it('changes nothing for a repeated hello or an empty ack', () => {
    const s = joined()
    expect(gmReceive(s, 'c1', { v: 1, type: 'hello', clientId: 'c1', hero: hero('Ace') }, clock())).toBe(s)
    expect(gmReceive(s, 'c1', { v: 1, type: 'ack', ids: ['nothing'] }, clock())).toBe(s)
  })

  it('stays within the limits players accept', () => {
    let s = newSession('ABCD-EFGH')
    for (let i = 0; i < MEMBER_LIMIT + 5; i++) s = gmReceive(s, `c${i}`, { v: 1, type: 'hello', clientId: `c${i}` }, clock())
    expect(s.members).toHaveLength(MEMBER_LIMIT)
    for (let i = 0; i < INBOX_LIMIT + 5; i++) s = gmGiveMod(s, 'c0', { label: 'x', value: 1 }, clock())
    expect(s.inbox).toHaveLength(INBOX_LIMIT)
    expect(gmReceive(s, 'c1', { v: 1, type: 'giveMod', id: 'g', to: 'c0', mod: { label: 'x', value: 1 } }, clock())).toBe(s)
  })

  it('announces a player once their hero is known', () => {
    let s = gmReceive(newSession('ABCD-EFGH'), 'c1', { v: 1, type: 'hello', clientId: 'c1' }, clock())
    expect(s.feed).toEqual([])
    s = gmReceive(s, 'c1', { v: 1, type: 'hero', hero: hero('Ace') }, clock())
    s = gmReceive(s, 'c1', { v: 1, type: 'hero', hero: { ...hero('Ace'), health: 3 } }, clock())
    expect(s.feed.map((e) => e.text)).toEqual(['Ace joined the game.'])
  })

  it('adds villains to the game, updates and shares them, and holds mods players give them', () => {
    const villain = { id: 'v1', name: 'Ironclad', health: 55, maxHealth: 55, zone: 'green' as const, statusDie: 'd6' as const, mods: [], twists: [] }
    let s = gmAddVillain(joined(), { ...villain, sharedUpTo: 'old' }, clock())
    expect(s.villains).toEqual([{ ...villain, sharedUpTo: 'old' }])
    expect(s.feed.at(-1)?.text).toBe('Ironclad joined the scene.')
    expect(gmAddVillain(s, villain, clock())).toBe(s)
    // A player's Hinder on the villain waits in the inbox for its Play page.
    s = gmReceive(s, 'c1', { v: 1, type: 'giveMod', id: 'g1', to: 'villain:v1', mod: { label: 'tangled', value: -2 } }, clock())
    expect(s.inbox).toEqual([{ id: 'c1:g1', to: 'villain:v1', from: 'Ace', mod: { label: 'tangled', value: -2 } }])
    expect(gmReceive(s, 'c1', { v: 1, type: 'giveMod', id: 'g2', to: 'villain:nobody', mod: { label: 'x', value: 1 } }, clock())).toBe(s)
    const taken = gmTakeVillainMods(s, 'v1')
    expect(taken.mods.map((m) => m.id)).toEqual(['c1:g1'])
    expect(taken.state.inbox).toEqual([])
    expect(gmTakeVillainMods(taken.state, 'v1').state).toBe(taken.state)
    s = gmUpdateVillain(taken.state, { ...villain, health: 30, zone: 'yellow' })
    expect(s.villains![0]).toMatchObject({ health: 30, zone: 'yellow', sharedUpTo: 'old' })
    expect(gmUpdateVillain(s, { ...villain, health: 30, zone: 'yellow' })).toBe(s)
    expect(gmUpdateVillain(s, { ...villain, id: 'nobody' })).toBe(s)
    s = gmShareVillain(s, 'v1', [{ id: 'h1', at: 'x', text: 'Lost 25 HP (55 → 30).' }], 'h1', clock())
    expect(s.feed.at(-1)).toMatchObject({ id: 'villain:v1:h1', by: 'Ironclad', text: 'Lost 25 HP (55 → 30).' })
    expect(gmShareVillain(s, 'v1', [], 'h1', clock())).toBe(s)
    s = gmGiveMod(s, 'c1', { label: 'x', value: 1 }, clock())
    s = gmReceive(s, 'c2', { v: 1, type: 'giveMod', id: 'g3', to: 'villain:v1', mod: { label: 'y', value: -1 } }, clock())
    s = gmRemoveVillain(s, 'v1', clock())
    expect(s.villains).toEqual([])
    expect(s.inbox.map((i) => i.to)).toEqual(['c1'])
    expect(s.feed.at(-1)?.text).toBe('Ironclad left the scene.')
    expect(gmRemoveVillain(s, 'v1', clock())).toBe(s)
  })

  it('keeps the GM’s own villain data within what players accept', () => {
    const long = 'x'.repeat(5000)
    const villain = { id: 'v1', name: long, mods: [{ id: 'm', label: long, value: -2 }], twists: [{ id: 't', kind: 'minor' as const, text: long }] }
    let s = gmAddVillain(joined(), villain, clock())
    s = gmUpdateVillain(s, villain)
    s = gmShareVillain(s, 'v1', [{ id: 'h', at: 'x', text: long, details: Array.from({ length: 80 }, () => long) }], 'h', clock())
    s = gmGiveMod(s, 'c1', { label: long, value: 1 }, clock())
    expect(readGmMessage({ v: 1, type: 'state', state: s })).toBeTruthy()
    expect(readGmSaved({ v: 1, room: s.room, state: s })).toBeTruthy()
  })

  it('won’t take a player whose id names a villain', () => {
    const s = joined()
    expect(gmReceive(s, 'villain:v1', { v: 1, type: 'hello', clientId: 'villain:v1' }, clock())).toBe(s)
  })

  it('refuses ids that would grow past what players accept', () => {
    const s = joined()
    const long = 'x'.repeat(99)
    expect(gmReceive(s, 'c1', { v: 1, type: 'giveMod', id: long, to: 'c2', mod: { label: 'x', value: 1 } }, clock())).toBe(s)
    expect(gmReceive(s, 'c1', { v: 1, type: 'feed', entries: [{ id: long, at: 'x', text: 'hi' }] }, clock()).feed).toEqual(s.feed)
  })
})

