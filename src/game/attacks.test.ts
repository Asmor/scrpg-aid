import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import type { Hero } from '../hero/model'
import type { RollRecord } from '../play/roll'
import { currentHealth, type Clock } from '../play/state'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { villainHealth } from '../villain/play'
import { applyHeroAction, type HeroAction, type RollAction } from './actions'
import { applyAttack, villainAttackTargets } from './attacks'
import { createGame, type Game } from './model'
import { addGroup, addHero, addVillain } from './table'

function clock(): Clock {
  let n = 0
  return { now: new Date('2026-11-03T12:00:00Z'), newId: () => `id${++n}` }
}

/** A die that comes up `value` on a d6. */
const d6 = (value: number) => () => (value - 0.5) / 6

const named = (h: Hero, id: string, name: string): Hero => ({ ...h, id, details: { ...h.details, name } })

function table() {
  const c = clock()
  let g = createGame({ id: 'g' })
  g = addHero(g, named(completeHero(), 'maya-src', 'Maya Reyes'), c, { clientId: 'p1', name: 'Alex' })
  g = addHero(g, named(completeHero(), 'jo-src', 'Jo'), c)
  g = addVillain(g, { ...adaptiveBruiser(), id: 'v1', details: { ...adaptiveBruiser().details, name: 'Gravelord' } }, c, false)
  g = addVillain(g, { ...adaptiveBruiser(), id: 'v2', details: { ...adaptiveBruiser().details, name: 'Secret' } }, c, true)
  g = addGroup(g, { kind: 'minions', name: 'Drones', die: 'd6', count: 2, hidden: false }, c)
  g = { ...g, feed: [] }
  const group = g.groups[0]!
  return { g, c, maya: g.heroes[0]!.id, jo: g.heroes[1]!.id, gravelord: g.villains[0]!, secret: g.villains[1]!, group, drone: group.members[0]!.id }
}

const heroHealth = (g: Game, id: string) => {
  const h = g.heroes.find((x) => x.id === id)!
  return currentHealth(buildSheet(h.sheet), h.play)!
}
const villainHp = (g: Game, id: string) => {
  const v = g.villains.find((x) => x.id === id)!
  return currentHealth(villainHealth(v.sheet, v.play), v.play)!
}
const texts = (g: Game) => g.feed.map((e) => e.text)

describe('an Attack with a target', () => {
  it("takes Health from a hero or a villain, and logs who attacked whom", () => {
    const { g, c, jo, gravelord } = table()
    let next = applyAttack(g, 'Maya Reyes', { kind: 'hero', id: jo }, 4, d6(1), c).game
    expect(heroHealth(next, jo)).toBe(heroHealth(g, jo) - 4)
    next = applyAttack(next, 'Maya Reyes', { kind: 'villain', id: gravelord.id }, 6, d6(1), c).game
    expect(villainHp(next, gravelord.id)).toBe(villainHp(g, gravelord.id) - 6)
    expect(texts(next)).toContain('Maya Reyes attacked Jo: 4 damage.')
    expect(texts(next)).toContain('Maya Reyes attacked Gravelord: 6 damage.')
  })

  it("rolls a member's save straight away, and returns its line for the attacker", () => {
    const { g, c, group, drone } = table()
    const hit = applyAttack(g, 'Maya Reyes', { kind: 'member', groupId: group.id, memberId: drone }, 5, d6(6), c)
    expect(hit.note).toBe('Drones 1 saved against 5 (rolled 6): drops to d4.')
    expect(hit.game.groups[0]!.members[0]!.die).toBe('d4')
    expect(texts(hit.game)).toEqual(['Maya Reyes attacked Drones 1: 5 damage.', 'Drones 1 saved against 5 (rolled 6): drops to d4.'])
    const ko = applyAttack(hit.game, 'Maya Reyes', { kind: 'member', groupId: group.id, memberId: drone }, 5, d6(2), c)
    expect(ko.note).toBe("Drones 1 failed its save against 5 (rolled 2): KO'd.")
    expect(ko.game.groups[0]!.members.map((m) => m.n)).toEqual([2])
  })

  it('logs an attack on a hidden villain, or by a hidden attacker, for the GM only', () => {
    const { g, c, secret, jo } = table()
    expect(applyAttack(g, 'Maya Reyes', { kind: 'villain', id: secret.id }, 3, d6(1), c).game.feed[0]).toMatchObject({ gmOnly: true })
    expect(applyAttack(g, 'Secret', { kind: 'hero', id: jo }, 3, d6(1), c, true).game.feed[0]).toMatchObject({ gmOnly: true })
  })

  it('does nothing to someone no longer at the table', () => {
    const { g, c } = table()
    expect(applyAttack(g, 'Maya Reyes', { kind: 'hero', id: 'gone' }, 3, d6(1), c).game).toBe(g)
  })

  it("lists everyone but the villain itself as a villain's targets", () => {
    const { g, gravelord } = table()
    expect(villainAttackTargets(g, gravelord.id).map((t) => t.name)).toEqual(['Maya Reyes', 'Jo', 'Secret', 'Drones 1', 'Drones 2'])
  })
})

describe("a player's Attack with a target", () => {
  const record: RollRecord = {
    title: 'Took a basic action (Attack):',
    rolled: [{ label: 'Speed', die: 'd8', value: 5 }],
    results: [
      { action: 'attack', use: 'mid', base: 5, mods: [], total: 5 },
      { action: 'boost', use: 'min', base: 2, mods: [], total: 2 },
    ],
    manual: false,
  }
  const roll = (attacks: RollAction['attacks']): HeroAction => ({ kind: 'roll', roll: { subject: { kind: 'basic', action: 'attack' }, record, selfMods: [], minionMods: [], others: [], made: [], attacks, defends: [] } })

  it('applies the damage on the GM’s device, with the save’s line for the player', () => {
    const { g, maya, group, drone, gravelord } = table()
    const result = applyHeroAction(g, maya, roll([{ result: 0, to: { kind: 'member', groupId: group.id, memberId: drone } }]), { basedOn: 0, versions: {}, random: d6(5) }, clock())
    expect(result.ok && result.notes).toEqual(['Drones 1 saved against 5 (rolled 5): drops to d4.'])
    const villain = applyHeroAction(g, maya, roll([{ result: 0, to: { kind: 'villain', id: gravelord.id } }]), { basedOn: 0, versions: {} }, clock())
    expect(villain.ok && villainHp(villain.game, gravelord.id)).toBe(villainHp(g, gravelord.id) - 5)
    expect(villain.ok && villain.notes).toBeUndefined()
  })

  it("refuses a target for a result that isn't an Attack, or someone the player can't see", () => {
    const { g, maya, secret } = table()
    expect(applyHeroAction(g, maya, roll([{ result: 1, to: { kind: 'villain', id: secret.id } }]), { basedOn: 0, versions: {} }, clock())).toEqual({ ok: false, reason: "an Attack target is for a result that isn't an Attack" })
    expect(applyHeroAction(g, maya, roll([{ result: 0, to: { kind: 'villain', id: secret.id } }]), { basedOn: 0, versions: {} }, clock())).toEqual({ ok: false, reason: "someone you attacked isn't at the table any more" })
    const twice = roll([
      { result: 0, to: { kind: 'hero', id: g.heroes[1]!.id } },
      { result: 0, to: { kind: 'villain', id: g.villains[0]!.id } },
    ])
    expect(applyHeroAction(g, maya, twice, { basedOn: 0, versions: {} }, clock())).toEqual({ ok: false, reason: 'each Attack result has one target' })
  })
})
