import { describe, expect, it } from 'vitest'
import { addMod, emptyPlay, setHealth } from '../play/state'
import { completeHero, minionMakerHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { isListedGame } from './model'
import { createSoloGame, refreshSolo, soloGameId, soloHero, soloVillain, startOverSolo } from './solo'
import { changeHeroPlay, changeVillainPlay } from './table'
import { gamesHolding } from './useGameEditor'

let n = 0
const clock = { now: new Date('2026-11-01T12:00:00Z'), newId: () => `id${++n}` }

describe('solo games', () => {
  it('hold one copied character at fresh play state, under a fixed id, and are not listed', () => {
    const hero = { ...completeHero(), id: 'maya' }
    const game = createSoloGame('hero', hero, clock)
    expect(game.id).toBe(soloGameId('hero', 'maya'))
    expect(game.solo).toEqual({ kind: 'hero', sourceId: 'maya' })
    expect(soloHero(game)).toMatchObject({ sourceId: 'maya', sheet: hero, play: emptyPlay() })
    expect(isListedGame(game)).toBe(false)
    expect(gamesHolding([game], 'hero', 'maya')).toEqual([])
    const villain = createSoloGame('villain', adaptiveBruiser(), clock)
    expect(soloVillain(villain)).toMatchObject({ sourceId: 'v1', hidden: false })
    expect(soloHero(villain)).toBeUndefined()
  })

  it('re-copy a changed sheet with reconcile, logging the adjustments', () => {
    const before = minionMakerHero()
    let game = createSoloGame('hero', before, clock)
    const id = soloHero(game)!.id
    game = changeHeroPlay(game, id, (p) => ({ ...p, minions: [{ id: 'm', name: 'Drone', die: 'd8', action: 'attack', form: 'Explosive', mods: [] }] }), clock, false)
    const after = minionMakerHero()
    after.archetype!.minionForms = { ...after.archetype!.minionForms!, forms: ['Autonomous'] }
    const next = refreshSolo(game, after, clock)
    const copy = soloHero(next)!
    expect(copy.sheet).toEqual(after)
    expect(copy.play.minions![0]!.needsForm).toBe(true)
    expect(copy.play.history.at(-1)).toMatchObject({ text: 'The sheet was updated from your sheet.', details: [expect.stringMatching(/^Drone \(d8\) needs a new form/)] })
    // Nothing changed now.
    expect(refreshSolo(next, after, clock)).toBe(next)
  })

  it('copy other changes quietly, and follow a rename', () => {
    const hero = completeHero()
    const game = createSoloGame('hero', hero, clock)
    const costume = { ...hero, details: { ...hero.details, costume: 'Red cape' } }
    const next = refreshSolo(game, costume, clock)
    expect(soloHero(next)!.sheet.details.costume).toBe('Red cape')
    expect(soloHero(next)!.play.history).toEqual([])
    const renamed = refreshSolo(next, { ...costume, details: { ...costume.details, name: 'Maya R.' } }, clock)
    expect(renamed.name).toBe('Maya R.')
    // Villains too.
    const v = createSoloGame('villain', adaptiveBruiser(), clock)
    const fewer = { ...adaptiveBruiser(), heroCount: 3 }
    let hurt = changeVillainPlay(v, soloVillain(v)!.id, (p) => setHealth(p, { maxHealth: 55 }, 54, clock), clock, false)
    hurt = refreshSolo(hurt, fewer, clock)
    expect(soloVillain(hurt)!.play.health).toBe(50)
  })

  it('start over: fresh play state and an empty log, the sheet untouched', () => {
    let game = createSoloGame('hero', completeHero(), clock)
    const id = soloHero(game)!.id
    game = changeHeroPlay(game, id, (p) => addMod({ ...p, heroPoints: 2, form: 'form:0', health: 3 }, { label: 'x', value: 1 }, clock), clock)
    const fresh = startOverSolo(game)
    expect(soloHero(fresh)!.play).toEqual(emptyPlay())
    expect(soloHero(fresh)!.sheet).toEqual(soloHero(game)!.sheet)
    expect(fresh.feed).toEqual([])
  })
})
