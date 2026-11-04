import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import type { Hero } from '../hero/model'
import type { RollRecord } from '../play/roll'
import { currentHealth, type Clock } from '../play/state'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import { villainHealth } from '../villain/play'
import { applyHeroAction, type HeroAction, type RollAction } from './actions'
import { applyAttack, giveMod, protect, targetHidden, targetName } from './resolve'
import { createGame, type Game } from './model'
import { addMinion } from '../play/minions'
import { addGroup, addHero, addVillain, changeHeroPlay, startRound } from './table'

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

  it("adds a lieutenant's save bonus (Sturdy) to its save, without using it up", () => {
    const { g, c } = table()
    const sturdy = { name: 'Sturdy', type: 'I' as const, text: 'When rolling a damage save, add 2 to the result.', saveBonus: 2 }
    const withCrawler = addGroup(g, { kind: 'lieutenants', name: 'Siege Crawler', die: 'd10', count: 1, hidden: false, abilities: [sturdy] }, c)
    const crawler = withCrawler.groups[1]!
    // A 6 on its d10, plus 2: 8 against 7.
    const hit = applyAttack(withCrawler, 'Maya Reyes', { kind: 'member', groupId: crawler.id, memberId: crawler.members[0]!.id }, 7, () => 0.5, c)
    expect(hit.note).toBe('Siege Crawler 1 saved against 7 (rolled 8): stays d10.')
    expect(hit.game.groups[1]!.members[0]!.mods).toEqual([])
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

  it("rolls a hero's minion's save, after its defense", () => {
    const { c, jo } = table()
    const g = changeHeroPlay(table().g, jo, (p) => addMinion(p, { name: 'Rat', die: 'd8', action: 'attack' }, c), c)
    const rat = { kind: 'heroMinion' as const, heroId: jo, minionId: g.heroes[1]!.play.minions![0]!.id }
    expect(targetName(g, rat)).toBe('Rat')
    const hit = applyAttack(protect(g, 'Jo', rat, 2, c), 'Gravelord', rat, 7, d6(6), c)
    expect(hit.note).toBe("Rat's Defend 2 blocked 2 of 7. Rat saved against 5 (rolled 8): drops to d6.")
    expect(hit.game.heroes[1]!.play.minions![0]).toMatchObject({ die: 'd6' })
    expect(hit.game.heroes[1]!.play.minions![0]!.defenses).toBeUndefined()
    expect(texts(hit.game).slice(1)).toEqual(['Jo protected Rat: Defend 2.', 'Gravelord attacked Rat: 7 damage.', hit.note])
    // A defense that blocks it all: no damage, so no save.
    const blocked = applyAttack(protect(g, 'Jo', rat, 5, c), 'Gravelord', rat, 4, d6(1), c)
    expect(blocked.note).toBe('Rat took no damage: Defend 5 blocked all 4.')
    expect(blocked.game.heroes[1]!.play.minions![0]).toMatchObject({ die: 'd8' })
  })

  it("loses a hero's minion's defenses when its hero's turn starts", () => {
    const { c, jo } = table()
    let g = changeHeroPlay(table().g, jo, (p) => addMinion(p, { name: 'Rat', die: 'd8', action: 'attack' }, c), c)
    const rat = { kind: 'heroMinion' as const, heroId: jo, minionId: g.heroes[1]!.play.minions![0]!.id }
    g = protect(g, 'Jo', rat, 3, c)
    expect(g.heroes[1]!.play.minions![0]!.defenses).toHaveLength(1)
    g = startRound(g, { kind: 'hero', id: jo }, c)
    expect(g.heroes[1]!.play.minions![0]!.defenses).toBeUndefined()
  })

  it('gives a bonus or penalty to anyone at the table', () => {
    const { c, jo, gravelord, group, drone } = table()
    let g = changeHeroPlay(table().g, jo, (p) => addMinion(p, { name: 'Rat', die: 'd8', action: 'attack' }, c), c)
    const rat = { kind: 'heroMinion' as const, heroId: jo, minionId: g.heroes[1]!.play.minions![0]!.id }
    g = giveMod(g, rat, { label: 'Sneaky', value: 1 }, 'Gravelord', c)
    g = giveMod(g, { kind: 'hero', id: jo }, { label: 'Slowed', value: -2 }, 'Gravelord', c)
    g = giveMod(g, { kind: 'villain', id: gravelord.id }, { label: 'Pumped', value: 2 }, 'Drones 1', c)
    g = giveMod(g, { kind: 'member', groupId: group.id, memberId: drone }, { label: 'Pumped', value: 1 }, 'Gravelord', c)
    expect(g.heroes[1]!.play.minions![0]!.mods.map((m) => m.label)).toEqual(['Sneaky'])
    expect(g.heroes[1]!.play.mods.map((m) => m.label)).toEqual(['Slowed'])
    expect(g.villains[0]!.play.mods.map((m) => m.label)).toEqual(['Pumped'])
    expect(g.groups[0]!.members[0]!.mods.map((m) => m.value)).toEqual([1])
  })

  it('knows which targets players can see', () => {
    const { g, secret, gravelord, group, drone } = table()
    expect(targetHidden(g, { kind: 'villain', id: secret.id })).toBe(true)
    expect(targetHidden(g, { kind: 'villain', id: gravelord.id })).toBe(false)
    expect(targetHidden(g, { kind: 'member', groupId: group.id, memberId: drone })).toBe(false)
    const hidden = { ...g, groups: g.groups.map((x) => ({ ...x, hidden: true })) }
    expect(targetHidden(hidden, { kind: 'member', groupId: group.id, memberId: drone })).toBe(true)
    expect(protect(hidden, 'Gravelord', { kind: 'member', groupId: group.id, memberId: drone }, 2, clock()).feed.at(-1)).toMatchObject({ gmOnly: true })
    expect(protect(g, 'Gravelord', { kind: 'hero', id: 'gone' }, 2, clock())).toBe(g)
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

  it('can attack anyone: the hero themself, their own minion, or another hero’s', () => {
    const { c, maya, jo } = table()
    let g = changeHeroPlay(table().g, maya, (p) => addMinion(p, { name: 'Drone', die: 'd6', action: 'attack' }, c), c)
    g = changeHeroPlay(g, jo, (p) => addMinion(p, { name: 'Rat', die: 'd8', action: 'attack' }, c), c)
    const self = applyHeroAction(g, maya, roll([{ result: 0, to: { kind: 'hero', id: maya } }]), { basedOn: 0, versions: {} }, clock())
    expect(self.ok && heroHealth(self.game, maya)).toBe(heroHealth(g, maya) - 5)
    const own = applyHeroAction(g, maya, roll([{ result: 0, to: { kind: 'heroMinion', heroId: maya, minionId: g.heroes[0]!.play.minions![0]!.id } }]), { basedOn: 0, versions: {}, random: d6(1) }, clock())
    expect(own.ok && own.notes).toEqual(["Drone failed its save against 5 (rolled 1): KO'd."])
    const theirs = applyHeroAction(g, maya, roll([{ result: 0, to: { kind: 'heroMinion', heroId: jo, minionId: g.heroes[1]!.play.minions![0]!.id } }]), { basedOn: 0, versions: {}, random: d6(6) }, clock())
    expect(theirs.ok && theirs.game.heroes[1]!.play.minions![0]!.die).toBe('d6')
    expect(applyHeroAction(g, maya, roll([{ result: 0, to: { kind: 'heroMinion', heroId: jo, minionId: 'gone' } }]), { basedOn: 0, versions: {} }, clock())).toEqual({ ok: false, reason: "someone you attacked isn't at the table any more" })
  })

  it("gives a Boost's bonus to another hero's minion, and Defends one", () => {
    const { c, maya, jo } = table()
    const g = changeHeroPlay(table().g, jo, (p) => addMinion(p, { name: 'Rat', die: 'd8', action: 'attack' }, c), c)
    const rat = { kind: 'heroMinion' as const, heroId: jo, minionId: g.heroes[1]!.play.minions![0]!.id }
    const defendRecord: RollRecord = { ...record, results: [{ action: 'defend', use: 'mid', base: 5, mods: [], total: 5 }, { action: 'boost', use: 'min', base: 2, mods: [], total: 2 }] }
    const action: HeroAction = { kind: 'roll', roll: { subject: { kind: 'basic', action: 'defend' }, record: defendRecord, selfMods: [], minionMods: [], others: [{ to: rat, mod: { label: 'Cover', value: 1 } }], made: [], attacks: [], defends: [{ result: 0, to: rat }] } }
    const result = applyHeroAction(g, maya, action, { basedOn: 0, versions: {} }, clock())
    expect(result.ok && result.game.heroes[1]!.play.minions![0]).toMatchObject({ mods: [{ label: 'Cover', value: 1 }], defenses: [{ value: 5, from: 'Maya Reyes' }] })
    expect(result.ok && texts(result.game)).toContain('Maya Reyes protected Rat: Defend 5.')
  })
})
