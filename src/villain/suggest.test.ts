import { describe, expect, it } from 'vitest'
import { cryptoRandom, drawSuggestions, rerollAnnouncement, suggestedView } from './suggest'

/** A seeded random source (a small linear congruential generator), so draws repeat. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32
    return s / 2 ** 32
  }
}

const ids = ['a', 'b', 'c', 'd', 'e', 'f']

describe('Suggest 3', () => {
  it('draws three different ids, the same ones for the same seed', () => {
    const first = drawSuggestions(ids, seeded(7))
    expect(first).toHaveLength(3)
    expect(new Set(first).size).toBe(3)
    expect(drawSuggestions(ids, seeded(7))).toEqual(first)
    // Always the first remaining, or always the last.
    expect(drawSuggestions(ids, () => 0)).toEqual(['a', 'b', 'c'])
    expect(drawSuggestions(ids, () => 0.9999)).toEqual(['f', 'e', 'd'])
  })

  it('leaves out excluded ids, and draws fewer when there aren’t enough', () => {
    expect(drawSuggestions(ids, () => 0, ['a', 'c'])).toEqual(['b', 'd', 'e'])
    expect(drawSuggestions(['a', 'b'], () => 0)).toEqual(['a', 'b'])
  })

  it('uses crypto for its default random numbers', () => {
    for (let i = 0; i < 20; i++) {
      const n = cryptoRandom()
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })

  it('shows the GM’s picks that weren’t drawn first, marked as theirs', () => {
    const all = ids.map((id) => ({ id }))
    expect(suggestedView(all, ['b', 'd', 'f'], ['e']).map((v) => `${v.item.id}${v.yours ? '*' : ''}`)).toEqual(['e*', 'b', 'd', 'f'])
    expect(suggestedView(all, ['b', 'd', 'f'], ['d']).map((v) => `${v.item.id}${v.yours ? '*' : ''}`)).toEqual(['b', 'd', 'f'])
    expect(suggestedView(all, ['b', 'zz'], [])).toHaveLength(1)
  })

  it('announces a re-roll', () => {
    expect(rerollAnnouncement(['Bully', 'Ninja', 'Leech'])).toBe('3 new suggestions: Bully, Ninja, Leech.')
  })
})
