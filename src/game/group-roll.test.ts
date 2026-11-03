import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import type { Hero, PlayMod } from '../hero/model'
import { currentHealth, type Clock } from '../play/state'
import type { Die } from '../rules/types'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { createGame, heroCopy, villainCopy, type Game } from './model'
import { actionsText, applyGroupRoll, applySave, applySaves, rollSaves, verdictText, groupActionList, npcRollMods, npcTargetId, npcTargets, parseNpcTarget, rollMath, rollMembers, rollSave, saveText, type GroupRollRow } from './npc'
import { addGroup, addMemberMod, syncTurnOrder } from './table'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-03T12:00:00Z'), newId: () => `id${++n}` }
}

/** Dice that come up as these values, in order (each for the die it's rolled on). */
function dice(...rolls: [number, Die][]): () => number {
  const queue = [...rolls]
  return () => {
    const [value, die] = queue.shift() ?? [1, 'd4']
    return (value - 0.5) / Number(die.slice(1))
  }
}

const mod = (id: string, value: number, extra: Partial<PlayMod> = {}): PlayMod => ({ id, label: id, value, ...extra })

function table() {
  const c = clock()
  const maya: Hero = { ...completeHero(), id: 'lib-maya', details: { ...completeHero().details, name: 'Maya Reyes' } }
  const gravelord = { ...adaptiveBruiser(), id: 'lib-g', details: { ...adaptiveBruiser().details, name: 'Gravelord' } }
  let game: Game = syncTurnOrder({ ...createGame({ id: 'g' }), heroes: [heroCopy(maya, 'h1')], villains: [villainCopy(gravelord, 'v1', false)] })
  game = { ...game, heroes: game.heroes.map((h) => ({ ...h, play: { ...h.play, minions: [{ id: 'm1', name: 'Rat', die: 'd6', action: 'attack', mods: [] }] } })) }
  game = addGroup(game, { kind: 'minions', name: 'Burglars', die: 'd8', count: 3, hidden: false }, c)
  game = addGroup(game, { kind: 'lieutenants', name: 'Guards', die: 'd10', count: 1, hidden: false }, c)
  const burglars = game.groups[0]!
  const guards = game.groups[1]!
  return { game: { ...game, feed: [] }, c, burglars, guards, ids: burglars.members.map((m) => m.id) }
}

const health = (game: Game) => {
  const h = game.heroes[0]!
  return currentHealth(buildSheet(h.sheet), h.play)
}
const texts = (game: Game) => game.feed.map((e) => e.text)
const row = (memberId: string, value: number, target?: string, mods: PlayMod[] = []): GroupRollRow => ({ memberId, roll: { value, mods, total: value + mods.reduce((s, m) => s + m.value, 0) }, ...(target ? { target: parseNpcTarget(target)! } : {}) })

describe('rolling for a group', () => {
  it('uses every mod but the weaker exclusive ones', () => {
    const mods = [mod('a', 1), mod('b', -1), mod('c', 2, { exclusive: true }), mod('d', 3, { exclusive: true }), mod('e', -2, { exclusive: true }), mod('f', -1, { exclusive: true })]
    expect(npcRollMods(mods).map((m) => m.id)).toEqual(['a', 'b', 'd', 'e'])
  })

  it('rolls each chosen member with its own die and mods', () => {
    const { game, burglars, ids, c } = table()
    const g = addMemberMod(game, burglars.id, ids[1]!, { label: 'Dazed', value: -1 }, c)
    const rows = rollMembers(g.groups[0]!, [ids[0]!, ids[1]!], dice([5, 'd8'], [5, 'd8']))
    expect(rows.map((r) => [r.roll.value, r.roll.total, rollMath(r.roll)])).toEqual([
      [5, 5, '5'],
      [5, 4, '5 − 1 Dazed'],
    ])
  })

  it('names the actions a group can take', () => {
    expect(actionsText({ actions: 'any' })).toBe('Any basic action')
    expect(actionsText({ actions: ['hinder', 'attack'] })).toBe('Attack or Hinder')
    expect(actionsText({ actions: ['attack', 'boost', 'hinder'] })).toBe('Attack, Boost or Hinder')
    expect(groupActionList({ actions: ['hinder', 'attack'] })).toEqual(['attack', 'hinder'])
  })

  it('offers targets by action', () => {
    const { game, guards } = table()
    const names = (action: Parameters<typeof npcTargets>[1]) => npcTargets(game, action).map((t) => t.name)
    expect(names('attack')).toEqual(['Maya Reyes', "Rat (Maya Reyes's minion)"])
    expect(names('hinder')).toEqual(['Maya Reyes'])
    expect(names('boost')).toEqual(['Gravelord', 'Burglars 1', 'Burglars 2', 'Burglars 3', 'Guards 1'])
    expect(names('defend')).toEqual(names('boost'))
    expect(names('overcome')).toEqual([])
    const id = npcTargetId({ kind: 'member', groupId: guards.id, memberId: guards.members[0]!.id })
    expect(parseNpcTarget(id)).toEqual({ kind: 'member', groupId: guards.id, memberId: guards.members[0]!.id })
    expect(parseNpcTarget('heroMinion:h1:m1')).toEqual({ kind: 'heroMinion', heroId: 'h1', minionId: 'm1' })
    expect(parseNpcTarget('nonsense')).toBeUndefined()
  })
})

