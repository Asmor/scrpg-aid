import { describe, expect, it } from 'vitest'
import { buildSheet } from './sheet'
import { createHero } from '../hero/model'
import { exampleHero } from '../hero/example'
import { diceTableRows } from './dice-table'

describe('diceTableRows', () => {
  it('puts powers, qualities, and Green/Yellow/Red status side by side', () => {
    const rows = diceTableRows(buildSheet(exampleHero({ id: 'x' })))
    expect(rows).toHaveLength(5)
    expect(rows.map((r) => [r.power?.name, r.power?.die, r.quality?.name, r.quality?.die, r.status?.zone, r.status?.die])).toEqual([
      ['Speed', 'd12', 'Fitness', 'd10', 'green', 'd8'],
      ['Agility', 'd10', 'Alertness', 'd8', 'yellow', 'd8'],
      ['Awareness', 'd8', 'Old Money', 'd8', 'red', 'd8'],
      ['Fire', 'd8', undefined, undefined, undefined, undefined],
      ['Flight', 'd6', undefined, undefined, undefined, undefined],
    ])
  })

  it('always has the three status rows, with no dice before a personality', () => {
    const rows = diceTableRows(buildSheet(createHero('guided', { id: 'h1' })))
    expect(rows).toEqual([{ status: { zone: 'green' } }, { status: { zone: 'yellow' } }, { status: { zone: 'red' } }])
  })
})
