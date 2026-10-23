import { describe, expect, it } from 'vitest'
import { backgrounds } from './data'
import {
  canReroll,
  checkManualResults,
  newRoll,
  reachableValues,
  reroll,
  rollDice,
  rollDie,
  tableOptions,
} from './rolling'

/** A Random that returns these values in turn. */
const sequence = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('rolling', () => {
  it('rolls 1 to the die size', () => {
    expect(rollDie('d10', () => 0)).toBe(1)
    expect(rollDie('d10', () => 0.9999)).toBe(10)
    expect(rollDie('d6', () => 0.5)).toBe(4)
    expect(rollDice(['d10', 'd8'], sequence(0, 0.99))).toEqual([1, 8])
  })

  it('stays in range with the real random source', () => {
    for (let i = 0; i < 200; i++) {
      const r = rollDie('d4')
      expect(r).toBeGreaterThanOrEqual(1)
      expect(r).toBeLessThanOrEqual(4)
    }
  })

  it('reaches single dice and sums of pairs', () => {
    const reach = reachableValues([3, 5, 3])
    expect([...reach.keys()].sort((a, b) => a - b)).toEqual([3, 5, 6, 8])
    expect(reach.get(3)).toEqual([{ die: 0 }, { die: 2 }])
    expect(reach.get(8)).toEqual([
      { sum: [0, 1] },
      { sum: [1, 2] },
    ])
    expect(reach.get(6)).toEqual([{ sum: [0, 2] }])
  })

  it('lists the table entries a roll allows, in table order', () => {
    const options = tableOptions(backgrounds, [4, 9])
    expect(options.map((o) => o.entry.roll)).toEqual([4, 9, 13])
    expect(options[2]?.sources).toEqual([{ sum: [0, 1] }])
  })

  it('offers nothing beyond the table', () => {
    expect(tableOptions(backgrounds, [12, 12]).map((o) => o.entry.roll)).toEqual([12])
  })

  it('checks typed-in results', () => {
    expect(checkManualResults(['d10', 'd10'], [3, 10])).toEqual({ ok: true, results: [3, 10] })
    expect(checkManualResults(['d10', 'd6'], [0, 6])).toEqual({ ok: true, results: [10, 6] })
    expect(checkManualResults(['d10'], [3, 4])).toEqual({ ok: false, error: 'Enter 1 result, one per die.' })
    expect(checkManualResults(['d10', 'd10'], [3])).toEqual({ ok: false, error: 'Enter 2 results, one per die.' })
    expect(checkManualResults(['d6'], [0])).toEqual({ ok: false, error: "A d6 can't roll 0." })
    expect(checkManualResults(['d6'], [7])).toEqual({ ok: false, error: "A d6 can't roll 7." })
    expect(checkManualResults(['d8'], [2.5])).toEqual({ ok: false, error: "A d8 can't roll 2.5." })
  })

  it('allows one reroll per step', () => {
    const first = newRoll(['d10', 'd10'], [1, 2], false)
    expect(first).toEqual({ dice: ['d10', 'd10'], results: [1, 2], manual: false })
    expect(canReroll(undefined)).toBe(false)
    expect(canReroll(first)).toBe(true)
    const second = reroll(first, [7, 8], true)
    expect(second).toEqual({ dice: ['d10', 'd10'], results: [7, 8], manual: true, rerolled: true })
    expect(canReroll(second)).toBe(false)
  })
})
