import { describe, expect, it } from 'vitest'
import { buildSheet } from '../creation/sheet'
import { completeHero } from '../test/heroes'
import { abilityAvailable, addMod, clearHeroDefenses, dropDefense, gainDefense, takeDamage, addTwist, currentHealth, describeMod, effectiveZone, emptyPlay, healthZone, newIssue, noteGivenMod, removeMod, removeTwist, setDividedForm, setForm, setHealth, setHeroPoints, setReactionUsed, setSceneZone, statusDieFor, type Clock } from './state'

// completeHero: Max Health 30; Green 30–23, Yellow 22–12, Red 11–1; Lone Wolf d8/d8/d8.
const sheet = buildSheet(completeHero())
const clock = (): Clock => {
  let n = 0
  return { now: new Date('2026-10-26T20:00:00Z'), newId: () => `id${++n}` }
}
const texts = (play: { history: { text: string }[] }) => play.history.map((h) => h.text)

describe('zones', () => {
  it('starts at max Health, in Green', () => {
    expect(currentHealth(sheet, undefined)).toBe(30)
    expect(effectiveZone(sheet, undefined)).toBe('green')
  })

  it('finds the zone from Health, with 0 Out', () => {
    expect([30, 23, 22, 12, 11, 1, 0].map((h) => healthZone(sheet, h))).toEqual(['green', 'green', 'yellow', 'yellow', 'red', 'red', 'out'])
  })

  it('uses whichever of the hero’s and the scene’s zone is further along', () => {
    const play = { ...emptyPlay(), health: 20 }
    expect(effectiveZone(sheet, play)).toBe('yellow')
    expect(effectiveZone(sheet, { ...play, sceneZone: 'red' })).toBe('red')
    expect(effectiveZone(sheet, { ...play, health: 5, sceneZone: 'yellow' })).toBe('red')
  })

  it('shows a stored Health above a max that has since dropped as the max', () => {
    expect(currentHealth(sheet, { ...emptyPlay(), health: 40 })).toBe(30)
  })

  it('lets abilities be used by zone, and only the Out ability when Out', () => {
    const table = (['green', 'yellow', 'red', 'out'] as const).map((from) => [undefined, 'green', 'yellow', 'red', 'out'].map((z) => abilityAvailable(from, z as never)))
    expect(table).toEqual([
      [true, true, true, true, false],
      [false, false, true, true, false],
      [false, false, false, true, false],
      [false, false, false, false, true],
    ])
  })

  it('gives the zone’s status die, and none when Out', () => {
    expect(statusDieFor(sheet, 'yellow')).toBe('d8')
    expect(statusDieFor(sheet, 'out')).toBeUndefined()
  })
})

describe('changes and their history', () => {
  it('records Health changes, with the zone they enter', () => {
    const c = clock()
    let play = setHealth(emptyPlay(), sheet, 17, c)
    play = setHealth(play, sheet, 13, c)
    play = setHealth(play, sheet, 25, c)
    play = setHealth(play, sheet, -4, c)
    play = setHealth(play, sheet, 99, c)
    expect(texts(play)).toEqual([
      'Lost 13 HP (30 → 17). Entered Yellow status.',
      'Lost 4 HP (17 → 13).',
      'Gained 12 HP (13 → 25). Back to Green status.',
      'Lost 25 HP (25 → 0). Out!',
      'Gained 30 HP (0 → 30). Back to Green status.',
    ])
    expect(play.health).toBe(30)
    expect(play.history[0]).toEqual({ id: 'id1', at: '2026-10-26T20:00:00.000Z', text: 'Lost 13 HP (30 → 17). Entered Yellow status.' })
  })

  it('adds and removes mods', () => {
    const c = clock()
    let play = addMod(emptyPlay(), { label: ' tied up ', value: -3 }, c)
    play = addMod(play, { label: 'high ground', value: 2, persistent: true, exclusive: true }, c)
    play = addMod(play, { label: 'nothing', value: 0 }, c)
    expect(play.mods.map(describeMod)).toEqual(["'-3 tied up' penalty", "'+2 high ground' bonus (persistent, exclusive)"])
    play = removeMod(play, play.mods[0]!.id, c, 'Used up')
    expect(texts(play)).toEqual(["Gained '-3 tied up' penalty.", "Gained '+2 high ground' bonus (persistent, exclusive).", "Used up '-3 tied up' penalty."])
    expect(play.mods).toHaveLength(1)
  })

  it('counts hero points up to 5, and tracks the reaction and the scene', () => {
    const c = clock()
    let play = setHeroPoints(emptyPlay(), 2, c)
    play = setHeroPoints(play, 9, c)
    play = setHeroPoints(play, 4, c)
    play = setReactionUsed(play, true, c)
    play = setReactionUsed(play, false, c)
    play = setSceneZone(play, 'red', c)
    play = setSceneZone(play, 'green', c)
    expect(texts(play)).toEqual([
      'Gained 2 hero points (now 2).',
      'Gained 3 hero points (now 5).',
      'Spent a hero point (now 4).',
      'Used this round’s reaction.',
      'Reaction ready again.',
      'The scene is now Red.',
      'The scene is now Green.',
    ])
    expect(play.sceneZone).toBeUndefined()
  })

  it('takes and clears twists', () => {
    const c = clock()
    let play = addTwist(emptyPlay(), { kind: 'minor', text: 'Sprained ankle' }, c)
    play = addTwist(play, { kind: 'major', text: '  ' }, c)
    play = removeTwist(play, play.twists[0]!.id, c)
    expect(texts(play)).toEqual(['Took a minor twist: Sprained ankle.', 'Cleared the minor twist: Sprained ankle.'])
  })

  it('starts a new issue, keeping the history', () => {
    const c = clock()
    let play = setHealth(addMod(emptyPlay(), { label: 'x', value: 1 }, c), sheet, 10, c)
    play = newIssue(play, c)
    expect(play.mods).toEqual([])
    expect(play.health).toBeUndefined()
    expect(texts(play).at(-1)).toMatch(/^Started a new issue/)
    expect(play.history).toHaveLength(3)
  })
})

