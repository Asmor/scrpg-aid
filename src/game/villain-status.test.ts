import { describe, expect, it } from 'vitest'
import { setHealth, type Clock } from '../play/state'
import { completeHero } from '../test/heroes'
import { adaptiveBruiser } from '../test/villains'
import type { Villain } from '../villain/model'
import { villainHealth } from '../villain/play'
import { buildVillainSheet } from '../villain/sheet'
import { createGame, type Game } from './model'
import { project } from './project'
import { addChallenge, addGroup, addHero, addVillain, changeHeroPlay, changeVillainPlay, removeMember, setChallengeOwner, setChallengeStep, setEnvironment, setHidden } from './table'
import { countLabel, logStatusChanges, newStatusLines, setHandCount, setStatusOverride, setWeakness, statusLadder, statusRuleLine, tableCount, villainStatus } from './villain-status'

function makeClock(at = '2026-11-04T12:00:00Z'): Clock {
  let n = 0
  return { now: new Date(at), newId: () => `id${++n}` }
}
const c = makeClock()

/** A villain of an archetype, with the Bruiser's other choices (status only looks at the archetype). */
const of = (archetype: string, id = 'v'): Villain => {
  const base = adaptiveBruiser()
  return { ...base, id, details: { ...base.details, name: id === 'v' ? 'Gravelord' : id }, archetype: { id: archetype, abilities: [] } }
}

function table(archetype: string, hidden = false): Game {
  return addVillain(createGame({ id: 'g' }), of(archetype), c, hidden)
}
const main = (g: Game) => g.villains.find((v) => v.sourceId === 'v')!
const status = (g: Game) => villainStatus(main(g), g)!

const minions = (g: Game, n: number, hidden = false, name = 'Grave Guard') => addGroup(g, { kind: 'minions', name, die: 'd8', count: n, hidden }, c)
const lieutenants = (g: Game, n: number, hidden = false) => addGroup(g, { kind: 'lieutenants', name: 'Siege Crawler', die: 'd10', count: n, hidden }, c)

describe('villainStatus: fixed', () => {
  it('Indomitable is always d8, whatever is on the table', () => {
    let g = table('indomitable')
    expect(status(g)).toEqual({ die: 'd8', source: 'auto', reason: 'Never changes' })
    g = minions(g, 9)
    expect(status(g).die).toBe('d8')
  })
})

describe('villainStatus: Health zone', () => {
  const hurt = (g: Game, health: number) => changeVillainPlay(g, main(g).id, (p, s) => setHealth(p, villainHealth(s, p), health, c), c)

  it('Bruiser follows its zone through its own dice', () => {
    let g = table('bruiser')
    expect(status(g)).toMatchObject({ die: 'd6', source: 'auto', reason: 'Health in the Green zone' })
    const { healthRanges } = villainHealth(main(g).sheet, main(g).play)
    g = hurt(g, healthRanges!.yellow[1])
    expect(status(g)).toMatchObject({ die: 'd8', reason: 'Health in the Yellow zone' })
    g = hurt(g, healthRanges!.red[1])
    expect(status(g)).toMatchObject({ die: 'd10', reason: 'Health in the Red zone' })
  })

  it('Fragile runs the other way', () => {
    let g = table('fragile')
    expect(status(g).die).toBe('d10')
    const { healthRanges } = villainHealth(main(g).sheet, main(g).play)
    g = hurt(g, healthRanges!.red[1])
    expect(status(g).die).toBe('d6')
  })

  it('a defeated villain has no die', () => {
    const g = hurt(table('bruiser'), 0)
    const s = status(g)
    expect(s.die).toBeUndefined()
    expect(s.reason).toBe('Defeated')
  })
})

