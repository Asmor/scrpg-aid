import { beforeEach, describe, expect, it } from 'vitest'
import type { Hero } from '../hero/model'
import type { Clock } from '../play/state'
import { completeHero } from '../test/heroes'
import { applyHeroAction } from './actions'
import { createGame, type Game } from './model'
import { pendingSaveText, resolvePendingSave, rollWaitingSaves, waitingSaveText } from './pending-saves'
import { project } from './project'
import { applyAttack } from './resolve'
import { addGroup, addHero, addMemberMod } from './table'

let n = 0
const clock = (): Clock => ({ now: new Date('2026-11-09T12:00:00Z'), newId: () => `id${++n}` })
/** A die roll of `value` on a d6. */
const d6 = (value: number) => () => (value - 0.5) / 6
const maya: Hero = { ...completeHero(), id: 'maya-src', details: { ...completeHero().details, name: 'Maya Reyes' } }

/** Maya Reyes (Alex's), Burglars (two d6 minions, one Dazed) and Guards (a d8 lieutenant). */
function table(): Game {
  const c = clock()
  let g = addHero(createGame({ id: 'g' }), maya, c, { clientId: 'c1', name: 'Alex' })
  g = addGroup(g, { kind: 'minions', name: 'Burglars', die: 'd6', count: 2, hidden: false }, c)
  g = addGroup(g, { kind: 'lieutenants', name: 'Guards', die: 'd8', count: 1, hidden: false }, c)
  const burglars = g.groups[0]!
  return addMemberMod(g, burglars.id, burglars.members[1]!.id, { label: 'Dazed', value: -1 }, c)
}
const member = (g: Game, group: number, i: number) => ({ kind: 'member' as const, groupId: g.groups[group]!.id, memberId: g.groups[group]!.members[i]!.id })
const texts = (g: Game) => g.feed.map((e) => e.text)
const hold = { random: d6(6), holdSaves: true, forHero: 'h' }
let t0: Game
beforeEach(() => {
  t0 = table()
})

describe('a save from an Attack, held for the GM', () => {
  it('waits instead of rolling, after the attack line, saying who saves against what', () => {
    const g = applyAttack(t0, 'Maya Reyes', member(t0, 0, 1), 5, hold, clock()).game
    expect(g.pendingSaves).toMatchObject([{ damage: 5, from: 'Maya Reyes', forHero: 'h' }])
    expect(g.groups[0]!.members).toHaveLength(2)
    expect(texts(g).at(-1)).toBe('Maya Reyes attacked Burglars 2: 5 damage.')
    expect(pendingSaveText(g, g.pendingSaves![0]!)).toBe('Burglars 2 (d6, −1 Dazed) saves against 5')
    expect(waitingSaveText(g, g.pendingSaves![0]!)).toBe("Waiting for the GM to roll Burglars 2's save")
  })

  it('never waits for a lieutenant KO’d outright: no save is rolled', () => {
    const g = applyAttack(t0, 'Maya Reyes', member(t0, 1, 0), 16, hold, clock()).game
    expect(g.pendingSaves).toBeUndefined()
    expect(g.groups.map((x) => x.name)).toEqual(['Burglars'])
  })

  it('rolls at once when saves aren’t held', () => {
    const g = applyAttack(t0, 'Maya Reyes', member(t0, 0, 0), 5, { random: d6(6) }, clock()).game
    expect(g.pendingSaves).toBeUndefined()
    expect(texts(g).at(-1)).toMatch(/^Burglars 1 saved against 5 \(rolled 6\)/)
  })

  it('takes an entered number, with the member’s mods, logs the usual line, and toasts the attacker', () => {
    const held = applyAttack(t0, 'Maya Reyes', member(t0, 0, 1), 5, hold, clock()).game
    const g = resolvePendingSave(held, held.pendingSaves![0]!.id, { entered: 5 }, clock())
    expect(g.pendingSaves).toBeUndefined()
    // 5 − 1 Dazed = 4 against 5: KO'd.
    expect(g.groups[0]!.members).toHaveLength(1)
    expect(g.feed.at(-1)).toMatchObject({ toastFor: 'h' })
    expect(g.feed.at(-1)!.text).toMatch(/^Burglars 2 failed its save against 5/)
  })

  it('rolls with Roll for me', () => {
    const held = applyAttack(t0, 'Maya Reyes', member(t0, 0, 0), 3, hold, clock()).game
    const g = resolvePendingSave(held, held.pendingSaves![0]!.id, { random: d6(4) }, clock())
    expect(g.groups[0]!.members[0]!.die).toBe('d4')
  })

  it('drops a save whose member is gone', () => {
    let g = applyAttack(t0, 'Maya Reyes', member(t0, 0, 0), 3, hold, clock()).game
    g = { ...g, groups: g.groups.slice(1) }
    const after = resolvePendingSave(g, g.pendingSaves![0]!.id, { entered: 6 }, clock())
    expect(after.pendingSaves).toBeUndefined()
    expect(after.feed).toEqual(g.feed)
  })

  it('rolls every save still waiting, and says so', () => {
    let g = table()
    g = applyAttack(g, 'Maya Reyes', member(g, 0, 0), 3, hold, clock()).game
    g = applyAttack(g, 'Maya Reyes', member(g, 0, 1), 3, hold, clock()).game
    const rolled = rollWaitingSaves(g, d6(6), clock())
    expect(rolled.pendingSaves).toBeUndefined()
    expect(texts(rolled).slice(-3)[0]).toBe('Rolled 2 waiting saves automatically.')
    expect(rollWaitingSaves(t0, d6(6), clock())).toBe(t0)
  })
})

describe('waiting saves and the projection', () => {
  it('shows only the attacking player that theirs wait, and sends nobody the saves themselves', () => {
    let g = table()
    const heroId = g.heroes[0]!.id
    const result = applyHeroAction(
      g,
      heroId,
      {
        kind: 'roll',
        roll: {
          subject: { kind: 'basic', action: 'attack' },
          record: { title: 'Attack', rolled: [{ label: 'Speed', die: 'd8', value: 5 }], results: [{ action: 'attack', use: 'mid', base: 5, mods: [], total: 5 }], manual: false },
          selfMods: [],
          minionMods: [],
          others: [],
          made: [],
          defends: [],
          attacks: [{ result: 0, to: member(g, 0, 0) }],
        },
      },
      { basedOn: 0, versions: {}, random: d6(6), holdSaves: true },
      clock(),
    )
    expect(result.ok).toBe(true)
    g = (result as { game: Game }).game
    expect(g.pendingSaves).toMatchObject([{ forHero: heroId }])
    const mine = project(g, 'player', heroId)
    expect(mine.waitingSaves).toEqual(["Waiting for the GM to roll Burglars 1's save"])
    expect(project(g, 'player', 'someone-else').waitingSaves).toBeUndefined()
    expect(project(g, 'observer').waitingSaves).toBeUndefined()
    for (const view of [mine, project(g, 'observer'), project(g, 'gm')]) expect(view).not.toHaveProperty('pendingSaves')
  })
})