describe('forms', () => {
  const clock = { now: new Date('2026-10-26T20:00:00Z'), newId: () => 'x' }

  it('changes form or mode, and Divided form, noting it', () => {
    const inBrute = setForm(emptyPlay(), 'form:0', 'Brute', clock)
    expect(inBrute).toMatchObject({ form: 'form:0', history: [{ text: 'Changed to Brute.' }] })
    expect(setForm(inBrute, 'form:0', 'Brute', clock)).toBe(inBrute)
    expect(setForm(inBrute, undefined, 'Base form', clock)).not.toHaveProperty('form')
    const heroic = setDividedForm(emptyPlay(), 'heroic', clock)
    expect(heroic).toMatchObject({ dividedForm: 'heroic', history: [{ text: 'Changed to heroic form.' }] })
    expect(setDividedForm(heroic, 'civilian', clock)).not.toHaveProperty('dividedForm')
    expect(setDividedForm(emptyPlay(), 'civilian', clock).history).toEqual([])
  })

  it('stays in the same form for a new issue', () => {
    expect(newIssue({ ...emptyPlay(), form: 'mode:1', dividedForm: 'heroic', heroPoints: 2 }, clock)).toMatchObject({ form: 'mode:1', dividedForm: 'heroic', heroPoints: 0 })
    expect(newIssue(emptyPlay(), clock)).not.toHaveProperty('form')
  })
})

describe('giving mods', () => {
  it('notes a mod given to another hero, without adding it', () => {
    const play = noteGivenMod(emptyPlay(), { label: 'rallied', value: 2 }, 'Bolt', { now: new Date('2026-10-27T10:00:00Z'), newId: () => 'x' })
    expect(play.mods).toEqual([])
    expect(play.history.map((h) => h.text)).toEqual(["Gave '+2 rallied' bonus to Bolt."])
  })
})

describe('defenses in solo play (ruling 65)', () => {
  it('gains a defense from a Defend, none for 0', () => {
    const c = clock()
    const play = gainDefense(emptyPlay(), 5, 'Maya', c)
    expect(play.defenses).toEqual([{ id: 'id1', value: 5, from: 'Maya' }])
    expect(texts(play)).toEqual(['Gained a defense: Defend 5.'])
    expect(gainDefense(play, 0, 'Maya', c)).toBe(play)
  })

  it('takes damage after one defense, the default or the one chosen', () => {
    const c = clock()
    const held = { ...emptyPlay(), defenses: [{ id: 'a', value: 3, from: '' }, { id: 'b', value: 10, from: '' }] }
    let play = takeDamage(held, sheet, 8, c)
    expect([currentHealth(sheet, play), play.defenses]).toEqual([25, [{ id: 'b', value: 10, from: '' }]])
    expect(texts(play)).toEqual(['Took 8 damage (Defend 3 blocked 3, 5 taken).', 'Lost 5 HP (30 → 25).'])
    play = takeDamage(held, sheet, 8, c, 'b')
    expect(currentHealth(sheet, play)).toBe(30)
    expect(texts(play)).toEqual(['Took 8 damage (Defend 10 blocked 8, 0 taken).'])
    // Without defenses it's plain damage; a bad amount changes nothing.
    expect(texts(takeDamage(emptyPlay(), sheet, 4, c))).toEqual(['Took 4 damage.', 'Lost 4 HP (30 → 26).'])
    expect(takeDamage(held, sheet, 0, c)).toBe(held)
  })

  it('removes one defense, or clears them all', () => {
    const c = clock()
    const held = { ...emptyPlay(), defenses: [{ id: 'a', value: 3, from: '' }, { id: 'b', value: 10, from: '' }] }
    const one = dropDefense(held, 'a', c)
    expect([one.defenses, texts(one)]).toEqual([[{ id: 'b', value: 10, from: '' }], ['Removed a defense: Defend 3.']])
    expect(dropDefense(held, 'gone', c)).toBe(held)
    const none = clearHeroDefenses(held, c)
    expect(none).not.toHaveProperty('defenses')
    expect(texts(none)).toEqual(['Defenses cleared.'])
    expect(clearHeroDefenses(emptyPlay(), c)).toEqual(emptyPlay())
  })
})