describe('villainStatus: counted from the table', () => {
  it('Overlord counts every GM minion and lieutenant, revealed only', () => {
    let g = table('overlord')
    expect(status(g)).toMatchObject({ die: 'd4', count: 0, source: 'auto', reason: '0 GM minions and lieutenants' })
    g = lieutenants(minions(g, 4), 1)
    expect(status(g)).toMatchObject({ die: 'd10', count: 5, reason: '5 GM minions and lieutenants' })
    expect(tableCount(main(g), g)?.parts).toEqual(['Grave Guard ×4', 'Siege Crawler ×1'])
    g = minions(g, 6, true)
    expect(status(g).count).toBe(5)
    g = addGroup(g, { kind: 'minions', name: 'Env', die: 'd4', count: 3, hidden: false, owner: { kind: 'environment' } }, c)
    expect(status(g).count).toBe(5)
  })

  it('says one in the singular', () => {
    expect(status(minions(table('overlord'), 1)).reason).toBe('1 GM minion or lieutenant')
  })

  it('Legion counts GM minions, not lieutenants, and its die runs the other way', () => {
    let g = table('legion')
    expect(status(g)).toMatchObject({ die: 'd12', count: 0 })
    g = lieutenants(g, 5)
    expect(status(g).count).toBe(0)
    g = minions(g, 9)
    expect(status(g)).toMatchObject({ die: 'd4', count: 9, reason: '9 GM minions' })
  })

  it("Domain doesn't count the GM's challenges or a Titan's, until one is given to the environment", () => {
    let g = setEnvironment(table('domain'), { name: 'Rooftop', hidden: false }, c)
    g = addVillain(g, of('titan', 'titan'), c, false)
    g = addChallenge(g, { name: 'Vault', steps: 1, hidden: false }, c)
    expect(status(g)).toMatchObject({ die: 'd6', count: 0 })
    const titan = g.challenges.find((x) => x.linkedVillainId)!
    const vault = g.challenges.find((x) => x.name === 'Vault')!
    expect(titan.owner).toEqual({ kind: 'gm' })
    expect(setChallengeOwner(g, titan.id, 'environment', c)).toBe(g)
    g = setChallengeOwner(g, vault.id, 'environment', c)
    expect(status(g)).toMatchObject({ die: 'd8', count: 1 })
    g = setChallengeOwner(g, vault.id, 'gm', c)
    expect(status(g)).toMatchObject({ die: 'd6', count: 0 })
  })

  it("Domain counts the environment's groups and challenges not yet done, revealed only", () => {
    let g = table('domain')
    expect(status(g)).toMatchObject({ die: 'd6', count: 0 })
    g = addGroup(g, { kind: 'minions', name: 'Burglars', die: 'd6', count: 2, hidden: false, owner: { kind: 'environment' } }, c)
    g = addGroup(g, { kind: 'minions', name: 'Staged', die: 'd6', count: 4, hidden: true, owner: { kind: 'environment' } }, c)
    g = minions(g, 5)
    expect(status(g)).toMatchObject({ die: 'd8', count: 2 })
    g = addChallenge(g, { name: 'Furnace', steps: 1, hidden: false, owner: { kind: 'environment' } }, c)
    g = addChallenge(g, { name: 'Vault', steps: 1, hidden: true, owner: { kind: 'environment' } }, c)
    g = addChallenge(g, { name: "The GM's", steps: 1, hidden: false }, c)
    expect(status(g)).toMatchObject({ die: 'd10', count: 3 })
    expect(tableCount(main(g), g)?.parts).toEqual(['Burglars ×2', 'Furnace'])
    const furnace = g.challenges.find((x) => x.name === 'Furnace')!
    g = setChallengeStep(g, furnace.id, 0, true, c)
    expect(status(g)).toMatchObject({ die: 'd8', count: 2 })
  })

  it('Squad and Loner count other revealed villains, not themselves', () => {
    for (const [arch, none, one] of [['squad', 'd6', 'd8'], ['loner', 'd10', 'd8']] as const) {
      let g = table(arch)
      expect(status(g)).toMatchObject({ die: none, count: 0 })
      g = addVillain(g, of('bruiser', 'Other'), c, true)
      expect(status(g).count).toBe(0)
      g = setHidden(g, { kind: 'villain', id: g.villains[1]!.id }, false, c)
      expect(status(g)).toMatchObject({ die: one, count: 1, reason: '1 other villain' })
    }
  })

  it('Inhibitor counts heroes with at least one penalty', () => {
    let g = addHero(addHero(table('inhibitor'), { ...completeHero(), id: 'a' }, c), { ...completeHero(), id: 'b' }, c)
    expect(status(g)).toMatchObject({ die: 'd6', count: 0 })
    const [a, b] = g.heroes
    g = changeHeroPlay(g, a!.id, (p) => ({ ...p, mods: [{ id: 'm', label: 'x', value: 2 }] }), c)
    expect(status(g).count).toBe(0)
    g = changeHeroPlay(g, b!.id, (p) => ({ ...p, mods: [{ id: 'm', label: 'x', value: -2 }] }), c)
    expect(status(g)).toMatchObject({ die: 'd8', count: 1, reason: '1 hero with a penalty' })
  })
})

