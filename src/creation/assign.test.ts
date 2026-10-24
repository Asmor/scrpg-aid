import { describe, expect, it } from 'vitest'
import { A, P, Q } from '../test/heroes'
import { assignRow, assignStepRow, dieRows, freedDice, stepDice, strayAssignments } from './assign'

describe('dice rows', () => {
  it('pairs each die with an assignment of the same size, in order', () => {
    const rows = dieRows(['d10', 'd8', 'd8'], [A(P('fire'), 'd8'), A(P('agility'), 'd10')])
    expect(rows).toEqual([{ die: 'd10', assignment: A(P('agility'), 'd10') }, { die: 'd8', assignment: A(P('fire'), 'd8') }, { die: 'd8' }])
    expect(strayAssignments(['d10', 'd8'], [A(P('fire'), 'd6'), A(P('agility'), 'd10')])).toEqual([A(P('fire'), 'd6')])
  })

  it('sets, replaces, and clears one row without touching the others', () => {
    const dice = ['d10', 'd8', 'd8'] as const
    let a = assignRow(dice, [], 2, P('fire'))
    expect(a).toEqual([A(P('fire'), 'd8')])
    a = assignRow(dice, a, 0, P('agility'))
    // Row 2's d8 is now paired with the first d8 row: the rows are by size, not position.
    expect(dieRows(dice, a).map((r) => r.assignment?.trait.id)).toEqual(['agility', 'fire', undefined])
    a = assignRow(dice, a, 2, Q('fitness'), true)
    expect(a).toContainEqual({ trait: Q('fitness'), die: 'd8', upgrades: true })
    a = assignRow(dice, a, 1, undefined)
    expect(dieRows(dice, a).map((r) => r.assignment?.trait.id)).toEqual(['agility', 'fitness', undefined])
    expect(assignRow(dice, a, 9, P('fire'))).toEqual(a)
  })

  it('drops stray assignments when a row changes', () => {
    expect(assignRow(['d10'], [A(P('fire'), 'd6')], 0, P('agility'))).toEqual([A(P('agility'), 'd10')])
  })

  it('adds the dice freed by upgrades to the step’s dice', () => {
    const earlier = [{ trait: P('speed'), die: 'd8' as const }, { trait: Q('fitness'), die: 'd6' as const }]
    const assignments = [A(P('speed'), 'd12', true), A(Q('fitness'), 'd8')]
    expect(freedDice(assignments, earlier)).toEqual([{ die: 'd8', from: P('speed') }])
    expect(stepDice(['d12', 'd6'], assignments, earlier)).toEqual(['d12', 'd6', 'd8'])
    // Marked as an upgrade, but the hero didn't have it: nothing is freed.
    expect(freedDice([A(P('flight'), 'd12', true)], earlier)).toEqual([])
  })
})

describe('assignStepRow', () => {
  const earlier = [{ trait: P('speed'), die: 'd8' as const }, { trait: Q('fitness'), die: 'd6' as const }]
  const pool = ['d12', 'd10'] as const

  it('uses the freed dice as rows after the step’s own', () => {
    let a = assignStepRow(pool, earlier, [], 0, P('speed'), true)
    expect(stepDice(pool, a, earlier)).toEqual(['d12', 'd10', 'd8'])
    a = assignStepRow(pool, earlier, a, 2, P('flight'))
    expect(a).toEqual([A(P('speed'), 'd12', true), A(P('flight'), 'd8')])
  })

  it('drops what was on a freed die when its upgrade is undone, and anything that frees in turn', () => {
    // Speed d8 → d12 frees the d8, which upgrades Fitness d6 → d8, freeing the d6 for Flight.
    const a = [A(P('speed'), 'd12', true), A(P('agility'), 'd10'), A(Q('fitness'), 'd8', true), A(P('flight'), 'd6')]
    expect(dieRows(stepDice(pool, a, earlier), a).every((r) => r.assignment)).toBe(true)
    expect(assignStepRow(pool, earlier, a, 0, P('speed'))).toEqual([A(P('speed'), 'd12'), A(P('agility'), 'd10')])
    expect(assignStepRow(pool, earlier, a, 0, undefined)).toEqual([A(P('agility'), 'd10')])
  })
})
