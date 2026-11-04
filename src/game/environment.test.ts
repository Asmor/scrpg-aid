import { describe, expect, it } from 'vitest'
import type { Clock } from '../play/state'
import { tableViewProblem } from '../session/protocol'
import { createEnvironmentTemplate, createLieutenantTemplate, createMinionTemplate, type EnvironmentTemplate } from '../template/model'
import { addAttached, attachedGroup, environmentBasicAction, environmentFromTemplate, logEnvironmentRoll, resetTwists, rollAspects, setAspects, setTwistUsed, twistTitle } from './environment'
import { createGame, type Game } from './model'
import { project } from './project'
import { addGroup, addHero, setEnvironment, startRound, syncTurnOrder } from './table'
import { completeHero } from '../test/heroes'
import { buildSheet } from '../creation/sheet'
import { currentHealth } from '../play/state'
import type { RollRecord } from '../play/roll'
import { targetOptions, gmTable } from './target-options'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-03T12:00:00Z'), newId: () => `id${++n}` }
}

/** Dice that come up as these values, in order. */
const dice = (...values: number[]) => {
  const queue = [...values]
  // A d-n value v: (v - 0.5) / n. The aspects are d10, d6 and d8 in that order.
  const sizes = [10, 6, 8]
  let i = 0
  return () => (queue.shift()! - 0.5) / sizes[i++ % 3]!
}

const drones = { ...createMinionTemplate({ id: 'm' }), name: 'Security drones', die: 'd6' as const, groupSize: 3, actions: ['attack' as const] }
const captain = { ...createLieutenantTemplate({ id: 'l' }), name: 'Night Watch Captain', die: 'd10' as const, groupSize: 1 }
const heist: EnvironmentTemplate = {
  ...createEnvironmentTemplate({ id: 'e' }),
  name: 'Rooftop Heist',
  description: 'Slick tiles and a long drop.',
  aspects: [{ name: 'Slick Tiles', die: 'd10' }, { name: 'Howling Wind', die: 'd6' }, { name: 'Night Security', die: 'd8' }],
  twists: [
    { id: 't1', zone: 'yellow', kind: 'minor', name: 'Floodlights', text: 'Everyone is seen.' },
    { id: 't2', zone: 'red', kind: 'major', text: 'The roof gives way under the heaviest hero.' },
  ],
  attached: [{ kind: 'minion', templateId: 'm' }, { kind: 'lieutenant', templateId: 'l' }, { kind: 'minion', templateId: 'gone' }],
}

function table(): { g: Game; c: Clock } {
  const c = clock()
  const g = setEnvironment(createGame({ id: 'g' }), environmentFromTemplate(heist, [{ kind: 'minion', doc: drones }, { kind: 'lieutenant', doc: captain }]), c)
  return { g: { ...g, feed: [] }, c }
}

