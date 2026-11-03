import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import type { Hero } from '../hero/model'
import { addDefense, blockWith, clearDefenses, defaultDefense, pickDefense, removeDefense, type Defended, type Defense } from '../play/defense'
import type { RollRecord } from '../play/roll'
import { currentHealth, type Clock } from '../play/state'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { villainHealth } from '../villain/play'
import { applyHeroAction, type HeroAction } from './actions'
import { applyAttack } from './attacks'
import { defend, hitCharacter } from './hits'
import { createGame, type Game } from './model'
import { applyGroupRoll, memberSaveText, npcTargetId, rollSave } from './npc'
import { addGroup, addHero, addVillain, handOff, startRound } from './table'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-03T12:00:00Z'), newId: () => `id${++n}` }
}
const d = (id: string, value: number): Defense => ({ id, value, from: 'x' })
const d6 = (value: number) => () => (value - 0.5) / 6

describe('choosing a defense (ruling 65)', () => {
  it('defaults to the largest that fits under the damage, or else the smallest', () => {
    const list = [d('a', 2), d('b', 5), d('c', 7)]
    expect(defaultDefense(list, 6)!.id).toBe('b')
    expect(defaultDefense(list, 5)!.id).toBe('b')
    expect(defaultDefense(list, 9)!.id).toBe('c')
    expect(defaultDefense(list, 1)!.id).toBe('a')
    expect(defaultDefense([], 4)).toBeUndefined()
    expect(pickDefense(list, 6, 'c')!.id).toBe('c')
    expect(pickDefense(list, 6, 'gone')!.id).toBe('b')
  })

  it('blocks up to its value', () => {
    expect(blockWith(8, d('a', 5))).toEqual({ taken: 3, blocked: 5 })
    expect(blockWith(4, d('a', 5))).toEqual({ taken: 0, blocked: 4 })
    expect(blockWith(4, undefined)).toEqual({ taken: 4, blocked: 0 })
  })

  it('adds, uses up and clears defenses, and adds none for 0', () => {
    const c = clock()
    let x = addDefense<Defended>({}, 5, 'Maya', c)
    x = addDefense(x, 0, 'Maya', c)
    expect(x.defenses!.map((y) => y.value)).toEqual([5])
    x = addDefense(x, 3, 'Jo', c)
    expect(removeDefense(x, x.defenses![0]!.id).defenses!.map((y) => y.value)).toEqual([3])
    expect(clearDefenses(x)).toEqual({})
    expect(removeDefense(removeDefense(x, x.defenses![0]!.id), x.defenses![1]!.id)).toEqual({})
  })
})

const named = (h: Hero, id: string, name: string): Hero => ({ ...h, id, details: { ...h.details, name } })

function table() {
  const c = clock()
  let g = createGame({ id: 'g' })
  g = addHero(g, named(completeHero(), 'maya-src', 'Maya Reyes'), c, { clientId: 'p1', name: 'Alex' })
  g = addHero(g, named(completeHero(), 'jo-src', 'Jo'), c, { clientId: 'p2', name: 'Sam' })
  g = addVillain(g, { ...adaptiveBruiser(), id: 'v1', details: { ...adaptiveBruiser().details, name: 'Gravelord' } }, c, false)
  g = addGroup(g, { kind: 'minions', name: 'Drones', die: 'd8', count: 2, hidden: false }, c)
  g = { ...g, feed: [] }
  return { g, c, maya: g.heroes[0]!.id, jo: g.heroes[1]!.id, villain: g.villains[0]!.id, group: g.groups[0]!, drone: g.groups[0]!.members[0]!.id }
}
const heroHp = (g: Game, id: string) => {
  const h = g.heroes.find((x) => x.id === id)!
  return currentHealth(buildSheet(h.sheet), h.play)!
}
const villainHp = (g: Game, id: string) => {
  const v = g.villains.find((x) => x.id === id)!
  return currentHealth(villainHealth(v.sheet, v.play), v.play)!
}

