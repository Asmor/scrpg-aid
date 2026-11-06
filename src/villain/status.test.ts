import { describe, expect, it } from 'vitest'
import { bullyOverlord, adaptiveBruiser } from '../test/villains'
import { buildVillainSheet, healthBreakdown, villainIdentity } from './sheet'
import { villainArchetypesById } from '../rules/villain-data'
import { statusDetailLines, statusRows, statusSummary } from './status'

const rule = (id: string) => villainArchetypesById.get(id)!.status

describe('a villain’s status rule', () => {
  it('sums each kind of rule up in a line', () => {
    expect(statusSummary(rule('bruiser'))).toBe('Status follows its Health zone.')
    expect(statusSummary(rule('domain'))).toMatch(/^Status depends on the number of /)
    expect(statusSummary(rule('indomitable'))).toBe('Status: d8, always.')
    expect(statusSummary(rule('formidable'))).toBe('Status depends on penalties related to its weakness.')
    expect(statusSummary(rule('titan'))).toBe('Status starts at d12 and drops as its challenge is completed.')
  })

  it('gives each rule’s details as text, for the exports', () => {
    expect(statusDetailLines(rule('bruiser'))).toEqual(['Green d6, Yellow d8, Red d10'])
    expect(statusDetailLines(rule('indomitable'))).toEqual([])
    expect(statusDetailLines(rule('titan'))).toEqual([expect.stringMatching(/\(2 successes\)$/), expect.stringMatching(/\(1 success\)$/)])
    expect(statusDetailLines(rule('formidable'))).toHaveLength(3)
    expect(statusDetailLines({ basis: 'count', summary: '', counts: 'minions', tiers: [{ min: 4, die: 'd12' }, { min: 2, max: 3, die: 'd10' }, { min: 1, max: 1, die: 'd8' }] })).toEqual(['4 or more: d12', '2–3: d10', '1: d8'])
  })
})

describe('statusRows', () => {
  it('lists each kind of status rule as condition and die', () => {
    expect(statusRows({ basis: 'healthZone', summary: '', zones: { green: 'd6', yellow: 'd8', red: 'd10' } })).toEqual([
      { when: 'Green zone', die: 'd6' },
      { when: 'Yellow zone', die: 'd8' },
      { when: 'Red zone', die: 'd10' },
    ])
    expect(statusRows({ basis: 'fixed', summary: '', die: 'd10' })).toEqual([{ when: 'Always', die: 'd10' }])
    expect(statusRows({ basis: 'weakness', summary: '', tiers: [{ condition: 'No penalty', die: 'd12' }] })).toEqual([{ when: 'No penalty', die: 'd12' }])
    expect(statusRows({ basis: 'challenge', summary: '', startingDie: 'd12', challenge: [{ successes: 2, text: 'Break the seal' }] })).toEqual([
      { when: 'To start', die: 'd12' },
      { when: 'Break the seal (2 successes)' },
    ])
  })

  it('words count tiers as ranges, with none for zero', () => {
    const rows = statusRows(buildVillainSheet(bullyOverlord()).status!)
    expect(rows.map((r) => r.when)).toEqual(['9 or more', '5 to 8', '3 or 4', '1 or 2', 'None'])
  })
})

describe('the villain sheet’s header lines', () => {
  it('names the kind, approach and archetype', () => {
    expect(villainIdentity(buildVillainSheet(bullyOverlord()))).toBe('Major villain · Bully · Overlord')
    expect(villainIdentity({ major: false })).toBe('Minor villain')
  })

  it('says how the Health was built', () => {
    expect(healthBreakdown(buildVillainSheet(bullyOverlord()))).toBe('Built for 4 heroes: Bully 25, Overlord +15, 5 per hero.')
    const one = adaptiveBruiser()
    one.heroCount = 1
    const upgraded = bullyOverlord()
    upgraded.upgrades.push({ id: 'calming-aura', abilities: [] })
    expect(healthBreakdown(buildVillainSheet(upgraded))).toBe('Built for 4 heroes: Bully 25, Overlord +15, Calming Aura +10, 5 per hero.')
    expect(healthBreakdown(buildVillainSheet(one))).toMatch(/^Built for 1 hero: Adaptive \d+, Bruiser [+−]\d+, 5 per hero\.$/)
  })
})
