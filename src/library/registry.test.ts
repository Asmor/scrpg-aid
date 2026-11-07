import { describe, expect, it } from 'vitest'
import { NewHeroes } from '../app/new-heroes'
import { exampleHero } from '../hero/example'
import { createHero, duplicateHero } from '../hero/model'
import { MemoryHeroStore } from '../hero/store'
import { adaptiveBruiser } from '../test/villains'
import { createVillain, duplicateVillain } from '../villain/model'
import { MemoryGameStore } from '../game/store'
import { MemoryVillainStore } from '../villain/store'
import { createSoloGame, soloGameId } from '../game/solo'
import { draftStepText, heroType, issuesText, itemFields, LIBRARY_TYPES, libraryType, toItem, villainType } from './registry'

const stores = () => ({ heroes: new MemoryHeroStore(), villains: new MemoryVillainStore(), games: new MemoryGameStore() })

describe('library types', () => {
  it('lists heroes, villains, then the NPC templates, by key; games have their own page', () => {
    expect(LIBRARY_TYPES.map((t) => [t.key, t.label, t.plural, t.inGames])).toEqual([
      ['hero', 'Hero', 'Heroes', 'hero'],
      ['villain', 'Villain', 'Villains', 'villain'],
      ['minion', 'Minion', 'Minions', 'minion'],
      ['lieutenant', 'Lieutenant', 'Lieutenants', 'lieutenant'],
      ['challenge', 'Challenge', 'Challenges', 'challenge'],
      ['environment', 'Environment', 'Environments', 'environment'],
    ])
    expect(libraryType('villain')).toBe(villainType)
    expect(libraryType('game')).toBeUndefined()
    expect(libraryType('environment')?.label).toBe('Environment')
    expect(libraryType('scene')).toBeUndefined()
  })

  it('reads, saves and removes through the stores', async () => {
    const s = stores()
    await heroType.save(s, exampleHero({ id: 'h' }))
    await villainType.save(s, adaptiveBruiser())
    expect((await heroType.list(s)).docs.map((d) => d.id)).toEqual(['h'])
    expect((await villainType.list(s)).docs.map((d) => d.id)).toEqual(['v1'])
    await heroType.remove(s, 'h')
    expect((await heroType.list(s)).docs).toEqual([])
  })

  it('deletes a character’s solo game with it', async () => {
    const s = stores()
    const clock = { now: new Date(), newId: () => 'x' }
    await heroType.save(s, exampleHero({ id: 'h' }))
    await s.games.save(createSoloGame('hero', exampleHero({ id: 'h' }), clock))
    await villainType.save(s, adaptiveBruiser())
    await s.games.save(createSoloGame('villain', adaptiveBruiser(), clock))
    await heroType.remove(s, 'h')
    await villainType.remove(s, 'v1')
    expect(await s.games.get(soloGameId('hero', 'h'))).toEqual({ status: 'missing' })
    expect(await s.games.get(soloGameId('villain', 'v1'))).toEqual({ status: 'missing' })
  })
})