describe('villainStatus: counted by hand', () => {
  it.each([
    ['guerrilla', 4, 'd10', '4 opponents engaged', 'Opponents engaged with Gravelord'],
    ['predator', 2, 'd8', '2 heroes engaged', 'Heroes engaged with Gravelord'],
    ['inventor', 1, 'd8', '1 invention in play', 'Bonuses and penalties made with Inventions or Science, and inventions in the scene'],
  ])('%s takes the count the GM enters', (arch, n, die, reason, label) => {
    let g = table(arch)
    expect(tableCount(main(g), g)).toBeUndefined()
    expect(status(g).count).toBe(0)
    g = setHandCount(g, main(g).id, n, c)
    expect(status(g)).toMatchObject({ die, source: 'count', count: n, reason })
    expect(countLabel(main(g))).toBe(label)
  })

  it("keeps the GM's count out of the shared log", () => {
    const g = setHandCount(table('predator', false), 'nope', 1, c)
    const h = setHandCount(g, main(g).id, 3, c)
    expect(h.feed).toEqual(g.feed)
    expect(main(h).play.history.at(-1)?.text).toBe('Status count is now 3.')
  })
})

describe('villainStatus: weakness', () => {
  it('starts at the last condition, and follows the choice', () => {
    let g = table('formidable')
    expect(status(g).die).toBe('d12')
    g = setWeakness(g, main(g).id, 0, 'Has penalties', c)
    expect(status(g)).toMatchObject({ die: 'd4', source: 'auto' })
    expect(status(g).reason).toMatch(/^Has penalties related to its weakness/)
  })
})

describe('villainStatus: challenge', () => {
  const titan = (steps: boolean[]) => {
    const g = table('titan')
    return { ...g, challenges: g.challenges.map((ch) => ({ ...ch, steps: steps.map((done, i) => ({ label: `Step ${i + 1}`, done })) })) }
  }
  it('drops one size for each completed part', () => {
    expect(status(titan([false, false, false]))).toMatchObject({ die: 'd12', reason: '0 of 2 parts done' })
    // The first part takes two successes.
    expect(status(titan([true, false, false])).die).toBe('d12')
    expect(status(titan([true, true, false]))).toMatchObject({ die: 'd10', reason: '1 of 2 parts done' })
    expect(status(titan([false, false, true])).die).toBe('d10')
    expect(status(titan([true, true, true]))).toMatchObject({ die: 'd8', reason: '2 of 2 parts done' })
  })
  it('stays at its start with no challenge', () => {
    expect(status({ ...table('titan'), challenges: [] }).die).toBe('d12')
  })
})

describe('overrides', () => {
  it('counting by hand replaces the table count, and clears', () => {
    let g = minions(table('overlord'), 5)
    g = setStatusOverride(g, main(g).id, { count: 1 })
    expect(status(g)).toMatchObject({ die: 'd6', count: 1, source: 'count', reason: '1 GM minion or lieutenant' })
    expect(tableCount(main(g), g)?.count).toBe(5)
    g = setStatusOverride(g, main(g).id, undefined)
    expect(status(g)).toMatchObject({ die: 'd10', count: 5, source: 'auto' })
    expect(main(g).statusOverride).toBeUndefined()
  })

  it('setting the die by hand wins for every basis', () => {
    for (const arch of ['indomitable', 'bruiser', 'overlord', 'predator', 'formidable', 'titan']) {
      let g = table(arch)
      g = setStatusOverride(g, main(g).id, { die: 'd4' })
      expect(status(g)).toMatchObject({ die: 'd4', source: 'manual', reason: 'Set by hand' })
    }
  })

  it('leaves other villains and unknown ones alone', () => {
    const g = table('overlord')
    expect(setStatusOverride(g, 'nope', { die: 'd4' })).toBe(g)
  })

  it('an empty override is none', () => {
    const g = table('overlord')
    expect(main(setStatusOverride(g, main(g).id, {})).statusOverride).toBeUndefined()
  })
})

