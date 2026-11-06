import { describe, expect, it } from 'vitest'
import { compareDice, isDie, sortDice, stepDie } from './dice'

describe('dice', () => {
  it('recognizes dice', () => {
    expect(isDie('d8')).toBe(true)
    expect(isDie('d7')).toBe(false)
    expect(isDie(8)).toBe(false)
  })

  it('compares and sorts by size', () => {
    expect(compareDice('d6', 'd10')).toBeLessThan(0)
    expect(compareDice('d12', 'd4')).toBeGreaterThan(0)
    expect(compareDice('d8', 'd8')).toBe(0)
    const input = ['d10', 'd6', 'd12', 'd6'] as const
    expect(sortDice(input)).toEqual(['d6', 'd6', 'd10', 'd12'])
    expect(input).toEqual(['d10', 'd6', 'd12', 'd6'])
  })

  it('steps dice up and down within bounds', () => {
    expect(stepDie('d6', 1)).toBe('d8')
    expect(stepDie('d6', 2)).toBe('d10')
    expect(stepDie('d10', -1)).toBe('d8')
    expect(stepDie('d12', 1)).toBe('d12')
    expect(stepDie('d4', -1)).toBe('d4')
    expect(stepDie('d8', 3, { max: 'd10' })).toBe('d10')
    expect(stepDie('d8', -3, { min: 'd6' })).toBe('d6')
  })

  it('rejects fractional steps and inverted bounds', () => {
    expect(() => stepDie('d8', 1.5)).toThrow(RangeError)
    expect(() => stepDie('d8', 1, { min: 'd10', max: 'd6' })).toThrow(RangeError)
  })
})