describe('applying a group roll', () => {
  it('deals Attack damage to heroes, logs each line, and marks the rolled members acted', () => {
    const { game, c, burglars, ids } = table()
    const before = health(game)!
    const g = applyGroupRoll(game, burglars.id, 'attack', [row(ids[0]!, 4, 'hero:h1'), row(ids[1]!, 3)], dice(), c)
    expect(health(g)).toBe(before - 4)
    expect(texts(g)).toContain('Burglars 1 attacked Maya Reyes: 4 damage.')
    expect(texts(g)).toContain('Burglars 2 took Attack: 3, with no target.')
    expect(g.groups[0]!.members.map((m) => m.acted)).toEqual([true, true, false])
  })

  it("rolls a hero minion's save when it's attacked", () => {
    const { game, c, burglars, ids } = table()
    let g = applyGroupRoll(game, burglars.id, 'attack', [row(ids[0]!, 4, 'heroMinion:h1:m1')], dice([5, 'd6']), c)
    expect(g.heroes[0]!.play.minions![0]!.die).toBe('d4')
    expect(texts(g)).toContain('Rat saved against 4 (rolled 5): drops to d4.')
    g = applyGroupRoll(g, burglars.id, 'attack', [row(ids[1]!, 4, 'heroMinion:h1:m1')], dice([2, 'd4']), c)
    expect(g.heroes[0]!.play.minions).toEqual([])
    expect(texts(g)).toContain("Rat failed its save against 4 (rolled 2): KO'd.")
  })

  it('gives sized penalties and bonuses for Hinder and Boost', () => {
    const { game, c, burglars, guards, ids } = table()
    let g = applyGroupRoll(game, burglars.id, 'hinder', [row(ids[0]!, 7, 'hero:h1')], dice(), c)
    expect(g.heroes[0]!.play.mods.map((m) => [m.label, m.value])).toEqual([['Burglars', -2]])
    expect(texts(g)).toContain('Burglars 1 hindered Maya Reyes: a −2 penalty.')
    const guard = npcTargetId({ kind: 'member', groupId: guards.id, memberId: guards.members[0]!.id })
    g = applyGroupRoll(g, burglars.id, 'boost', [row(ids[1]!, 3, guard), row(ids[2]!, 5, 'villain:v1')], dice(), c)
    expect(g.groups[1]!.members[0]!.mods.map((m) => m.value)).toEqual([1])
    expect(g.villains[0]!.play.mods.map((m) => m.value)).toEqual([2])
    expect(texts(g)).toContain('Burglars 3 boosted Gravelord: a +2 bonus.')
  })

  it('logs Defend and Overcome, and uses up one-time mods', () => {
    const { game, c, burglars, ids } = table()
    let g = addMemberMod(game, burglars.id, ids[0]!, { label: 'Dazed', value: -1 }, c)
    g = addMemberMod(g, burglars.id, ids[0]!, { label: 'Swarm', value: 1, persistent: true }, c)
    const mods = g.groups[0]!.members[0]!.mods
    g = applyGroupRoll(g, burglars.id, 'overcome', [row(ids[0]!, 6, undefined, mods)], dice(), c)
    expect(texts(g)).toContain('Burglars 1 took Overcome: 6 (Success with a minor twist).')
    expect(g.groups[0]!.members[0]!.mods.map((m) => m.label)).toEqual(['Swarm'])
    g = applyGroupRoll(g, burglars.id, 'defend', [row(ids[1]!, 5, 'villain:v1')], dice(), c)
    expect(texts(g)).toContain('Burglars 2 defended Gravelord: Defend 5.')
  })

  it('logs a hidden group for the GM only', () => {
    const { game, c, burglars, ids } = table()
    const hidden = { ...game, groups: game.groups.map((g) => (g.id === burglars.id ? { ...g, hidden: true } : g)) }
    const g = applyGroupRoll(hidden, burglars.id, 'attack', [row(ids[0]!, 4, 'hero:h1')], dice(), c)
    expect(g.feed.find((e) => e.text.startsWith('Burglars 1 attacked'))).toMatchObject({ gmOnly: true })
  })
})

