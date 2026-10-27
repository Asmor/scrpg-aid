import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { emptyPlay, setHealth } from '../play/state'
import { completeHero } from '../test/heroes'
import { newSession } from './gm'
import { applySession, entriesToShare, heroSummary } from './player'

let n = 0
const clock = () => ({ now: new Date('2026-10-27T10:00:00Z'), newId: () => `id${++n}` })

describe('a player’s session', () => {
  it('summarizes the hero for the table', () => {
    const hero = completeHero()
    hero.details.name = 'Captain Example'
    const sheet = buildSheet(hero)
    const play = { ...setHealth(emptyPlay(), sheet, 20, clock()), mods: [{ id: 'm', label: 'cheer', value: 1 }] }
    expect(heroSummary(hero, sheet, play)).toEqual({ name: 'Captain Example', health: 20, maxHealth: 30, zone: 'yellow', mods: play.mods, twists: [] })
    expect(heroSummary(hero, { maxHealth: undefined, healthRanges: undefined }, emptyPlay())).toEqual({ name: 'Captain Example', mods: [], twists: [] })
  })

  it('follows the GM’s scene, and adds mods given to it once', () => {
    const state = {
      ...newSession('ABCD-EFGH'),
      scene: 'yellow' as const,
      inbox: [
        { id: 'c2:g1', to: 'me', from: 'Bolt', mod: { label: 'rallied', value: 2 } },
        { id: 'gm:x', to: 'someone else', from: 'GM', mod: { label: 'x', value: 1 } },
      ],
    }
    const first = applySession(emptyPlay(), state, 'me', new Set(), clock())
    expect(first.play.sceneZone).toBe('yellow')
    expect(first.play.mods).toEqual([{ id: 'c2:g1', label: 'rallied', value: 2 }])
    expect(first.play.history.map((h) => h.text)).toEqual(['The GM set the scene to Yellow.', "Gained '+2 rallied' bonus from Bolt."])
    expect(first).toMatchObject({ added: ['c2:g1'], ack: ['c2:g1'] })
    // Already added (even if since removed): not added again, but still acknowledged.
    const again = applySession({ ...first.play, mods: [] }, state, 'me', new Set(first.added), clock())
    expect(again.play.mods).toEqual([])
    expect(again).toMatchObject({ added: [], ack: ['c2:g1'] })
    // Nothing to do: the same state back.
    const quiet = applySession(first.play, { ...state, inbox: [] }, 'me', new Set(), clock())
    expect(quiet.play).toBe(first.play)
  })

  it('shares new history, but not old entries or the GM’s scene changes', () => {
    const history = [
      { id: 'h1', at: 'a', text: 'Lost 4 HP (30 → 26).' },
      { id: 'h2', at: 'b', text: 'The GM set the scene to Red.' },
      { id: 'h3', at: 'c', text: 'Used ability Inflict:', details: ['Max: 7 (Fire d8)'] },
    ]
    expect(entriesToShare(history, undefined).map((e) => e.id)).toEqual(['h1', 'h3'])
    expect(entriesToShare(history, 'h1')).toEqual([{ id: 'h3', at: 'c', text: 'Used ability Inflict:', details: ['Max: 7 (Fire d8)'] }])
    expect(entriesToShare(history, 'h3')).toEqual([])
    expect(entriesToShare(history, 'gone')).toEqual([])
  })
})
