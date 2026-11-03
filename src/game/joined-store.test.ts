import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { completeHero } from '../test/heroes'
import { IndexedDbJoinedStore, joinedToSaved, MemoryJoinedStore, parseSavedJoined, type JoinedGame } from './joined-store'
import { createGame } from './model'
import { project } from './project'

const joined = (id = 'g1', updatedAt = '2026-11-03T21:42:00.000Z'): JoinedGame => ({
  id,
  room: 'ABCD-EFGH',
  gm: 'Sam',
  heroId: 'h1',
  heroSourceId: 'maya',
  sheet: completeHero(),
  name: 'Alex',
  since: '2026-10-30T20:00:00.000Z',
  updatedAt,
  version: 4,
  table: project(createGame({ id, name: 'Thursday game' }), 'player'),
})

describe('joined games on a player’s device', () => {
  it('reads back what it saves, and refuses damaged or other-version records', () => {
    const one = joined()
    expect(parseSavedJoined(joinedToSaved(one))).toEqual({ ok: true, doc: one })
    expect(parseSavedJoined({ v: 2, joined: joined() }).ok).toBe(false)
    expect(parseSavedJoined({ v: 1, joined: { ...joined(), table: { ...joined().table, heroes: 'x' } } }).ok).toBe(false)
    expect(parseSavedJoined(null).ok).toBe(false)
  })

  for (const [name, make] of [
    ['in memory', () => new MemoryJoinedStore()],
    ['in IndexedDB', () => new IndexedDbJoinedStore(indexedDB, `joined-test-${Math.random()}`)],
  ] as const) {
    it(`saves, lists newest first, gets and removes ${name}`, async () => {
      const store = make()
      await store.save(joined('g1', '2026-11-01T00:00:00.000Z'))
      await store.save(joined('g2', '2026-11-03T00:00:00.000Z'))
      expect((await store.list()).map((j) => j.id)).toEqual(['g2', 'g1'])
      expect((await store.get('g1'))?.gm).toBe('Sam')
      await store.remove('g1')
      expect(await store.get('g1')).toBeUndefined()
      expect(await store.list()).toHaveLength(1)
    })
  }
})
