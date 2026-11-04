import { describe, expect, it } from 'vitest'
import { parseTarget, rollAction, targetId } from './roll-targets'

const record = { title: 'Boost', rolled: [], results: [], manual: false }
/** A roll with an Attack and two Defends. */
const fighting = {
  ...record,
  results: [
    { action: 'attack' as const, use: 'max' as const, base: 6, mods: [], total: 6 },
    { action: 'defend' as const, use: 'mid' as const, base: 4, mods: [], total: 4 },
    { action: 'defend' as const, use: 'min' as const, base: 2, mods: [], total: 2 },
  ],
}

describe('roll targets', () => {
  it('round-trips target ids', () => {
    for (const t of [{ kind: 'hero', id: 'h1' }, { kind: 'heroMinion', heroId: 'h1', minionId: 'm1' }, { kind: 'villain', id: 'v1' }, { kind: 'member', groupId: 'g', memberId: 'm' }] as const) expect(parseTarget(targetId(t))).toEqual(t)
    expect(parseTarget('minion:x')).toBeUndefined()
    expect(parseTarget('heroMinion:h1')).toBeUndefined()
    expect(parseTarget('hero:h1:extra')).toBeUndefined()
    expect(parseTarget('member:g:m:extra')).toBeUndefined()
    expect(parseTarget('hero:')).toBeUndefined()
    expect(parseTarget('member:g')).toBeUndefined()
  })

  it("sorts a roll's follow-ups into the hero's own, their minions', and others'", () => {
    const action = rollAction('h1', { kind: 'ability', name: 'Hinder Them' }, fighting, [
      { mod: { label: 'Self', value: 1 } },
      { mod: { label: 'Me too', value: 2 }, to: 'hero:h1' },
      { mod: { label: 'Mine', value: 1 }, to: 'heroMinion:h1:m1' },
      { mod: { label: 'Theirs', value: -2 }, to: 'villain:v1' },
      { mod: { label: 'Their minion', value: -1 }, to: 'heroMinion:h2:m9' },
      { mod: { label: 'Dropped', value: -1 }, to: 'nonsense' },
    ], 'form:1', [{ name: 'Drone', die: 'd6', action: 'attack' }], [
      { result: 0, to: 'member:g1:m2' },
      { result: 1, to: '' },
      { result: 2, to: 'hero:h2' },
      { result: 0, to: 'nonsense' },
    ])
    // Defending yourself, by your own id, is the same as no target.
    expect(rollAction('h1', { kind: 'basic' }, fighting, [], undefined, [], [{ result: 1, to: 'hero:h1' }, { result: 2, to: 'heroMinion:h1:m1' }]).defends).toEqual([{ result: 1 }, { result: 2, to: { kind: 'heroMinion', heroId: 'h1', minionId: 'm1' } }])
    expect(action).toEqual({
      subject: { kind: 'ability', name: 'Hinder Them' },
      record: fighting,
      formChoice: 'form:1',
      selfMods: [{ label: 'Self', value: 1 }, { label: 'Me too', value: 2 }],
      minionMods: [{ minionId: 'm1', mod: { label: 'Mine', value: 1 } }],
      others: [
        { to: { kind: 'villain', id: 'v1' }, mod: { label: 'Theirs', value: -2 } },
        { to: { kind: 'heroMinion', heroId: 'h2', minionId: 'm9' }, mod: { label: 'Their minion', value: -1 } },
      ],
      made: [{ name: 'Drone', die: 'd6', action: 'attack' }],
      attacks: [{ result: 0, to: { kind: 'member', groupId: 'g1', memberId: 'm2' } }],
      defends: [{ result: 1 }, { result: 2, to: { kind: 'hero', id: 'h2' } }],
    })
    expect(rollAction('h1', { kind: 'basic' }, record, [])).toEqual({ subject: { kind: 'basic' }, record, selfMods: [], minionMods: [], others: [], made: [], attacks: [], defends: [] })
    expect(rollAction('h1', { kind: 'basic', action: 'boost' }, record, []).subject).toEqual({ kind: 'basic', action: 'boost' })
  })
})
