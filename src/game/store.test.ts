import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createGame } from './model'
import { gameToSaved, parseSavedGame, parseSavedGameJson } from './serialize'
import { IndexedDbGameStore, MemoryGameStore, type GameStore } from './store'
import { addGroup, addVillain } from './table'

const game = (id: string, updatedAt: string) => ({ ...createGame({ id }), updatedAt })
let n = 0
const clock = { now: new Date('2026-11-01T00:00:00Z'), newId: () => `x${++n}` }

describe.each<[string, () => GameStore]>([
  ['MemoryGameStore', () => new MemoryGameStore()],
  ['IndexedDbGameStore', () => new IndexedDbGameStore(new IDBFactory())],
])('%s', (_name, make) => {
  it('saves, lists newest first, gets, and removes games', async () => {
    const store = make()
    await store.save(game('a', '2026-01-01T00:00:00Z'))
    await store.save(game('b', '2026-02-01T00:00:00Z'))
    expect((await store.list()).games.map((g) => g.id)).toEqual(['b', 'a'])
    expect(await store.get('a')).toMatchObject({ status: 'found', game: { id: 'a' } })
    await store.remove('a')
    expect(await store.get('a')).toEqual({ status: 'missing' })
  })
})

describe('the saved game format', () => {
  it('round-trips a game with everything on the table', () => {
    let g = addVillain(createGame({ id: 'g' }), 'v1', 'Gravelord', clock)
    g = addGroup(g, { kind: 'minions', name: 'Drones', die: 'd6', count: 2, hidden: true }, clock)
    g = { ...g, heroes: [{ id: 'h', source: { kind: 'local', heroId: 'hero' } }], tags: ['Campaign', 'campaign'] }
    const result = parseSavedGame(JSON.parse(JSON.stringify(gameToSaved(g))))
    expect(result).toEqual({ ok: true, game: { ...g, tags: ['Campaign'] } })
  })

  it('rejects malformed games', () => {
    const g = createGame({ id: 'g' })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, round: -1 } }).ok).toBe(false)
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, scene: { ...g.scene, tracker: [] } } })).toEqual({ ok: false, error: 'game.scene.tracker has no boxes' })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, scene: { ...g.scene, position: 8 } } })).toEqual({ ok: false, error: 'game.scene.position is past the last box' })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, heroes: [{ id: 'h', source: { kind: 'local' } }] } }).ok).toBe(false)
    expect(parseSavedGame({ ...gameToSaved(g), version: 2 }).ok).toBe(false)
    expect(parseSavedGameJson('nope')).toEqual({ ok: false, error: 'not valid JSON' })
  })
})
