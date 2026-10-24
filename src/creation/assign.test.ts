import { describe, expect, it } from 'vitest'
import { A, P, Q } from '../test/heroes'
import { assignRow, dieRows, strayAssignments } from './assign'

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
})