describe('hits after defenses', () => {
  it('blocks part of a hit on a hero, using the defense up', () => {
    const { g, c, maya } = table()
    let next = defend(g, { kind: 'hero', id: maya }, 5, 'Jo', c)
    next = hitCharacter(next, 'Gravelord', { kind: 'hero', id: maya }, 8, c, false)
    expect(heroHp(next, maya)).toBe(heroHp(g, maya) - 3)
    expect(next.heroes[0]!.play.defenses).toBeUndefined()
    expect(next.feed.at(0)!.text).toBe('Gravelord attacked Maya Reyes: 8 damage (Defend 5 blocked 5, 3 taken).')
  })

  it('blocks a smaller hit entirely, and still uses the defense', () => {
    const { g, c, villain } = table()
    let next = defend(g, { kind: 'villain', id: villain }, 5, 'Gravelord', c)
    next = hitCharacter(next, 'Maya Reyes', { kind: 'villain', id: villain }, 4, c, false)
    expect(villainHp(next, villain)).toBe(villainHp(g, villain))
    expect(next.villains[0]!.play.defenses).toBeUndefined()
  })

  it('uses exactly one defense per hit: the default, or the one chosen', () => {
    const { g, c, maya } = table()
    let next = defend(defend(g, { kind: 'hero', id: maya }, 2, 'Jo', c), { kind: 'hero', id: maya }, 6, 'Jo', c)
    const [two, six] = next.heroes[0]!.play.defenses!
    const hit = hitCharacter(next, 'Gravelord', { kind: 'hero', id: maya }, 5, c, false)
    expect(heroHp(hit, maya)).toBe(heroHp(g, maya) - 3)
    expect(hit.heroes[0]!.play.defenses).toEqual([six])
    next = hitCharacter(next, 'Gravelord', { kind: 'hero', id: maya }, 5, c, false, six!.id)
    expect(heroHp(next, maya)).toBe(heroHp(g, maya))
    expect(next.heroes[0]!.play.defenses).toEqual([two])
  })

  it("blocks before a member's save; with nothing getting through there's no save", () => {
    const { g, c, group, drone } = table()
    let next = defend(g, { kind: 'member', groupId: group.id, memberId: drone }, 3, 'Drones 2', c)
    const member = next.groups[0]!.members[0]!
    const s = rollSave('minions', member, 7, () => (4 - 0.5) / 8)
    expect(s).toMatchObject({ damage: 4, incoming: 7, defense: { value: 3 }, result: { outcome: 'shrink', newDie: 'd6' } })
    expect(memberSaveText('Drones 1', 'minions', 'd8', s)).toBe("Drones 1's Defend 3 blocked 3 of 7. Drones 1 saved against 4 (rolled 4): drops to d6.")
    const none = rollSave('minions', member, 2, d6(1))
    expect(none).toMatchObject({ damage: 0, noDamage: true, result: { outcome: 'stay' } })
    expect(none.roll).toBeUndefined()
    expect(memberSaveText('Drones 1', 'minions', 'd8', none)).toBe('Drones 1 took no damage: Defend 3 blocked all 2.')
    next = applyAttack(next, 'Maya Reyes', { kind: 'member', groupId: group.id, memberId: drone }, 2, d6(1), c).game
    expect(next.groups[0]!.members[0]).toMatchObject({ die: 'd8' })
    expect(next.groups[0]!.members[0]!.defenses).toBeUndefined()
  })
})

describe('making and losing defenses', () => {
  const record: RollRecord = {
    title: 'Took a basic action (Defend):',
    rolled: [{ label: 'Speed', die: 'd8', value: 5 }],
    results: [{ action: 'defend', use: 'mid', base: 5, mods: [], total: 5 }],
    manual: false,
  }
  const roll = (defends: { result: number; to?: { kind: 'hero'; id: string } }[]): HeroAction => ({ kind: 'roll', roll: { subject: { kind: 'basic', action: 'defend' }, record, selfMods: [], minionMods: [], others: [], made: [], attacks: [], defends } })

  it("gives a player's Defend to their hero, or to someone they protect", () => {
    const { g, maya, jo } = table()
    const self = applyHeroAction(g, maya, roll([{ result: 0 }]), { basedOn: 0, versions: {} }, clock())
    expect(self.ok && self.game.heroes[0]!.play.defenses).toMatchObject([{ value: 5, from: 'Maya Reyes' }])
    const other = applyHeroAction(g, maya, roll([{ result: 0, to: { kind: 'hero', id: jo } }]), { basedOn: 0, versions: {} }, clock())
    expect(other.ok && other.game.heroes[1]!.play.defenses).toMatchObject([{ value: 5, from: 'Maya Reyes' }])
    expect(other.ok && other.game.feed.at(-1)!.text).toBe('Maya Reyes protected Jo: Defend 5.')
  })

  it("gives a group's Defend to its target", () => {
    const { g, c, group, villain } = table()
    const rolled = { memberId: group.members[1]!.id, roll: { value: 4, mods: [], total: 4 }, target: { kind: 'villain' as const, id: villain } }
    const next = applyGroupRoll(g, group.id, 'defend', [rolled], d6(1), c)
    expect(next.villains[0]!.play.defenses).toMatchObject([{ value: 4, from: 'Drones 2' }])
    const toMember = applyGroupRoll(g, group.id, 'defend', [{ ...rolled, target: { kind: 'member' as const, groupId: group.id, memberId: group.members[0]!.id } }], d6(1), c)
    expect(toMember.groups[0]!.members[0]!.defenses).toMatchObject([{ value: 4 }])
    expect(npcTargetId(rolled.target)).toBe(`villain:${villain}`)
  })

  it("loses unused defenses when the defended character's turn starts", () => {
    const { g, c, maya, jo, group, drone, villain } = table()
    let next = defend(g, { kind: 'hero', id: maya }, 5, 'Jo', c)
    next = defend(next, { kind: 'member', groupId: group.id, memberId: drone }, 3, 'Drones 2', c)
    next = defend(next, { kind: 'villain', id: villain }, 4, 'Gravelord', c)
    next = startRound(next, { kind: 'hero', id: jo }, c)
    expect(next.heroes[0]!.play.defenses).toHaveLength(1)
    next = handOff(next, { kind: 'hero', id: maya }, c)
    expect(next.heroes[0]!.play.defenses).toBeUndefined()
    expect(next.groups[0]!.members[0]!.defenses).toHaveLength(1)
    next = handOff(next, { kind: 'group', id: group.id }, c)
    expect(next.groups[0]!.members[0]!.defenses).toBeUndefined()
    next = handOff(next, { kind: 'villain', id: villain }, c)
    expect(next.villains[0]!.play.defenses).toBeUndefined()
  })
})
