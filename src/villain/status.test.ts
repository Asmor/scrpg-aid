import { describe, expect, it } from 'vitest'
import { bullyOverlord, adaptiveBruiser } from '../test/villains'
import { buildVillainSheet, healthBreakdown, villainIdentity } from './sheet'
import { statusRows } from './status'

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