describe('hero rows', () => {
  it('shows archetype · power source and Play, and nothing from play', () => {
    const hero = exampleHero({ id: 'h' })
    const row = heroType.row(hero)
    expect(row).toEqual({ colors: expect.anything(), name: 'Afterimage', named: true, draft: false, details: 'Speedster · Accident', openHref: '#/hero/h', primary: { label: 'Play', href: '#/hero/h/play' }, editHref: '#/hero/h/edit' })
  })

  it('counts rule issues, linking to the edit summary', () => {
    const hero = exampleHero({ id: 'h' })
    hero.background!.qualities[0]!.die = 'd4'
    const row = heroType.row(hero)
    expect(row.issues!.count).toBeGreaterThan(0)
    expect(row.issues!.href).toBe('#/hero/h/edit')
    expect(issuesText(1)).toBe('1 rule issue')
    expect(issuesText(3)).toBe('3 rule issues')
  })

  it('shows a draft’s step and Continue to its furthest step', () => {
    const hero = { ...createHero('guided', { id: 'h' }), status: 'draft' as const, furthestStep: 3 }
    expect(heroType.row(hero)).toMatchObject({ name: 'Unnamed hero', named: false, draft: true, details: 'Step 3 of 8 · Archetype', primary: { label: 'Continue', href: '#/hero/h/edit/archetype' } })
    expect(draftStepText(undefined)).toBe('At Start')
    expect(draftStepText(99)).toBe('Step 8 of 8 · Details')
  })

  it('creates a draft held in memory and opens the wizard', async () => {
    const newHeroes = new NewHeroes()
    const s = stores()
    const path = await heroType.create!({ stores: s, newHeroes })
    const id = decodeURIComponent(/#\/hero\/([^/]+)\/edit\/start/.exec(path)![1]!)
    expect(newHeroes.get(id)?.status).toBe('draft')
    expect((await s.heroes.list()).heroes).toEqual([])
  })
})

describe('villain rows', () => {
  it('shows approach archetype · category and Play, and nothing from play', () => {
    const row = villainType.row(adaptiveBruiser())
    expect(row).toEqual({ colors: expect.anything(), name: 'Ironclad', named: true, draft: false, details: 'Adaptive Bruiser', kind: 'Minor', openHref: '#/villain/v1', primary: { label: 'Play', href: '#/villain/v1/play' }, editHref: '#/villain/v1/edit' })
  })

  it('counts issues, linking to the first step with one', () => {
    const blank = villainType.row(createVillain({ id: 'v2' }))
    expect(blank).toMatchObject({ name: 'Unnamed villain', named: false, details: '', issues: { href: '#/villain/v2/edit/approach' } })
  })

  it('shows a draft as its step, with Continue', () => {
    const draft = { ...adaptiveBruiser(), status: 'draft' as const, furthestStep: 3 }
    expect(villainType.row(draft)).toEqual({ colors: { primary: 'red' }, name: 'Ironclad', named: true, draft: true, details: 'Step 3 of 7 · Archetype', openHref: '#/villain/v1', primary: { label: 'Continue', href: '#/villain/v1/edit/archetype' }, editHref: '#/villain/v1/edit/archetype' })
    expect(villainType.row({ ...draft, furthestStep: undefined }).details).toBe('Step 1 of 7 · Concept')
    expect(villainType.row({ ...draft, furthestStep: 99 }).details).toBe('Step 7 of 7 · Finishing touches')
  })

  it('starts a new villain in the wizard, saving nothing yet', async () => {
    const s = stores()
    expect(await villainType.create!({ stores: s, newHeroes: new NewHeroes() })).toBe('#/villain/new')
    expect((await s.villains.list()).villains).toEqual([])
  })
})

describe('duplicate', () => {
  const now = new Date('2026-11-01T00:00:00Z')

  it('copies a hero with a new id and name, and the same tags', () => {
    const hero = { ...exampleHero({ id: 'h' }), tags: ['prep'] }
    const copy = duplicateHero(hero, { id: 'h2', now })
    expect(copy).toMatchObject({ id: 'h2', createdAt: now.toISOString(), updatedAt: now.toISOString(), tags: ['prep'] })
    expect(copy.details.name).toBe('Afterimage (copy)')
    expect(copy.background).toEqual(hero.background)
    // The original is untouched.
    expect(hero.details.name).toBe('Afterimage')
  })

  it('uses the alias when there is no name, and leaves an unnamed one unnamed', () => {
    const aliasOnly = createHero('guided', { id: 'a' })
    aliasOnly.details.alias = 'Blur'
    expect(duplicateHero(aliasOnly).details.alias).toBe('Blur (copy)')
    expect(duplicateHero(createHero('guided')).details.name).toBe('')
  })

  it('copies a villain the same way', () => {
    const v = { ...adaptiveBruiser(), tags: ['scene-3'] }
    const copy = duplicateVillain(v, { id: 'v2', now })
    expect(copy).toMatchObject({ id: 'v2', tags: ['scene-3'], details: { name: 'Ironclad (copy)' } })
    const alias = createVillain()
    alias.details.alias = 'Doc'
    expect(duplicateVillain(alias).details.alias).toBe('Doc (copy)')
  })

  it('goes through the registry, with the single-item export', () => {
    expect(heroType.duplicate(exampleHero({ id: 'h' })).id).not.toBe('h')
    expect(villainType.duplicate(adaptiveBruiser()).details.name).toBe('Ironclad (copy)')
    expect(heroType.exportFile(exampleHero({ id: 'h' })).name).toBe('afterimage.json')
    expect(JSON.parse(villainType.exportFile(adaptiveBruiser()).text)).toMatchObject({ format: 'scrpg-villain' })
  })
})

describe('items', () => {
  it('gives the query and sort what they look at', () => {
    const item = toItem(villainType as never, { ...adaptiveBruiser(), tags: ['a'] })
    expect(itemFields(item)).toEqual({ type: 'villain', typeLabel: 'Villain', name: 'Ironclad', tags: ['a'], updatedAt: '2026-10-27T12:00:00.000Z' })
  })
})
