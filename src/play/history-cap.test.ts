/** Every history appender keeps at most HISTORY_LIMIT entries, the newest (review 2026-11-09, item 5). */
import { describe, expect, it } from 'vitest'
import { createGame } from '../game/model'
import { addHero, addVillain, updateSheet } from '../game/table'
import type { PlayHistoryEntry, PlayState } from '../hero/model'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { emptyVillainPlay, setStatusCount } from '../villain/play'
import { recordMinionRoll } from './minions'
import { confirmRoll, rollChange, undoRoll } from './roll'
import { appendHistory, emptyPlay, HISTORY_LIMIT, setReactionUsed, type Clock } from './state'

let n = 0
const clock = (): Clock => ({ now: new Date('2026-11-09T12:00:00Z'), newId: () => `id${++n}` })
const old = (count: number): PlayHistoryEntry[] => Array.from({ length: count }, (_, i) => ({ id: `old${i}`, at: '2026-11-01T00:00:00Z', text: `Old ${i}` }))
const full = (): PlayState => ({ ...emptyPlay(), history: old(HISTORY_LIMIT) })

/** A full history after one change: the same length, the oldest gone, and something new at the end. */
function expectCapped(history: readonly PlayHistoryEntry[], added = 1) {
  expect(history).toHaveLength(HISTORY_LIMIT)
  expect(history[0]!.id).toBe(`old${added}`)
  expect(history.at(-1)!.id).not.toMatch(/^old/)
}

describe('appendHistory', () => {
  it('adds below the limit, and keeps the newest once over it', () => {
    expect(appendHistory(old(2), ...old(1))).toHaveLength(3)
    expect(appendHistory(old(HISTORY_LIMIT - 1), { id: 'new', at: '', text: 'New' })).toHaveLength(HISTORY_LIMIT)
    const over = appendHistory(old(HISTORY_LIMIT), { id: 'a', at: '', text: 'A' }, { id: 'b', at: '', text: 'B' }, { id: 'c', at: '', text: 'C' })
    expect(over).toHaveLength(HISTORY_LIMIT)
    expect(over[0]!.id).toBe('old3')
    expect(over.slice(-3).map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('each appender keeps the cap', () => {
  it('a plain change', () => {
    expectCapped(setReactionUsed(full(), true, clock()).history)
  })

  it('a roll, and its Undo note in a shared game', () => {
    const before = full()
    const rolled = confirmRoll(before, { title: 'Attack', rolled: [{ label: 'Speed', die: 'd8', value: 5 }], results: [{ action: 'attack', use: 'mid', base: 5, mods: [], total: 5 }], manual: false }, clock())
    expectCapped(rolled.history)
    const undone = undoRoll(rolled, rollChange(before, rolled, 'Attack'), clock())
    expect(undone.history).toHaveLength(HISTORY_LIMIT)
    expect(undone.history.at(-1)!.text).toBe('Undid: Attack')
  })

  it("a minion's roll, with the mods it used up", () => {
    const mod = { id: 'once', label: 'Aim', value: 1 }
    const play: PlayState = { ...full(), minions: [{ id: 'm', name: 'Drone', die: 'd6', action: 'attack', mods: [mod] }] }
    const after = recordMinionRoll(play, 'm', { action: 'attack', value: 4, mods: [mod] }, clock())
    expect(after.history).toHaveLength(HISTORY_LIMIT)
    expect(after.history.at(-1)!.id).not.toMatch(/^old/)
  })

  it("a villain's status note", () => {
    expectCapped(setStatusCount({ ...emptyVillainPlay(), history: old(HISTORY_LIMIT) }, 3, clock()).history)
  })

  it("a sheet update, for a hero's and a villain's copy", () => {
    const c = clock()
    let g = addVillain(addHero(createGame({ id: 'g' }), completeHero(), c), adaptiveBruiser(), c, false)
    g = { ...g, heroes: g.heroes.map((h) => ({ ...h, play: { ...h.play, history: old(HISTORY_LIMIT) } })), villains: g.villains.map((v) => ({ ...v, play: { ...v.play, history: old(HISTORY_LIMIT) } })) }
    const hero = completeHero()
    const heroed = updateSheet(g, { kind: 'hero', id: g.heroes[0]!.id, sheet: { ...hero, details: { ...hero.details, name: 'Renamed' } } }, c)
    expectCapped(heroed.heroes[0]!.play.history)
    const villain = adaptiveBruiser()
    const villained = updateSheet(g, { kind: 'villain', id: g.villains[0]!.id, sheet: { ...villain, details: { ...villain.details, name: 'Renamed' } } }, c)
    expectCapped(villained.villains[0]!.play.history)
  })
})
