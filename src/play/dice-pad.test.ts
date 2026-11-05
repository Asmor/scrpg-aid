import { describe, expect, it } from 'vitest'
import { assignToDice, enteredText, fitsDice, keyNumber, keyOffReason, tapNumber, whyNotFits } from './dice-pad'

describe('fitsDice', () => {
  it('sorts both and checks each number against its die', () => {
    expect(fitsDice([8, 3, 2], ['d4', 'd6', 'd8'])).toBe(true)
    expect(fitsDice([2, 8, 3], ['d8', 'd4', 'd6'])).toBe(true)
    expect(fitsDice([8, 7, 2], ['d4', 'd6', 'd8'])).toBe(false)
    expect(fitsDice([5, 5, 5], ['d4', 'd6', 'd8'])).toBe(false)
    expect(fitsDice([4, 6, 8], ['d4', 'd6', 'd8'])).toBe(true)
    expect(fitsDice([12], ['d12'])).toBe(true)
    expect(fitsDice([12], ['d10'])).toBe(false)
  })

  it('wants one number per die', () => {
    expect(fitsDice([1, 2], ['d4', 'd6', 'd8'])).toBe(false)
    expect(fitsDice([], [])).toBe(true)
  })
})

describe('whyNotFits', () => {
  it('says why, and only when every slot is filled', () => {
    expect(whyNotFits([8, 7, 2], ['d4', 'd6', 'd8'])).toBe('Two numbers above 6, but only one die (d8) goes that high.')
    expect(whyNotFits([5, 5, 5], ['d4', 'd6', 'd8'])).toBe('Three numbers above 4, but only two dice (d6 and d8) go that high.')
    expect(whyNotFits([8, 7], ['d4', 'd6', 'd8'])).toBeUndefined()
    expect(whyNotFits([8, 3, 2], ['d4', 'd6', 'd8'])).toBeUndefined()
  })
})

describe('the keys', () => {
  it('are off when no die can show them, saying which die it would take', () => {
    expect(keyOffReason(10, ['d6', 'd8', 'd10'])).toBeUndefined()
    expect(keyOffReason(11, ['d6', 'd8', 'd10'])).toBe('No d12 in this roll')
    expect(keyOffReason(12, ['d6', 'd8', 'd10'])).toBe('No d12 in this roll')
    expect(keyOffReason(5, ['d4'])).toBe('No d6 in this roll')
    expect(keyOffReason(7, ['d4', 'd6'])).toBe('No d8 in this roll')
  })

  it('read 1 to 9, then 0, - and = for 10, 11 and 12', () => {
    expect(['1', '9', '0', '-', '=', 'a', 'Enter'].map(keyNumber)).toEqual([1, 9, 10, 11, 12, undefined, undefined])
  })

  it('drop the oldest number when the slots are full', () => {
    expect(tapNumber([1, 2], 3, 3)).toEqual([1, 2, 3])
    expect(tapNumber([1, 2, 3], 4, 3)).toEqual([2, 3, 4])
    expect(tapNumber([5], 6, 1)).toEqual([6])
  })
})

describe('entered numbers', () => {
  it('go largest to largest die, in the dice order', () => {
    expect(assignToDice([2, 9, 6], ['d6', 'd10', 'd8'])).toEqual([2, 9, 6])
    expect(assignToDice([8, 3, 2], ['d8', 'd4', 'd6'])).toEqual([8, 2, 3])
    expect(assignToDice([4], ['d6'])).toEqual([4])
  })

  it('read largest first in the log', () => {
    expect(enteredText([2, 9, 6])).toBe('9, 6, 2')
  })
})
