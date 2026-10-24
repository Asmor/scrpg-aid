import { describe, expect, it } from 'vitest'
import { modeLimits } from './format'

describe('modeLimits', () => {
  it('lists the basic actions a mode rules out, and whether it can move', () => {
    expect(modeLimits(['attack'], false)).toBe("Can't Attack.")
    expect(modeLimits(['attack', 'hinder'], false)).toBe("Can't Attack or Hinder.")
    expect(modeLimits(['boost', 'defend', 'overcome'], false)).toBe("Can't Boost, Defend, or Overcome.")
    expect(modeLimits(['boost'], true)).toBe("Can't Boost. Can't move.")
    expect(modeLimits([], true)).toBe("Can't move.")
  })
})
