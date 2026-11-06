import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { completeHero } from '../test/heroes'
import { cacheJoined, IndexedDbJoinedStore, joinedToSaved, MemoryJoinedStore, parseSavedJoined, setIssuePrompt, type JoinedGame } from './joined-store'
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
    expect(parseSavedJoined({ v: 3, joined: joined() }).ok).toBe(false)
    expect(parseSavedJoined({ v: 1, joined: { ...joined(), table: { ...joined().table, heroes: 'x' } } }).ok).toBe(false)
    expect(parseSavedJoined(null).ok).toBe(false)
  })

  it('saves, lists newest first, gets and removes in IndexedDB', async () => {
    const store = new IndexedDbJoinedStore(indexedDB, `joined-test-${Math.random()}`)
    await store.save(joined('g1', '2026-11-01T00:00:00.000Z'))
    await store.save(joined('g2', '2026-11-03T00:00:00.000Z'))
    expect((await store.list()).map((j) => j.id)).toEqual(['g2', 'g1'])
    expect((await store.get('g1'))?.gm).toBe('Sam')
    await store.remove('g1')
    expect(await store.get('g1')).toBeUndefined()
    expect(await store.list()).toHaveLength(1)
  })
})

describe('what a device answered about issues', () => {
  it('survives a new state from the GM', async () => {
    const store = new MemoryJoinedStore()
    const game = joined()
    await store.save(game)
    await setIssuePrompt(store, game.id, 'i1', 'later')
    await cacheJoined(store, { ...game, version: 5 })
    expect(await store.get(game.id)).toMatchObject({ version: 5, issuePrompts: { i1: 'later' } })
  })

  it('does nothing for a game that has gone', async () => {
    const store = new MemoryJoinedStore()
    await setIssuePrompt(store, 'nope', 'i1', 'later')
    expect(await store.list()).toEqual([])
  })

  it('reads an answer it knows, and rejects one it does not', () => {
    expect(parseSavedJoined({ v: 1, joined: { ...joined(), issuePrompts: { i1: 'dismissed' } } }).ok).toBe(true)
    expect(parseSavedJoined({ v: 1, joined: { ...joined(), issuePrompts: { i1: 'yes' } } }).ok).toBe(false)
  })
})

