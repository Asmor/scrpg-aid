import { describe, expect, it } from 'vitest'
import type { Clock } from '../play/state'
import { addMinion } from '../play/minions'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { createGame } from './model'
import { project, viewName } from './project'
import { addGroup, addHero, addVillain, changeHeroPlay, itemName, setEnvironment } from './table'
import { allOptions, gmTable, polarity, soloTable, targetOptions, toggleLabel, viewTable, type TargetActor, type TargetList } from './target-options'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-03T12:00:00Z'), newId: () => `id${++n}` }
}

/** Maya (with a Drone), Paradigm, and Swarmwright (with a Drone); Gravelord and a hidden Secret; Burglars (3), Guards (1) and hidden Lurkers. */
function game() {
  const c = clock()
  const named = (id: string, name: string) => ({ ...completeHero(), id, details: { ...completeHero().details, name } })
  let g = createGame({ id: 'g' })
  g = addHero(g, named('a', 'Maya Reyes'), c)
  g = addHero(g, named('b', 'Paradigm'), c)
  g = addHero(g, named('s', 'Swarmwright'), c)
  const [maya, paradigm, swarm] = g.heroes.map((h) => h.id) as [string, string, string]
  g = changeHeroPlay(g, maya, (p) => addMinion(p, { name: 'Spark', die: 'd6', action: 'attack' }, c), c)
  g = changeHeroPlay(g, swarm, (p) => addMinion(p, { name: 'Drone', die: 'd6', action: 'attack' }, c), c)
  g = addVillain(g, { ...adaptiveBruiser(), id: 'v1', details: { ...adaptiveBruiser().details, name: 'Gravelord' } }, c, false)
  g = addVillain(g, { ...adaptiveBruiser(), id: 'v2', details: { ...adaptiveBruiser().details, name: 'Secret' } }, c, true)
  g = addGroup(g, { kind: 'minions', name: 'Burglars', die: 'd6', count: 3, hidden: false }, c)
  g = addGroup(g, { kind: 'lieutenants', name: 'Guards', die: 'd8', count: 1, hidden: false }, c)
  g = addGroup(g, { kind: 'minions', name: 'Lurkers', die: 'd4', count: 1, hidden: true }, c)
  const [burglars, guards] = g.groups
  return { g, maya, paradigm, swarm, burglars: burglars!, guards: guards!, gravelord: g.villains[0]!.id }
}

const names = (list: TargetList) => ({ likely: list.likely.map((o) => o.name), other: list.other && { label: list.other.label, names: list.other.options.map((o) => o.name) } })

