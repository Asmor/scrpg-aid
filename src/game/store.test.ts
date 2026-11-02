import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createGame } from './model'
import { gameToSaved, parseSavedGame, parseSavedGameJson } from './serialize'
import { IndexedDbGameStore, MemoryGameStore, type GameStore } from './store'
import { addGroup, addHero, addVillain } from './table'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { GAME_VERSION } from './serialize'

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
    let g = addVillain(createGame({ id: 'g' }), adaptiveBruiser(), clock)
    g = addGroup(g, { kind: 'minions', name: 'Drones', die: 'd6', count: 2, hidden: true }, clock)
    g = addHero(g, { ...completeHero(), id: 'hero' }, clock, { clientId: 'c1', name: 'Alex' })
    g = { ...g, tags: ['Campaign', 'campaign'], pendingSyncs: [{ heroId: g.heroes[0]!.id, sheet: { ...completeHero(), id: 'hero' }, at: '2026-11-01T00:00:00.000Z' }] }
    const result = parseSavedGame(JSON.parse(JSON.stringify(gameToSaved(g))))
    expect(result).toEqual({ ok: true, game: { ...g, tags: ['Campaign'] } })
  })

  it('rejects malformed games', () => {
    const g = createGame({ id: 'g' })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, round: -1 } }).ok).toBe(false)
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, scene: { ...g.scene, tracker: [] } } })).toEqual({ ok: false, error: 'game.scene.tracker has no boxes' })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, scene: { ...g.scene, position: 8 } } })).toEqual({ ok: false, error: 'game.scene.position is past the last box' })
    // A copy must hold a whole sheet and well-formed play state.
    const withHero = addHero(g, { ...completeHero(), id: 'hero' }, clock)
    const h = withHero.heroes[0]!
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, heroes: [{ id: 'h', sourceId: 'hero' }] } }).ok).toBe(false)
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...withHero, heroes: [{ ...h, sheet: { ...h.sheet, method: 'magic' } }] } })).toEqual({ ok: false, error: 'game.heroes[0].sheet.method has an unknown value' })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...withHero, heroes: [{ ...h, play: { ...h.play, heroPoints: 'x' } }] } })).toEqual({ ok: false, error: 'game.heroes[0].play.heroPoints should be a whole number' })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...withHero, heroes: [{ ...h, play: { ...h.play, minions: [{ id: 'm', name: 'Drone', die: 'd8', action: 'attack', mods: [], needsForm: false }] } }] } })).toEqual({ ok: false, error: 'game.heroes[0].play.minions[0].needsForm has an unknown value' })
    const withVillain = addVillain(g, adaptiveBruiser(), clock)
    const v = withVillain.villains[0]!
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...withVillain, villains: [{ ...v, play: { ...v.play, heroCount: 0 } }] } })).toEqual({ ok: false, error: 'game.villains[0].play.heroCount should be at least 1' })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, solo: { kind: 'game', sourceId: 'x' } } })).toEqual({ ok: false, error: 'game.solo.kind has an unknown value' })
    expect(parseSavedGame({ ...gameToSaved(g), version: GAME_VERSION + 1 }).ok).toBe(false)
    expect(parseSavedGameJson('nope')).toEqual({ ok: false, error: 'not valid JSON' })
  })

  it('reads a version 1 game: its linked heroes and villains leave the table, everything else stays', () => {
    let g = addGroup(createGame({ id: 'g' }), { kind: 'minions', name: 'Drones', die: 'd6', count: 2, hidden: false }, clock)
    const groupRef = { kind: 'group', id: g.groups[0]!.id }
    const v1 = {
      ...g,
      heroes: [{ id: 'h', source: { kind: 'local', heroId: 'hero' } }],
      villains: [{ villainId: 'v1', hidden: false, playersSee: 'status' }],
      pendingSyncs: undefined,
      turn: { order: [{ kind: 'hero', id: 'h' }, { kind: 'villain', id: 'v1' }, groupRef], acted: [{ kind: 'hero', id: 'h' }], current: { kind: 'villain', id: 'v1' } },
    }
    const result = parseSavedGame({ format: 'scrpg-game', version: 1, game: v1 })
    expect(result).toMatchObject({ ok: true, migratedFrom: 1 })
    if (!result.ok) return
    expect(result.game).toMatchObject({ heroes: [], villains: [], pendingSyncs: [], groups: g.groups, turn: { order: [groupRef], acted: [] } })
    expect(result.game.turn.current).toBeUndefined()
    g = result.game
    expect(g.feed).toEqual(v1.feed)
  })
})
