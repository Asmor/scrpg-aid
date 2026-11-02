import { describe, expect, it } from 'vitest'
import { emptyPlay } from '../play/state'
import { applyHeroChange } from './hero-changes'

const sheet = { maxHealth: 30, healthRanges: { green: [30, 23], yellow: [22, 12], red: [11, 1] } as never }
let n = 0
const clock = { now: new Date('2026-11-01T00:00:00Z'), newId: () => `x${++n}` }

describe('the GM’s changes to a hero', () => {
  it('marks them as the GM’s in the hero’s history', () => {
    const play = applyHeroChange({ ...emptyPlay(), health: 18 }, sheet, { kind: 'health', value: 14 }, clock)
    expect(play.health).toBe(14)
    expect(play.history.at(-1)!.text).toBe('GM: Lost 4 HP (18 → 14).')
    const twisted = applyHeroChange(play, sheet, { kind: 'twist', twist: { kind: 'minor', text: 'Pinned' } }, clock)
    expect(twisted.history.at(-1)!.text).toBe('GM: Took a minor twist: Pinned.')
    const used = applyHeroChange(twisted, sheet, { kind: 'reaction', used: true }, clock)
    expect(used.reactionUsed).toBe(true)
    expect(used.history.at(-1)!.text).toBe('GM: Used this round’s reaction.')
  })

  it('names the GM as a mod’s giver', () => {
    const play = applyHeroChange(emptyPlay(), sheet, { kind: 'mod', mod: { label: 'Tailwind', value: 2 } }, clock)
    expect(play.mods).toMatchObject([{ label: 'Tailwind', value: 2 }])
    expect(play.history.at(-1)!.text).toBe("Gained '+2 Tailwind' bonus from the GM.")
  })
})