describe('an environment template on the table', () => {
  it('brings copies of its aspects, twists and attached templates, hidden', () => {
    const { g } = table()
    expect(g.environment).toMatchObject({
      templateId: 'e',
      name: 'Rooftop Heist',
      hidden: true,
      description: 'Slick tiles and a long drop.',
      aspects: heist.aspects,
      twists: heist.twists,
      attached: [
        { kind: 'minion', templateId: 'm', name: 'Security drones', die: 'd6', actions: ['attack'], groupSize: 3 },
        { kind: 'lieutenant', templateId: 'l', name: 'Night Watch Captain', die: 'd10', actions: 'any', groupSize: 1 },
      ],
    })
    expect(g.environment!.aspects).not.toBe(heist.aspects)
  })

  it('shows players its name and description only, within what the table view carries', () => {
    const { g, c } = table()
    const revealed = { ...g, environment: { ...g.environment!, hidden: false, twists: g.environment!.twists!.map((t) => ({ ...t, used: { round: 1 } })) } }
    expect(project(revealed, 'player').environment).toEqual({ id: g.environment!.id, name: 'Rooftop Heist', hidden: false, description: 'Slick tiles and a long drop.' })
    expect(project(revealed, 'observer').environment).not.toHaveProperty('twists')
    expect(project(revealed, 'gm').environment).toHaveProperty('aspects')
    expect(tableViewProblem(project(revealed, 'player'))).toBeUndefined()
    const long = setEnvironment(createGame({ id: 'g' }), { name: 'n'.repeat(300), description: 'd'.repeat(3000), hidden: false }, c)
    expect([long.environment!.name.length, long.environment!.description!.length]).toEqual([200, 2000])
    expect(tableViewProblem(project(long, 'player'))).toBeUndefined()
  })

  it('rolls the environment dice as Min, Mid and Max, naming each aspect, logged for everyone', () => {
    const { g, c } = table()
    const roll = rollAspects(g.environment!.aspects!, dice(7, 2, 5))!
    expect([roll.min, roll.mid, roll.max].map((d) => [d.value, d.aspect])).toEqual([
      [2, 'Howling Wind'],
      [5, 'Night Security'],
      [7, 'Slick Tiles'],
    ])
    // The environment is always known, so its lines are public, even while it's hidden.
    const logged = logEnvironmentRoll(g, roll, c).feed.at(-1)
    expect(logged).toMatchObject({ text: 'Rolled the environment dice: Min 2 (Howling Wind), Mid 5 (Night Security), Max 7 (Slick Tiles).' })
    expect(logged).not.toHaveProperty('gmOnly')
    expect(rollAspects([], dice())).toBeUndefined()
  })

  it('sets the three aspects of a quick-added environment', () => {
    const c = clock()
    let g = setEnvironment(createGame({ id: 'g' }), { name: 'Docks', hidden: false }, c)
    expect(g.environment!.aspects).toBeUndefined()
    g = setAspects(g, [{ name: ' Fog ', die: 'd6' }, { name: '', die: 'd8' }, { name: 'Cranes', die: 'd10' }], c)
    expect(g.environment!.aspects).toEqual([{ name: 'Fog', die: 'd6' }, { name: '', die: 'd8' }, { name: 'Cranes', die: 'd10' }])
    expect(g.feed.at(-1)).toMatchObject({ text: "The GM set Docks's aspects: Fog (d6), Aspect 2 (d8), Cranes (d10)." })
    expect(g.feed.at(-1)).not.toHaveProperty('gmOnly')
    expect(setAspects(g, [{ name: 'Only one', die: 'd6' }], c)).toBe(g)
    // Public even while the environment is hidden.
    const hidden = { ...g, environment: { ...g.environment!, hidden: true } }
    expect(setAspects(hidden, [{ name: 'Fog', die: 'd6' }, { name: '', die: 'd8' }, { name: 'Cranes', die: 'd10' }], c).feed.at(-1)).not.toHaveProperty('gmOnly')
  })

  it('marks twists used in the round, unmarks them, and resets them all', () => {
    const { g, c } = table()
    expect(setTwistUsed(g, 't1', true, c).feed.at(-1)).not.toHaveProperty('gmOnly')
    let next = setTwistUsed({ ...g, round: 2, environment: { ...g.environment!, hidden: false } }, 't1', true, c)
    expect(next.environment!.twists![0]!.used).toEqual({ round: 2 })
    expect(next.feed.at(-1)!.text).toBe('Twist used: Floodlights.')
    expect(next.feed.at(-1)).not.toHaveProperty('gmOnly')
    expect(setTwistUsed(next, 't1', true, c)).toBe(next)
    next = setTwistUsed(next, 't2', true, c)
    next = setTwistUsed(next, 't1', false, c)
    expect(next.environment!.twists!.map((t) => t.used)).toEqual([undefined, { round: 2 }])
    expect(next.feed.at(-1)!.text).toBe('Twist marked unused: Floodlights.')
    next = resetTwists(next, c)
    expect(next.environment!.twists!.every((t) => !t.used)).toBe(true)
    expect(next.feed.at(-1)!.text).toBe('The GM reset the twists: none are used.')
    expect(next.feed.at(-1)).not.toHaveProperty('gmOnly')
    expect(resetTwists(next, c)).toBe(next)
    expect(twistTitle({ text: 'x'.repeat(50) })).toBe(`${'x'.repeat(40)}…`)
  })

  it('adds an attached template as a revealed group of its own, then more to that group', () => {
    const { g, c } = table()
    let next = addAttached(g, 0, 2, c)
    const group = attachedGroup(next, { kind: 'minion', templateId: 'm' })!
    expect(group).toMatchObject({ name: 'Security drones', hidden: false, owner: { kind: 'environment' }, actions: ['attack'], templateId: 'm' })
    expect(group.members.map((m) => [m.n, m.die])).toEqual([
      [1, 'd6'],
      [2, 'd6'],
    ])
    // An environment's group has no turn-order entry.
    expect(syncTurnOrder(next).turn.order.filter((o) => o.kind === 'group')).toEqual([])
    next = addAttached(next, 0, 2, c)
    expect(next.groups).toHaveLength(1)
    expect(next.groups[0]!.members.map((m) => m.n)).toEqual([1, 2, 3, 4])
    expect(next.feed.at(-1)!.text).toBe('The GM added 2 more to Security drones.')
    // Up to the most a group holds.
    next = addAttached(next, 0, 30, c)
    expect(next.groups[0]!.members).toHaveLength(20)
    expect(addAttached(next, 0, 1, c)).toBe(next)
    expect(addAttached(next, 5, 1, c)).toBe(next)
    // A GM group from the same template is a different group.
    const gm = addGroup(g, { kind: 'minions', name: 'Security drones', die: 'd6', count: 1, hidden: false, templateId: 'm' }, c)
    expect(addAttached(gm, 0, 1, c).groups.map((x) => x.owner.kind)).toEqual(['gm', 'environment'])
  })

  it("hands a replaced environment's groups to the GM, each with its own turn", () => {
    const { g, c } = table()
    const withGroup = addAttached(g, 0, 2, c)
    const replaced = setEnvironment(withGroup, { name: 'Docks', hidden: false }, c)
    expect(replaced.groups.map((x) => x.owner.kind)).toEqual(['gm'])
    expect(replaced.turn.order.filter((o) => o.kind === 'group')).toHaveLength(1)
    expect(attachedGroup(replaced, { kind: 'minion', templateId: 'm' })).toBeUndefined()
  })

  it("clears its groups' acted marks when its turn starts", () => {
    const { g, c } = table()
    let next = addAttached({ ...g, environment: { ...g.environment!, hidden: false } }, 0, 2, c)
    next = { ...next, groups: next.groups.map((x) => ({ ...x, members: x.members.map((m) => ({ ...m, acted: true })) })) }
    next = startRound(syncTurnOrder(next), { kind: 'environment', id: next.environment!.id }, c)
    expect(next.groups[0]!.members.every((m) => !m.acted)).toBe(true)
  })
})

