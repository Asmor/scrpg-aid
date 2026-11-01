import { describe, expect, it } from 'vitest'
import { NewHeroes } from '../app/new-heroes'
import { exampleHero } from '../hero/example'
import { createHero, duplicateHero } from '../hero/model'
import { MemoryHeroStore } from '../hero/store'
import { emptyPlay } from '../play/state'
import { adaptiveBruiser } from '../test/villains'
import { createVillain, duplicateVillain } from '../villain/model'
import { MemoryGameStore } from '../game/store'
import { MemoryVillainStore } from '../villain/store'
import { createGame } from '../game/model'
import { draftStepText, gameType, heroType, issuesText, itemFields, LIBRARY_TYPES, libraryType, toItem, villainType } from './registry'

const stores = () => ({ heroes: new MemoryHeroStore(), villains: new MemoryVillainStore(), games: new MemoryGameStore() })

describe('library types', () => {
  it('lists heroes, villains, then games, by key', () => {
    expect(LIBRARY_TYPES.map((t) => [t.key, t.label, t.plural])).toEqual([
      ['hero', 'Hero', 'Heroes'],
      ['villain', 'Villain', 'Villains'],
      ['game', 'Game', 'Games'],
    ])
    expect(libraryType('villain')).toBe(villainType)
    expect(libraryType('minion')).toBeUndefined()
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
})

describe('hero rows', () => {
  it('shows archetype · power source, status from play, and Play', () => {
    const hero = exampleHero({ id: 'h' })
    hero.play = { ...emptyPlay(), health: 10 }
    const row = heroType.row(hero)
    expect(row).toMatchObject({ name: 'Maya Reyes', named: true, draft: false, details: 'Speedster · Accident', openHref: '#/hero/h', primary: { label: 'Play', href: '#/hero/h/play' }, editHref: '#/hero/h/edit' })
    expect(row.status).toMatchObject({ zone: 'red', health: 10 })
    expect(row.status!.maxHealth).toBeGreaterThan(10)
    expect(row.issues).toBeUndefined()
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

  it('shows a draft’s step, no status, and Continue to its furthest step', () => {
    const hero = { ...createHero('guided', { id: 'h' }), status: 'draft' as const, furthestStep: 3 }
    expect(heroType.row(hero)).toMatchObject({ name: 'Unnamed hero', named: false, draft: true, details: 'Step 3 of 8 · Archetype', primary: { label: 'Continue', href: '#/hero/h/edit/archetype' } })
    expect(heroType.row(hero).status).toBeUndefined()
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
  it('shows approach archetype · category, Health, and Play', () => {
    const row = villainType.row(adaptiveBruiser())
    expect(row).toMatchObject({ name: 'Ironclad', named: true, draft: false, details: 'Adaptive Bruiser · Minor', openHref: '#/villain/v1', primary: { label: 'Play', href: '#/villain/v1/play' } })
    expect(row.status).toMatchObject({ zone: 'green' })
    expect(row.status!.health).toBe(row.status!.maxHealth)
  })

  it('caps Health at its max and counts issues, linking to the first step with one', () => {
    const v = adaptiveBruiser()
    v.play = { reactionUsed: false, mods: [], twists: [], history: [], health: 999 }
    const row = villainType.row(v)
    expect(row.status!.health).toBe(row.status!.maxHealth)
    const blank = villainType.row(createVillain({ id: 'v2' }))
    expect(blank).toMatchObject({ name: 'Unnamed villain', named: false, details: '', issues: { href: '#/villain/v2/edit/approach' } })
  })

  it('creates and saves a villain, then opens its first step', async () => {
    const s = stores()
    const path = await villainType.create!({ stores: s, newHeroes: new NewHeroes() })
    const [villain] = (await s.villains.list()).villains
    expect(path).toBe(`#/villain/${villain!.id}/edit/approach`)
  })
})

describe('duplicate', () => {
  const now = new Date('2026-11-01T00:00:00Z')

  it('copies a hero with a new id and name, the same tags, and no play state', () => {
    const hero = { ...exampleHero({ id: 'h' }), tags: ['prep'], play: emptyPlay(), currentHealth: 3 }
    const copy = duplicateHero(hero, { id: 'h2', now })
    expect(copy).toMatchObject({ id: 'h2', createdAt: now.toISOString(), updatedAt: now.toISOString(), tags: ['prep'] })
    expect(copy.details.name).toBe('Maya Reyes (copy)')
    expect(copy.play).toBeUndefined()
    expect(copy.currentHealth).toBeUndefined()
    expect(copy.background).toEqual(hero.background)
    // The original is untouched.
    expect(hero.details.name).toBe('Maya Reyes')
  })

  it('uses the alias when there is no name, and leaves an unnamed one unnamed', () => {
    const aliasOnly = createHero('guided', { id: 'a' })
    aliasOnly.details.alias = 'Blur'
    expect(duplicateHero(aliasOnly).details.alias).toBe('Blur (copy)')
    expect(duplicateHero(createHero('guided')).details.name).toBe('')
  })

  it('copies a villain the same way', () => {
    const v = { ...adaptiveBruiser(), tags: ['scene-3'], play: { reactionUsed: false, mods: [], twists: [], history: [] } }
    const copy = duplicateVillain(v, { id: 'v2', now })
    expect(copy).toMatchObject({ id: 'v2', tags: ['scene-3'], details: { name: 'Ironclad (copy)' } })
    expect(copy.play).toBeUndefined()
    const alias = createVillain()
    alias.details.alias = 'Doc'
    expect(duplicateVillain(alias).details.alias).toBe('Doc (copy)')
  })

  it('goes through the registry, with the single-item export', () => {
    expect(heroType.duplicate(exampleHero({ id: 'h' })).id).not.toBe('h')
    expect(villainType.duplicate(adaptiveBruiser()).details.name).toBe('Ironclad (copy)')
    expect(heroType.exportFile(exampleHero({ id: 'h' })).name).toBe('maya-reyes.json')
    expect(JSON.parse(villainType.exportFile(adaptiveBruiser()).text)).toMatchObject({ format: 'scrpg-villain' })
  })
})

describe('items', () => {
  it('gives the query and sort what they look at', () => {
    const item = toItem(villainType as never, { ...adaptiveBruiser(), tags: ['a'] })
    expect(itemFields(item)).toEqual({ type: 'villain', typeLabel: 'Villain', name: 'Ironclad', tags: ['a'], updatedAt: '2026-10-27T12:00:00.000Z' })
  })
})

describe('game rows', () => {
  it('shows the round and scene, no status, and Run to the table', () => {
    const game = { ...createGame({ id: 'g' }), name: 'Thursday game', round: 2, scene: { name: 'The Foundry', tracker: ['green' as const], position: 0 } }
    const row = gameType.row(game)
    expect(row).toMatchObject({ name: 'Thursday game', named: true, draft: false, details: 'Round 2 · The Foundry', openHref: '#/game/g', primary: { label: 'Run', href: '#/game/g' }, editHref: '#/game/g' })
    expect(row.status).toBeUndefined()
    expect(gameType.row(createGame({ id: 'x' }))).toMatchObject({ name: 'Unnamed game', named: false, details: 'Not started' })
  })

  it('creates a game and opens its table', async () => {
    const s = stores()
    const path = await gameType.create!({ stores: s, newHeroes: new NewHeroes() })
    const { docs } = await gameType.list(s)
    expect(docs).toHaveLength(1)
    expect(path).toBe(`#/game/${docs[0]!.id}`)
  })

  it('duplicates with "(copy)" and exports in the saved envelope', () => {
    const game = { ...createGame({ id: 'g' }), name: 'Thursday game', tags: ['campaign'] }
    expect(gameType.duplicate(game)).toMatchObject({ name: 'Thursday game (copy)', tags: ['campaign'] })
    const file = gameType.exportFile(game)
    expect(file.name).toBe('thursday-game.json')
    expect(JSON.parse(file.text)).toMatchObject({ format: 'scrpg-game', version: 1, game: { id: 'g' } })
  })
})