describe('the rule in words', () => {
  it.each([
    ['overlord', 'Overlord · by GM minions and lieutenants in the scene'],
    ['predator', 'Predator · by heroes engaged with it'],
    ['bruiser', 'Bruiser · follows its Health zone'],
    ['formidable', 'Formidable · by penalties tied to its weakness'],
    ['titan', 'Titan · d12, one size lower per completed part of its challenge'],
    ['indomitable', 'Indomitable · always d8'],
  ])('%s', (arch, line) => {
    const g = table(arch)
    expect(statusRuleLine(main(g))).toBe(line)
  })

  it('the ladder runs lowest count first, with the rung the count is on', () => {
    const g = table('overlord')
    const rule = buildVillainSheet(main(g).sheet).status
    if (rule?.basis !== 'count') throw new Error('expected a count rule')
    expect(statusLadder(rule.tiers, 5)).toEqual([
      { range: '0', die: 'd4', current: false },
      { range: '1–2', die: 'd6', current: false },
      { range: '3–4', die: 'd8', current: false },
      { range: '5–8', die: 'd10', current: true },
      { range: '9+', die: 'd12', current: false },
    ])
  })
})

describe('logStatusChanges', () => {
  const later = (ms: number) => makeClock(new Date(new Date('2026-11-04T12:00:00Z').getTime() + ms).toISOString())
  const statusLines = (g: Game) => g.feed.filter((e) => e.statusOf)

  it('logs a GM-only line when the die changes', () => {
    const g = minions(table('overlord'), 4)
    const next = logStatusChanges(g, lieutenants(g, 1), c)
    expect(statusLines(next)).toMatchObject([{ gmOnly: true, text: "Gravelord's status die is now d10 (5 GM minions and lieutenants).", statusOf: main(g).id }])
    expect(project(next, 'player').feed.some((e) => e.statusOf)).toBe(false)
  })

  describe('setting the die by hand', () => {
    const die = (g: Game, override: { die?: 'd4' | 'd10' | 'd12' } | undefined, at: number) => logStatusChanges(g, setStatusOverride(g, main(g).id, override), later(at))
    const texts = (g: Game) => statusLines(g).map((e) => e.text)
    const auto = "Gravelord's status die is now d10 (5 GM minions and lieutenants)."
    const manual = (d: string) => `Gravelord's status die is now ${d} (Set by hand).`
    const atD10 = () => {
      const g = minions(table('overlord'), 4)
      return logStatusChanges(g, lieutenants(g, 1), later(0))
    }

    it('logs setting it and going back, GM only, however fast', () => {
      const set = die(atD10(), { die: 'd12' }, 200)
      expect(texts(set)).toEqual([auto, manual('d12')])
      expect(statusLines(set).every((e) => e.gmOnly)).toBe(true)
      expect(texts(die(set, undefined, 400))).toEqual([auto, manual('d12'), auto])
    })

    it('logs choosing the die it already has, since the reason changed', () => {
      expect(texts(die(atD10(), { die: 'd10' }, 5000))).toEqual([auto, manual('d10')])
    })

    it('never logs the same line twice in a row', () => {
      // The die moved away with no line, and comes back: the last line already says this.
      const g = atD10()
      expect(texts(logStatusChanges(setStatusOverride(g, main(g).id, { count: 1 }), g, later(9000)))).toEqual([auto])
    })
  })

  it('a burst that ends where it started leaves no line', () => {
    const start = minions(table('overlord'), 4)
    const g = logStatusChanges(start, lieutenants(start, 1), later(0))
    const up = logStatusChanges(g, setStatusOverride(g, main(g).id, { count: 3 }), later(5000))
    expect(statusLines(up).map((e) => e.text)).toHaveLength(2)
    const back = logStatusChanges(up, setStatusOverride(up, main(up).id, undefined), later(5500))
    expect(statusLines(back).map((e) => e.text)).toEqual(["Gravelord's status die is now d10 (5 GM minions and lieutenants)."])
  })

  it('logs nothing when the count moves within a tier, or nothing changed', () => {
    const g = minions(table('overlord'), 5)
    expect(statusLines(logStatusChanges(g, minions(g, 1, false, 'More'), c))).toEqual([])
    expect(logStatusChanges(g, g, c)).toBe(g)
  })

  it('coalesces changes within a second into one line, and starts a new one after', () => {
    let g = minions(table('overlord'), 5)
    const group = g.groups[0]!
    const remove = (x: Game, i: number, at: number) => logStatusChanges(x, removeMember(x, group.id, group.members[i]!.id, later(at)), later(at))
    g = remove(g, 0, 0)
    g = remove(g, 1, 200)
    g = remove(g, 2, 400)
    const lines = statusLines(g)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text).toBe("Gravelord's status die is now d6 (2 GM minions and lieutenants).")
    g = remove(g, 3, 2000)
    // Still d6: nothing new to say.
    expect(statusLines(g)).toHaveLength(1)
    g = remove(g, 4, 4000)
    expect(statusLines(g).at(-1)?.text).toBe("Gravelord's status die is now d4 (0 GM minions and lieutenants).")
    expect(statusLines(g)).toHaveLength(2)
  })

  it('revealing a group logs it too', () => {
    const g = minions(table('overlord'), 5, true)
    const next = logStatusChanges(g, setHidden(g, { kind: 'group', id: g.groups[0]!.id }, false, c), c)
    expect(statusLines(next)[0]?.text).toContain('d10 (5 GM minions and lieutenants)')
  })

  it('stays quiet for a villain arriving, one leaving, a solo game, and a defeated villain', () => {
    const g = createGame({ id: 'g' })
    expect(statusLines(logStatusChanges(g, addVillain(g, of('overlord'), c), c))).toEqual([])
    const on = table('overlord')
    expect(statusLines(logStatusChanges(on, { ...on, villains: [] }, c))).toEqual([])
    const solo = { ...table('overlord'), solo: { kind: 'villain' as const, sourceId: 'v' } }
    expect(logStatusChanges(solo, minions(solo, 5), c).feed.some((e) => e.statusOf)).toBe(false)
    const bruiser = table('bruiser')
    const dead = changeVillainPlay(bruiser, main(bruiser).id, (p, s) => setHealth(p, villainHealth(s, p), 0, c), c)
    expect(statusLines(logStatusChanges(bruiser, dead, c))).toEqual([])
  })

  it('finds new and changed lines to announce', () => {
    const a = { id: 'a', at: 'x', by: 'GM', text: 'one', statusOf: 'v' }
    const b = { id: 'b', at: 'x', by: 'GM', text: 'plain' }
    expect(newStatusLines([a], [a, b])).toEqual([])
    expect(newStatusLines([a], [{ ...a, text: 'two' }])).toEqual(['two'])
    expect(newStatusLines([], [a])).toEqual(['one'])
  })
})

describe('project', () => {
  it("gives the status die and reason to the GM only", () => {
    let g: Game = minions(table('overlord'), 5)
    g = setEnvironment(g, { name: 'Foundry', hidden: false }, c)
    expect(project(g, 'gm').villains[0]).toMatchObject({ statusDie: 'd10', statusReason: '5 GM minions and lieutenants' })
    for (const audience of ['player', 'observer'] as const) {
      const v = project(g, audience).villains[0]!
      expect(v.statusDie).toBeUndefined()
      expect(v.statusReason).toBeUndefined()
    }
  })
})