describe('member saves', () => {
  it('describes every outcome', () => {
    expect(saveText('Burglars 2', 'minions', 'd8', 5, 6, { outcome: 'shrink', newDie: 'd6' })).toBe('Burglars 2 saved against 5 (rolled 6): drops to d6.')
    expect(saveText('Burglars 2', 'minions', 'd4', 3, 3, { outcome: 'stay' })).toBe('Burglars 2 saved against 3 (rolled 3): already d4, nothing happens.')
    expect(saveText('Guards 1', 'lieutenants', 'd8', 5, 6, { outcome: 'stay' })).toBe('Guards 1 saved against 5 (rolled 6): stays d8.')
    expect(saveText('Guards 1', 'lieutenants', 'd8', 7, 6, { outcome: 'shrink', newDie: 'd6' })).toBe('Guards 1 failed its save against 7 (rolled 6): drops to d6.')
    expect(saveText('Guards 1', 'lieutenants', 'd8', 16, undefined, { outcome: 'ko', noSave: true })).toBe("Guards 1 is KO'd outright: 16 damage is at least double its d8.")
  })

  it('rolls with the member’s mods, or not at all when the damage KOs it outright', () => {
    const { guards } = table()
    const guard = { ...guards.members[0]!, mods: [mod('dazed', -1)] }
    expect(rollSave('lieutenants', guard, 20, dice([9, 'd10']))).toEqual({ memberId: guard.id, damage: 20, result: { outcome: 'ko', noSave: true } })
    const s = rollSave('lieutenants', guard, 9, dice([9, 'd10']))
    expect(s.roll).toMatchObject({ value: 9, total: 8 })
    expect(s.result).toEqual({ outcome: 'shrink', newDie: 'd8' })
  })

  it("applies saves, and removes the group when its last member is KO'd", () => {
    const { game, c, guards } = table()
    const id = guards.members[0]!.id
    let g = applySave(game, guards.id, rollSave('lieutenants', guards.members[0]!, 11, dice([10, 'd10'])), c)
    expect(g.groups[1]!.members[0]!.die).toBe('d8')
    g = applySave(g, guards.id, { memberId: id, damage: 16, result: { outcome: 'ko', noSave: true } }, c)
    expect(g.groups.map((x) => x.name)).toEqual(['Burglars'])
    expect(g.turn.order.some((o) => o.id === guards.id)).toBe(false)
    expect(texts(g).slice(-2)).toEqual(["Guards 1 is KO'd outright: 16 damage is at least double its d8.", 'All of Guards are gone; the group left the table.'])
  })
  it('gives each verdict in words', () => {
    expect(verdictText('minions', 'd8', { outcome: 'ko' }, false)).toBe("Failed · KO'd")
    expect(verdictText('minions', 'd8', { outcome: 'shrink', newDie: 'd6' }, true)).toBe('Saved · Drops to d6')
    expect(verdictText('minions', 'd4', { outcome: 'stay' }, true)).toBe('Saved · Already d4, nothing happens')
    expect(verdictText('lieutenants', 'd8', { outcome: 'stay' }, true)).toBe('Saved · Stays d8')
    expect(verdictText('lieutenants', 'd8', { outcome: 'shrink', newDie: 'd6' }, false)).toBe('Failed · Drops to d6')
    expect(verdictText('lieutenants', 'd8', { outcome: 'ko', noSave: true }, false)).toBe("KO'd outright · Damage was at least double its d8, so no save")
  })

  it('rolls and applies saves for several members against the same damage', () => {
    const { game, c, burglars, ids } = table()
    const saves = rollSaves(burglars, [ids[0]!, ids[2]!], 5, dice([5, 'd8'], [2, 'd8']))
    expect(saves.map((s) => s.result.outcome)).toEqual(['shrink', 'ko'])
    const g = applySaves(game, burglars.id, saves, c)
    expect(g.groups[0]!.members.map((m) => [m.n, m.die])).toEqual([
      [1, 'd6'],
      [2, 'd8'],
    ])
    expect(texts(g)).toEqual(['Burglars 1 saved against 5 (rolled 5): drops to d6.', "Burglars 3 failed its save against 5 (rolled 2): KO'd."])
  })
})
