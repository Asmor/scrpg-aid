import { describe, expect, it } from 'vitest'
import type { Clock } from '../play/state'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { createGame } from './model'
import { project } from './project'
import { OWN_MINION, parseTarget, rollAction, tableTargets, targetId } from './roll-targets'
import { addGroup, addHero, addVillain } from './table'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-03T12:00:00Z'), newId: () => `id${++n}` }
}

const record = { title: 'Boost', rolled: [], results: [], manual: false }

describe('roll targets', () => {
  it('round-trips target ids', () => {
    for (const t of [{ kind: 'hero', id: 'h1' }, { kind: 'villain', id: 'v1' }, { kind: 'member', groupId: 'g', memberId: 'm' }] as const) expect(parseTarget(targetId(t))).toEqual(t)
    expect(parseTarget('minion:x')).toBeUndefined()
    expect(parseTarget('hero:')).toBeUndefined()
    expect(parseTarget('member:g')).toBeUndefined()
  })

  it('lists the other heroes, revealed villains and revealed group members', () => {
    const c = clock()
    let g = createGame({ id: 'g' })
    g = addHero(g, { ...completeHero(), id: 'a', details: { ...completeHero().details, name: 'Maya' } }, c)
    g = addHero(g, { ...completeHero(), id: 'b', details: { ...completeHero().details, name: 'Jo' } }, c)
    g = addVillain(g, adaptiveBruiser(), c, false)
    g = addVillain(g, { ...adaptiveBruiser(), id: 'v2' }, c, true)
    g = addGroup(g, { kind: 'minions', name: 'Drones', die: 'd6', count: 2, hidden: false }, c)
    g = addGroup(g, { kind: 'minions', name: 'Secret', die: 'd6', count: 1, hidden: true }, c)
    const maya = g.heroes[0]!.id
    // From the GM's view (hidden things included), hidden ones are still left out.
    const names = tableTargets(project(g, 'gm'), maya).map((t) => t.name)
    expect(names).toEqual(['Jo', g.villains[0]!.sheet.details.name, 'Drones 1', 'Drones 2'])
    expect(tableTargets(project(g, 'player'), maya).map((t) => t.name)).toEqual(names)
  })

  it("sorts a roll's follow-ups into the hero's own, their minions', and others'", () => {
    const action = rollAction({ kind: 'ability', name: 'Hinder Them' }, record, [
      { mod: { label: 'Self', value: 1 } },
      { mod: { label: 'Mine', value: 1 }, to: `${OWN_MINION}m1` },
      { mod: { label: 'Theirs', value: -2 }, to: 'villain:v1' },
      { mod: { label: 'Dropped', value: -1 }, to: 'nonsense' },
    ], 'form:1', [{ name: 'Drone', die: 'd6', action: 'attack' }], [
      { result: 0, to: 'member:g1:m2' },
      { result: 1, to: 'nonsense' },
    ])
    expect(action).toEqual({
      subject: { kind: 'ability', name: 'Hinder Them' },
      record,
      formChoice: 'form:1',
      selfMods: [{ label: 'Self', value: 1 }],
      minionMods: [{ minionId: 'm1', mod: { label: 'Mine', value: 1 } }],
      others: [{ to: { kind: 'villain', id: 'v1' }, mod: { label: 'Theirs', value: -2 } }],
      made: [{ name: 'Drone', die: 'd6', action: 'attack' }],
      attacks: [{ result: 0, to: { kind: 'member', groupId: 'g1', memberId: 'm2' } }],
    })
    expect(rollAction({ kind: 'basic' }, record, [])).toEqual({ subject: { kind: 'basic' }, record, selfMods: [], minionMods: [], others: [], made: [], attacks: [] })
    expect(rollAction({ kind: 'basic', action: 'boost' }, record, []).subject).toEqual({ kind: 'basic', action: 'boost' })
  })
})