describe("the environment's basic actions", () => {
  const record = (action: 'attack' | 'hinder' | 'defend' | 'overcome', total: number): RollRecord => ({
    title: 'Took a basic action:',
    rolled: [{ label: 'Slick Tiles', die: 'd10', value: total }],
    results: [{ action, use: 'max', base: total, mods: [], total }],
    manual: false,
  })

  function withHero() {
    const { g, c } = table()
    const next = addAttached(addHero(g, { ...completeHero(), details: { ...completeHero().details, name: 'Maya Reyes' } }, c), 0, 1, c)
    return { g: next, c, maya: next.heroes[0]!.id, drone: next.groups[0]! }
  }
  const health = (g: Game) => currentHealth(buildSheet(g.heroes[0]!.sheet), g.heroes[0]!.play)!

  it('logs the roll and attacks a hero, publicly even while the environment is hidden', () => {
    const { g, c, maya } = withHero()
    const next = environmentBasicAction(g, record('attack', 6), [], [{ result: 0, to: `hero:${maya}` }], dice(), c)
    expect(health(next)).toBe(health(g) - 6)
    const lines = next.feed.slice(g.feed.length)
    expect(lines.map((l) => [l.text, l.gmOnly])).toEqual([
      ['Rooftop Heist used the environment dice: Deal 6 (Max) damage.', undefined],
      ['Rooftop Heist attacked Maya Reyes: 6 damage.', undefined],
      // The hero's own history, as with any hit.
      [expect.stringMatching(/^Lost 6 HP/), undefined],
    ])
  })

  it("gives a Hinder's penalty, a Defend, and logs an Overcome", () => {
    const { g, c, maya, drone } = withHero()
    const shown = { ...g, environment: { ...g.environment!, hidden: false } }
    let next = environmentBasicAction(shown, record('hinder', 5), [{ mod: { label: 'Slick', value: -2 }, to: `hero:${maya}` }], [], dice(), c)
    expect(next.heroes[0]!.play.mods).toMatchObject([{ label: 'Slick', value: -2 }])
    next = environmentBasicAction(next, record('defend', 4), [], [{ result: 0, to: `member:${drone.id}:${drone.members[0]!.id}` }], dice(), c)
    expect(next.groups[0]!.members[0]!.defenses).toMatchObject([{ value: 4, from: 'Rooftop Heist' }])
    next = environmentBasicAction(next, record('overcome', 6), [], [], dice(), c)
    expect(next.feed.at(-1)).toMatchObject({ text: 'Rooftop Heist used the environment dice: Overcome 6 (Success with a minor twist).' })
    expect(next.feed.at(-1)).not.toHaveProperty('gmOnly')
    // No environment: nothing happens.
    expect(environmentBasicAction(createGame({ id: 'x' }), record('attack', 3), [], [], dice(), c).feed).toEqual([])
  })

  it('has no side: every list shows everyone, heroes, opposition and its own groups', () => {
    const { g } = withHero()
    for (const effect of ['attack', 'boost'] as const) {
      const list = targetOptions({ kind: 'environment' }, effect, gmTable(g))
      expect(list).toMatchObject({ likely: [], sideless: true })
      expect(list.always!.map((s) => [s.label, s.options.map((o) => o.name)])).toEqual([
        ['Heroes', ['Maya Reyes']],
        ['Rooftop Heist', ['Security drones 1']],
      ])
    }
  })
})
