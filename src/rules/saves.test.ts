import { describe, expect, it } from 'vitest'
import { lieutenantSave, minionSave, outrightKo, save } from './saves'

describe('minion saves', () => {
  it('drops one die size on a save, including a tie', () => {
    expect(minionSave({ die: 'd8' }, 5, 6)).toEqual({ outcome: 'shrink', newDie: 'd6' })
    expect(minionSave({ die: 'd8' }, 5, 5)).toEqual({ outcome: 'shrink', newDie: 'd6' })
    expect(minionSave({ die: 'd12' }, 1, 12)).toEqual({ outcome: 'shrink', newDie: 'd10' })
  })

  it("is KO'd on a failed save", () => {
    expect(minionSave({ die: 'd8' }, 5, 4)).toEqual({ outcome: 'ko' })
    expect(minionSave({ die: 'd4' }, 5, 4)).toEqual({ outcome: 'ko' })
  })

  it('stays a d4 when a d4 saves', () => {
    expect(minionSave({ die: 'd4' }, 3, 3)).toEqual({ outcome: 'stay' })
  })

  it('has no outright KO, however much the damage', () => {
    expect(minionSave({ die: 'd8' }, 20, 20)).toEqual({ outcome: 'shrink', newDie: 'd6' })
  })
})

describe('lieutenant saves', () => {
  it('stays at its die size on a save, including a tie', () => {
    expect(lieutenantSave({ die: 'd8' }, 5, 6)).toEqual({ outcome: 'stay' })
    expect(lieutenantSave({ die: 'd8' }, 5, 5)).toEqual({ outcome: 'stay' })
    expect(lieutenantSave({ die: 'd4' }, 3, 3)).toEqual({ outcome: 'stay' })
  })

  it("drops one die size on a failed save, and a d4 is KO'd", () => {
    expect(lieutenantSave({ die: 'd8' }, 7, 6)).toEqual({ outcome: 'shrink', newDie: 'd6' })
    expect(lieutenantSave({ die: 'd4' }, 5, 4)).toEqual({ outcome: 'ko' })
  })

  it('is KO’d outright, with no save, by damage of at least double its die', () => {
    expect(lieutenantSave({ die: 'd8' }, 16, 99)).toEqual({ outcome: 'ko', noSave: true })
    expect(lieutenantSave({ die: 'd8' }, 15, 15)).toEqual({ outcome: 'stay' })
    expect(lieutenantSave({ die: 'd8' }, 15, 14)).toEqual({ outcome: 'shrink', newDie: 'd6' })
    expect(lieutenantSave({ die: 'd4' }, 8, 4)).toEqual({ outcome: 'ko', noSave: true })
    expect(lieutenantSave({ die: 'd12' }, 23, 1)).toEqual({ outcome: 'shrink', newDie: 'd10' })
    expect(lieutenantSave({ die: 'd12' }, 24, 1)).toEqual({ outcome: 'ko', noSave: true })
    expect(outrightKo('d8', 16)).toBe(true)
    expect(outrightKo('d8', 15)).toBe(false)
  })

  it('picks the rule by kind', () => {
    expect(save('minions', { die: 'd8' }, 16, 3)).toEqual({ outcome: 'ko' })
    expect(save('lieutenants', { die: 'd8' }, 16, 20)).toEqual({ outcome: 'ko', noSave: true })
  })
})
