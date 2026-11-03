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
import { templateCount, TEMPLATE_LIST_INFO, TEMPLATE_LIST_KEYS } from '../template/lists'
import { templateName, type TemplateBase } from '../template/model'
import type { TemplateStores } from '../template/store'

export interface Saved {
  /** The names of everything saved, in the offer's order. */
  names: string[]
  /** The names of items this library already had, which came in as copies. */
  copies: string[]
}

/** Saves the offer's documents. Without a villain store, villains can't be received, nor templates without the templates' stores. */
export async function saveOffer(offer: Offer, heroes: HeroStore, villains: VillainStore | null, templates: TemplateStores | null = null): Promise<Saved> {
  if (offer.villains.length && !villains) throw new Error("villains can't be saved here")
  if (templateCount(offer.templates) && !templates) throw new Error("templates can't be saved here")
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
  for (const key of TEMPLATE_LIST_KEYS) {
    const info = TEMPLATE_LIST_INFO[key]
    const incoming = offer.templates[key] as TemplateBase[]
    if (!incoming.length) continue
    const list = await info.store(templates!).list()
    const ids = new Set([...list.docs.map((d) => d.id), ...list.unreadable.map((u) => u.id)])
    for (const [i, doc] of heroesToSave(incoming, ids, {}).entries()) {
      await info.store(templates!).save(doc)
      const name = templateName(doc, info.kind)
      saved.names.push(name)
      if (doc.id !== incoming[i]!.id) saved.copies.push(name)
    }
  }
  return saved
}
