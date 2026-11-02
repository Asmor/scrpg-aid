/**
 * Test helpers for Play pages. Play state lives in a character's solo game, not on its document
 * (docs/design/game-table/spec.md, sections 1 and 12), so tests that start a hero or villain with
 * some play state, or check what was saved, go through these.
 */
import { createSoloGame, soloGameId, soloHero, soloVillain } from '../game/solo'
import { MemoryGameStore } from '../game/store'
import type { Hero, PlayState } from '../hero/model'
import { MemoryHeroStore } from '../hero/store'
import { emptyPlay } from '../play/state'
import type { Villain, VillainPlayState } from '../villain/model'
import { emptyVillainPlay } from '../villain/play'
import { MemoryVillainStore } from '../villain/store'

/** A hero or villain as a test writes it: its document, plus the play state its solo game starts with. */
export type HeroWithPlay = Hero & { play?: PlayState }
export type VillainWithPlay = Villain & { play?: VillainPlayState }

export interface PlayStores {
  heroes: MemoryHeroStore
  villains: MemoryVillainStore
  games: MemoryGameStore
}

export function playStores(): PlayStores {
  return { heroes: new MemoryHeroStore(), villains: new MemoryVillainStore(), games: new MemoryGameStore() }
}

const clock = () => ({ now: new Date('2026-11-01T00:00:00Z'), newId: () => `seed-${Math.random().toString(36).slice(2)}` })

/** Saves the hero, and its solo game when it comes with play state. */
export async function seedHero(stores: PlayStores, { play, ...hero }: HeroWithPlay): Promise<void> {
  await stores.heroes.save(hero)
  if (!play) return
  const game = createSoloGame('hero', hero, clock())
  await stores.games.save({ ...game, heroes: game.heroes.map((h) => ({ ...h, play: { ...emptyPlay(), ...play } })) })
}

export async function seedVillain(stores: PlayStores, { play, ...villain }: VillainWithPlay): Promise<void> {
  await stores.villains.save(villain)
  if (!play) return
  const game = createSoloGame('villain', villain, clock())
  await stores.games.save({ ...game, villains: game.villains.map((v) => ({ ...v, play: { ...emptyVillainPlay(), ...play } })) })
}

/** The saved hero, with the play state its solo game saved (none until the first change). */
export async function savedHero(stores: PlayStores, id: string): Promise<HeroWithPlay> {
  const r = await stores.heroes.get(id)
  if (r.status !== 'found') throw new Error('not saved')
  const g = await stores.games.get(soloGameId('hero', id))
  const play = g.status === 'found' ? soloHero(g.game)?.play : undefined
  return play ? { ...r.hero, play } : r.hero
}

export async function savedVillain(stores: PlayStores, id: string): Promise<VillainWithPlay> {
  const r = await stores.villains.get(id)
  if (r.status !== 'found') throw new Error('not saved')
  const g = await stores.games.get(soloGameId('villain', id))
  const play = g.status === 'found' ? soloVillain(g.game)?.play : undefined
  return play ? { ...r.villain, play } : r.villain
}
