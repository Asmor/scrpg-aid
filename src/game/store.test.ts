import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createGame } from './model'
import { gameToSaved, parseSavedGame } from './serialize'
import { IndexedDbGameStore } from './store'
import { addGroup, addHero, addVillain } from './table'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { GAME_VERSION } from './serialize'

const game = (id: string, updatedAt: string) => ({ ...createGame({ id }), updatedAt })
let n = 0
const clock = { now: new Date('2026-11-01T00:00:00Z'), newId: () => `x${++n}` }

describe('IndexedDbGameStore', () => {
  it('saves, lists newest first, gets, and removes games', async () => {
    const store = new IndexedDbGameStore(new IDBFactory())
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
    const scene = g.scenes[0]!
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, scenes: [{ ...scene, tracker: { green: 0, yellow: 0, red: 0 } }] } })).toEqual({ ok: false, error: `scene ${scene.id} has box counts out of range` })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, scenes: [{ ...scene, position: 8 }] } })).toEqual({ ok: false, error: `scene ${scene.id}'s position is past the last box` })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, scenes: [{ ...scene, state: 'done' }] } }).ok).toBe(false)
    // A scene's reference sheet arrangement is checked too.
    const layout = { pages: [{ kind: 'villain', id: 'v' }], cards: [{ ref: { kind: 'group', id: 'g1' }, breakBefore: 'page' }], omitted: [] }
    expect(parseSavedGame(JSON.parse(JSON.stringify({ ...gameToSaved(g), game: { ...g, scenes: [{ ...scene, sheetLayout: layout }] } }))).ok).toBe(true)
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, scenes: [{ ...scene, sheetLayout: { ...layout, cards: [{ ref: { kind: 'group', id: 'g1' }, breakBefore: 'row' }] } }] } }).ok).toBe(false)
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, scenes: [{ ...scene, sheetLayout: { ...layout, pages: [{ kind: 'scene', id: 'x' }] } }] } }).ok).toBe(false)
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, currentSceneId: 'other' } }).ok).toBe(false)
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, scenes: [scene, { ...scene, state: 'planned' }] } })).toEqual({ ok: false, error: 'game.scenes has two scenes with one id' })
    // A copy must hold a whole sheet and well-formed play state.
    const withHero = addHero(g, { ...completeHero(), id: 'hero' }, clock)
    const h = withHero.heroes[0]!
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, heroes: [{ id: 'h', sourceId: 'hero' }] } }).ok).toBe(false)
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...withHero, heroes: [{ ...h, sheet: { ...h.sheet, method: 'magic' } }] } })).toEqual({ ok: false, error: 'game.heroes[0].sheet.method has an unknown value' })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...withHero, heroes: [{ ...h, play: { ...h.play, reactionUsed: 'x' } }] } })).toEqual({ ok: false, error: 'game.heroes[0].play.reactionUsed should be true or false' })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, heroPoints: -1 } })).toEqual({ ok: false, error: 'game.heroPoints should be at least 0' })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...withHero, heroes: [{ ...h, play: { ...h.play, minions: [{ id: 'm', name: 'Drone', die: 'd8', action: 'attack', mods: [], needsForm: false }] } }] } })).toEqual({ ok: false, error: 'game.heroes[0].play.minions[0].needsForm has an unknown value' })
    const withVillain = addVillain(g, adaptiveBruiser(), clock)
    const v = withVillain.villains[0]!
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...withVillain, villains: [{ ...v, play: { ...v.play, heroCount: 0 } }] } })).toEqual({ ok: false, error: 'game.villains[0].play.heroCount should be at least 1' })
    expect(parseSavedGame({ ...gameToSaved(g), game: { ...g, solo: { kind: 'game', sourceId: 'x' } } })).toEqual({ ok: false, error: 'game.solo.kind has an unknown value' })
    expect(parseSavedGame({ ...gameToSaved(g), version: GAME_VERSION + 1 }).ok).toBe(false)
  })

  it('does not read an older version: there are no real saves to carry forward', () => {
    const g = createGame({ id: 'g' })
    expect(parseSavedGame({ format: 'scrpg-game', version: 2, game: g })).toEqual({ ok: false, error: 'saved by an older version of the app (format 2)' })
  })
})
