/**
 * Accepting received items (docs/design/game-table/spec.md, section 15): they go into the
 * library through the import path (../transfer/files.ts), tags included. An item whose id is
 * already saved here comes in as a copy with a new id, so nothing is replaced.
 */
import type { HeroStore } from '../hero/store'
import { heroType, villainType } from '../library/registry'
import { heroesToSave } from '../transfer/files'
import type { VillainStore } from '../villain/store'
import type { Offer } from './send'

export interface Saved {
  /** The names of everything saved, in the offer's order. */
  names: string[]
  /** The names of items this library already had, which came in as copies. */
  copies: string[]
}

/** Saves the offer's sheets. Without a villain store, villains can't be received. */
export async function saveOffer(offer: Offer, heroes: HeroStore, villains: VillainStore | null): Promise<Saved> {
  if (offer.villains.length && !villains) throw new Error("villains can't be saved here")
  const heroList = await heroes.list()
  const heroIds = new Set([...heroList.heroes.map((h) => h.id), ...heroList.unreadable.map((u) => u.id)])
  const villainList = offer.villains.length && villains ? await villains.list() : { villains: [], unreadable: [] }
  const villainIds = new Set([...villainList.villains.map((v) => v.id), ...villainList.unreadable.map((u) => u.id)])
  const saved: Saved = { names: [], copies: [] }
  const toHeroes = heroesToSave(offer.heroes, heroIds, {})
  for (const [i, hero] of toHeroes.entries()) {
    await heroes.save(hero)
    const name = heroType.row(hero).name
    saved.names.push(name)
    if (hero.id !== offer.heroes[i]!.id) saved.copies.push(name)
  }
  const toVillains = heroesToSave(offer.villains, villainIds, {})
  for (const [i, villain] of toVillains.entries()) {
    await villains!.save(villain)
    const name = villainType.row(villain).name
    saved.names.push(name)
    if (villain.id !== offer.villains[i]!.id) saved.copies.push(name)
  }
  return saved
}