describe('choosing targets', () => {
  it('sorts effects into negative and positive, and names the toggle for a dialog', () => {
    expect(['attack', 'hinder', 'boost', 'defend', 'overcome'].map((a) => polarity(a as never))).toEqual(['negative', 'negative', 'positive', 'positive', undefined])
    expect(toggleLabel(['negative', 'negative'])).toBe('Show allies too')
    expect(toggleLabel(['positive'])).toBe('Show opponents too')
    expect(toggleLabel(['negative', 'positive'])).toBe('Show the other side too')
    expect(toggleLabel([])).toBeUndefined()
  })

  it("lists a group member's opponents for Attack, then its allies with the toggle", () => {
    const { g, burglars } = game()
    const actor: TargetActor = { kind: 'member', groupId: burglars.id, memberId: burglars.members[1]!.id }
    expect(names(targetOptions(actor, 'attack', gmTable(g)))).toEqual({ likely: ['Maya Reyes', "Spark (Maya Reyes's minion)", 'Paradigm', 'Swarmwright', "Drone (Swarmwright's minion)"], other: undefined })
    expect(names(targetOptions(actor, 'hinder', gmTable(g), { showOtherSide: true })).other).toEqual({
      label: 'Allies',
      names: ['Gravelord', 'Secret', 'Burglars 1 (same group)', 'Burglars 2 (you)', 'Burglars 3 (same group)', 'Guards 1', 'Lurkers 1'],
    })
  })

  it("lists a group's allies for Boost and Defend, its own members first, and opponents with the toggle", () => {
    const { g, burglars, guards } = game()
    const all: TargetActor = { kind: 'group', id: guards.id }
    expect(names(targetOptions(all, 'boost', gmTable(g))).likely).toEqual(['Gravelord', 'Secret', 'Guards 1 (same group)', 'Burglars 1', 'Burglars 2', 'Burglars 3', 'Lurkers 1'])
    expect(names(targetOptions(all, 'defend', gmTable(g), { showOtherSide: true })).other?.label).toBe('Opponents')
    expect(targetOptions({ kind: 'group', id: burglars.id }, 'overcome', gmTable(g), { showOtherSide: true })).toEqual({ likely: [] })
  })

  it("lists a hero's opponents for Attack, and allies (themself and their minion first) for Boost", () => {
    const { g, maya, paradigm } = game()
    const view = viewTable(project(g, 'player'))
    const me: TargetActor = { kind: 'hero', id: paradigm }
    // Players never see hidden villains or groups.
    expect(names(targetOptions(me, 'attack', view)).likely).toEqual(['Gravelord', 'Burglars 1', 'Burglars 2', 'Burglars 3', 'Guards 1'])
    expect(names(targetOptions(me, 'boost', view)).likely).toEqual(['Paradigm (you)', 'Maya Reyes', "Spark (Maya Reyes's minion)", 'Swarmwright', "Drone (Swarmwright's minion)"])
    expect(names(targetOptions({ kind: 'hero', id: maya }, 'defend', view)).likely.slice(0, 2)).toEqual(['Maya Reyes (you)', 'Spark (your minion)'])
    expect(names(targetOptions(me, 'attack', view, { showOtherSide: true })).other).toEqual({ label: 'Allies', names: ['Paradigm (you)', 'Maya Reyes', "Spark (Maya Reyes's minion)", 'Swarmwright', "Drone (Swarmwright's minion)"] })
  })

  it("lists a hero's minion as itself, and a villain as itself", () => {
    const { g, swarm, gravelord } = game()
    const drone = g.heroes[2]!.play.minions![0]!.id
    expect(names(targetOptions({ kind: 'heroMinion', heroId: swarm, minionId: drone }, 'boost', gmTable(g))).likely).toEqual(['Swarmwright', 'Drone (you)', 'Maya Reyes', "Spark (Maya Reyes's minion)", 'Paradigm'])
    expect(names(targetOptions({ kind: 'villain', id: gravelord }, 'defend', gmTable(g))).likely.slice(0, 2)).toEqual(['Gravelord (you)', 'Secret'])
  })

  it('keeps a target already chosen from the other side, with the toggle off again', () => {
    const { g, paradigm, maya } = game()
    const me: TargetActor = { kind: 'hero', id: paradigm }
    const chosen = allOptions(targetOptions(me, 'attack', gmTable(g), { showOtherSide: true })).find((o) => o.name === 'Maya Reyes')!.id
    expect(chosen).toBe(`hero:${maya}`)
    expect(names(targetOptions(me, 'attack', gmTable(g), { keep: [chosen, 'nonsense'] })).other).toEqual({ label: 'Allies', names: ['Maya Reyes'] })
  })

  it('has just the hero and their minions in solo play', () => {
    const hero = game().g.heroes[0]!
    expect(names(targetOptions({ kind: 'hero', id: hero.sheet.id }, 'boost', soloTable(hero.sheet, hero.play)))).toEqual({ likely: ['Maya Reyes (you)', 'Spark (your minion)'], other: undefined })
  })

  describe("the environment's groups", () => {
    /** The table with Rooftop Heist and its Drones (2), revealed. */
    function withEnvironment() {
      const t = game()
      const c = clock()
      let g = setEnvironment(t.g, { name: 'Rooftop Heist', hidden: false }, c)
      g = addGroup(g, { kind: 'minions', name: 'Drones', die: 'd6', count: 2, hidden: false, owner: { kind: 'environment' } }, c)
      const drones = g.groups.at(-1)!
      return { ...t, g, drones }
    }
    const sections = (list: TargetList) => list.always?.map((s) => [s.label, s.options.map((o) => o.name)])

    it('lists its members in every list, in their own section, whatever the effect or the toggle', () => {
      const { g, maya, burglars, gravelord } = withEnvironment()
      const actors: TargetActor[] = [{ kind: 'hero', id: maya }, { kind: 'villain', id: gravelord }, { kind: 'member', groupId: burglars.id, memberId: burglars.members[0]!.id }]
      for (const actor of actors) {
        for (const effect of ['attack', 'hinder', 'boost', 'defend'] as const) {
          for (const showOtherSide of [false, true]) {
            const list = targetOptions(actor, effect, gmTable(g), { showOtherSide })
            expect(sections(list)).toEqual([['Rooftop Heist', ['Drones 1', 'Drones 2']]])
            expect(list.sideless).toBeUndefined()
          }
        }
      }
      // Not in the opposition: Gravelord's allies are just the GM's.
      expect(names(targetOptions({ kind: 'villain', id: gravelord }, 'boost', gmTable(g))).likely).toEqual(['Gravelord (you)', 'Secret', 'Burglars 1', 'Burglars 2', 'Burglars 3', 'Guards 1', 'Lurkers 1'])
      expect(targetOptions({ kind: 'hero', id: maya }, 'overcome', gmTable(g))).toEqual({ likely: [] })
    })

    it('has no side when one acts: everyone, a section each, its own group first and labeled', () => {
      const { g, drones } = withEnvironment()
      const list = targetOptions({ kind: 'member', groupId: drones.id, memberId: drones.members[1]!.id }, 'attack', gmTable(g))
      expect(list).toMatchObject({ likely: [], sideless: true })
      expect(list.other).toBeUndefined()
      expect(sections(list)).toEqual([
        ['Heroes', ['Maya Reyes', 'Spark (Maya Reyes\'s minion)', 'Paradigm', 'Swarmwright', "Drone (Swarmwright's minion)"]],
        ['Opposition', ['Gravelord', 'Secret', 'Burglars 1', 'Burglars 2', 'Burglars 3', 'Guards 1', 'Lurkers 1']],
        ['Rooftop Heist', ['Drones 1 (same group)', 'Drones 2 (you)']],
      ])
      // The whole group ("Same target for all"), too.
      expect(targetOptions({ kind: 'group', id: drones.id }, 'boost', gmTable(g)).sideless).toBe(true)
    })

    it('tells an environment group from a GM group with the same name, in lists and the turn order', () => {
      const t = withEnvironment()
      const c = clock()
      const g = addGroup(t.g, { kind: 'minions', name: 'Drones', die: 'd6', count: 1, hidden: false }, c)
      const gmDrones = g.groups.at(-1)!
      const list = targetOptions({ kind: 'hero', id: t.maya }, 'attack', gmTable(g))
      expect(sections(list)).toEqual([['Rooftop Heist', ['Drones 1 (Rooftop Heist)', 'Drones 2 (Rooftop Heist)']]])
      expect(list.likely.map((o) => o.name)).toContain('Drones 1')
      expect(itemName(g, { kind: 'group', id: t.drones.id })).toBe('Drones (Rooftop Heist)')
      expect(itemName(g, { kind: 'group', id: gmDrones.id })).toBe('Drones')
      expect(viewName(project(g, 'player'), { kind: 'group', id: t.drones.id }, () => '')).toBe('Drones (Rooftop Heist)')
      // No clash: just the name.
      expect(itemName(t.g, { kind: 'group', id: t.drones.id })).toBe('Drones')
    })

    it("names the section for a player's view, which has no hidden groups", () => {
      const { g, maya } = withEnvironment()
      const view = project(g, 'player')
      expect(sections(targetOptions({ kind: 'hero', id: maya }, 'attack', viewTable(view)))).toEqual([['Rooftop Heist', ['Drones 1', 'Drones 2']]])
      expect(allOptions(targetOptions({ kind: 'hero', id: maya }, 'attack', viewTable(view), { showOtherSide: true })).map((o) => o.name)).not.toContain('Lurkers 1')
    })
  })
})
