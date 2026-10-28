import { describe, expect, it } from 'vitest'
import { newSession } from './gm'
import { readGmMessage, readGmSaved, readPlayerMessage, readPlayerSaved } from './types'

const hero = { name: 'Captain Example', health: 20, maxHealth: 30, zone: 'yellow', mods: [{ id: 'm', label: 'cheer', value: 1 }], twists: [] }

describe('reading messages', () => {
  it('accepts each kind of player message', () => {
    const msgs = [
      { v: 1, type: 'hello', clientId: 'c1', hero },
      { v: 1, type: 'hello', clientId: 'c1' },
      { v: 1, type: 'hero', hero },
      { v: 1, type: 'feed', entries: [{ id: 'e1', at: '2026-10-27T10:00:00.000Z', text: 'Lost 4 HP (30 → 26).' }] },
      { v: 1, type: 'giveMod', id: 'g1', to: 'c2', mod: { label: 'rallied', value: 2, persistent: true } },
      { v: 1, type: 'ack', ids: ['c2:g1'] },
    ]
    for (const m of msgs) expect(readPlayerMessage(m)).toEqual(m)
  })

  it('rejects malformed, unknown, oversized, and other-version messages', () => {
    const bad = [
      null,
      'hello',
      [],
      { type: 'hello', clientId: 'c1' },
      { v: 2, type: 'hello', clientId: 'c1' },
      { v: 1, type: 'shout', text: 'hi' },
      { v: 1, type: 'constructor' },
      { v: 1, type: 'toString' },
      { v: 1, type: 'hello', clientId: '' },
      { v: 1, type: 'hello', clientId: 'x'.repeat(101) },
      { v: 1, type: 'hero', hero: { ...hero, zone: 'blue' } },
      { v: 1, type: 'hero', hero: { ...hero, mods: [{ id: 'm', label: 'x', value: 0 }] } },
      { v: 1, type: 'feed', entries: [{ id: 'e', at: 'now', text: 'x'.repeat(2001) }] },
      { v: 1, type: 'feed', entries: Array.from({ length: 51 }, (_, i) => ({ id: `e${i}`, at: 'now', text: 'x' })) },
      { v: 1, type: 'giveMod', id: 'g', to: 'c2', mod: { label: 'x', value: 99 } },
      { v: 1, type: 'giveMod', id: 'g', to: 'c2', mod: { label: 'x', value: 1.5 } },
      { v: 1, type: 'ack', ids: 'all' },
    ]
    for (const m of bad) expect(readPlayerMessage(m)).toBeUndefined()
  })

  it('accepts the GM’s state, and rejects anything else from the GM', () => {
    const state = { ...newSession('ABCD-EFGH'), members: [{ clientId: 'c1', hero, connected: true }] }
    expect(readGmMessage({ v: 1, type: 'state', state })).toEqual({ v: 1, type: 'state', state })
    expect(readGmMessage({ v: 1, type: 'state', state: { ...state, scene: 'out' } })).toBeUndefined()
    const withVillain = { ...state, villains: [{ id: 'v1', name: 'Ironclad', health: 30, maxHealth: 55, zone: 'yellow', statusDie: 'd8', mods: [], twists: [] }], inbox: [{ id: 'c1:g', to: 'villain:v1', from: 'Ace', mod: { label: 'x', value: -1 } }] }
    expect(readGmMessage({ v: 1, type: 'state', state: withVillain })).toBeTruthy()
    expect(readGmMessage({ v: 1, type: 'state', state: { ...withVillain, villains: [{ id: 'v1', name: 'x', statusDie: 'd7', mods: [], twists: [] }] } })).toBeUndefined()
    expect(readGmMessage({ v: 1, type: 'hello', clientId: 'c1' })).toBeUndefined()
    expect(readGmMessage({ v: 2, type: 'state', state })).toBeUndefined()
    expect(readGmMessage(undefined)).toBeUndefined()
  })

  it('reads saved sessions, rejecting other versions and damaged ones', () => {
    const gm = { v: 1, room: 'ABCD-EFGH', password: 'pw', state: newSession('ABCD-EFGH') }
    expect(readGmSaved(gm)).toEqual(gm)
    expect(readGmSaved({ ...gm, v: 2 })).toBeUndefined()
    expect(readGmSaved({ ...gm, state: { ...gm.state, members: 'none' } })).toBeUndefined()
    const player = { v: 1, room: 'ABCD-EFGH', clientId: 'c1', heroId: 'h1', sharedUpTo: 'x', applied: ['c2:g1'] }
    expect(readPlayerSaved(player)).toEqual(player)
    expect(readPlayerSaved({ ...player, v: undefined })).toBeUndefined()
    expect(readPlayerSaved({ ...player, applied: [1] })).toBeUndefined()
    expect(readPlayerSaved(null)).toBeUndefined()
  })
})
