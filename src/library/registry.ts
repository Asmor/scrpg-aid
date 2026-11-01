/**
 * The library's types (docs/design/library/spec.md, "Library types"): what the table needs from
 * each kind of document, so a new type plugs in by adding an entry here. The type chips, the New
 * menu, and the Details and Status columns all read from it.
 *
 * Minions and lieutenants are left out for now: they have their own documents and store
 * (../minion/), but no page of their own to open them on yet, so there's nothing for a row to
 * link to. Add an entry once they do.
 */
import { editPath, gamePath, playPath, heroPath, villainEditPath, villainPath, villainPlayPath } from '../app/route'
import type { NewHeroes } from '../app/new-heroes'
import { buildSheet } from '../creation/sheet'
import { createHero, duplicateHero, heroDisplayName, isDraft, type Hero } from '../hero/model'
import type { HeroStore } from '../hero/store'
import { continueStep, NUMBERED_STEPS, WIZARD_STEPS, wizardStepIndex } from '../hero/wizard-steps'
import { currentHealth, effectiveZone, type PlayZone } from '../play/state'
import { gameFileName, gameJson, heroFileName, heroJson, villainFileName, villainJson } from '../transfer/files'
import { createGame, duplicateGame, gameDisplayName, sceneDisplayName, type Game } from '../game/model'
import type { GameStore } from '../game/store'
import { createVillain, duplicateVillain, villainDisplayName, type Villain } from '../villain/model'
import { villainHealth, villainZone } from '../villain/play'
import { buildVillainSheet } from '../villain/sheet'
import type { VillainStore } from '../villain/store'

/** Every document in the library has these. */
export interface LibraryDoc {
  id: string
  updatedAt: string
  tags: string[]
}

/** The stores the library reads and writes. */
export interface LibraryStores {
  heroes: HeroStore
  villains: VillainStore
  games: GameStore
}

/** What a row shows for one item, worked out from its document. */
export interface RowInfo {
  /** The name to show, search, and sort by ("Unnamed hero" until named). */
  name: string
  /** False until the item has a name (the placeholder shows in muted italics). */
  named: boolean
  draft: boolean
  /** The Details column: "Speedster · Accident", or a draft's step. */
  details: string
  /** Rule issues, linking to where they can be fixed. */
  issues?: { count: number; href: string }
  /** The Status column; absent shows "—". */
  status?: { zone?: PlayZone; health?: number; maxHealth?: number }
  openHref: string
  primary: { label: 'Play' | 'Continue' | 'Run'; href: string }
  editHref: string
}

/** One kind of library document and everything the library does with it. */
export interface LibraryType<D extends LibraryDoc = LibraryDoc> {
  key: string
  label: string
  plural: string
  /** Where its documents are kept. */
  list(stores: LibraryStores): Promise<{ docs: D[]; unreadable: { id: string; error: string }[] }>
  save(stores: LibraryStores, doc: D): Promise<void>
  remove(stores: LibraryStores, id: string): Promise<void>
  row(doc: D): RowInfo
  /** A copy with a new id, "(copy)" after the name, the same tags, and no play state. */
  duplicate(doc: D): D
  /** The single-item export: JSON in the same envelope as storage. */
  exportFile(doc: D): { name: string; text: string }
  /** Which list of a backup file it goes in. */
  backupKey: 'heroes' | 'villains' | 'games'
  /** Starts a new one from the New menu, returning the page to open (unset if the type can't be created). */
  create?(context: { stores: LibraryStores; newHeroes: NewHeroes }): Promise<string>
}

/** "Step 3 of 8 · Archetype", or "At Start". */
export function draftStepText(furthest: number | undefined): string {
  const id = continueStep(furthest)
  const index = wizardStepIndex(id)
  return index === 0 ? 'At Start' : `Step ${index} of ${NUMBERED_STEPS} · ${WIZARD_STEPS[index]!.label}`
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`
export const issuesText = (count: number) => plural(count, 'rule issue')

export const heroType: LibraryType<Hero> = {
  key: 'hero',
  label: 'Hero',
  plural: 'Heroes',
  backupKey: 'heroes',
  list: async (stores) => {
    const { heroes, unreadable } = await stores.heroes.list()
    return { docs: heroes, unreadable }
  },
  save: (stores, hero) => stores.heroes.save(hero),
  remove: (stores, id) => stores.heroes.remove(id),
  row(hero) {
    const name = heroDisplayName(hero)
    const named = Boolean(hero.details.name.trim() || hero.details.alias.trim())
    if (isDraft(hero)) {
      const href = editPath(hero.id, continueStep(hero.furthestStep))
      return { name, named, draft: true, details: draftStepText(hero.furthestStep), openHref: heroPath(hero.id), primary: { label: 'Continue', href }, editHref: href }
    }
    const sheet = buildSheet(hero)
    const { archetype, powerSource } = sheet.characteristics
    const health = currentHealth(sheet, hero.play)
    const zone = effectiveZone(sheet, hero.play)
    return {
      name,
      named,
      draft: false,
      details: [archetype, powerSource].filter(Boolean).join(' · '),
      ...(sheet.warnings.length ? { issues: { count: sheet.warnings.length, href: editPath(hero.id) } } : {}),
      ...(zone || health !== undefined ? { status: { zone, health, maxHealth: sheet.maxHealth } } : {}),
      openHref: heroPath(hero.id),
      primary: { label: 'Play', href: playPath(hero.id) },
      editHref: editPath(hero.id),
    }
  },
  duplicate: (hero) => duplicateHero(hero),
  exportFile: (hero) => ({ name: heroFileName(hero, 'json'), text: heroJson(hero) }),
  async create({ newHeroes }) {
    // A draft held in memory: the wizard saves it on the first choice (the hero wizard spec, "Drafts").
    const hero: Hero = { ...createHero('guided'), status: 'draft' }
    newHeroes.add(hero)
    return editPath(hero.id, 'start')
  },
}

export const villainType: LibraryType<Villain> = {
  key: 'villain',
  label: 'Villain',
  plural: 'Villains',
  backupKey: 'villains',
  list: async (stores) => {
    const { villains, unreadable } = await stores.villains.list()
    return { docs: villains, unreadable }
  },
  save: (stores, villain) => stores.villains.save(villain),
  remove: (stores, id) => stores.villains.remove(id),
  row(villain) {
    const sheet = buildVillainSheet(villain)
    const kind = [sheet.approach, sheet.archetype].filter(Boolean).join(' ')
    const health = villainHealth(villain, villain.play)
    const zone = villainZone(health, villain.play ?? {})
    const now = villain.play?.health ?? health.maxHealth
    const first = sheet.warnings[0]
    return {
      name: villainDisplayName(villain),
      named: Boolean(villain.details.name.trim() || villain.details.alias.trim()),
      draft: false,
      details: kind ? `${kind} · ${sheet.major ? 'Major' : 'Minor'}` : '',
      ...(first ? { issues: { count: sheet.warnings.length, href: villainEditPath(villain.id, first.step) } } : {}),
      ...(zone || now !== undefined ? { status: { zone, health: now === undefined || health.maxHealth === undefined ? now : Math.min(now, health.maxHealth), maxHealth: health.maxHealth } } : {}),
      openHref: villainPath(villain.id),
      primary: { label: 'Play', href: villainPlayPath(villain.id) },
      editHref: villainEditPath(villain.id),
    }
  },
  duplicate: (villain) => duplicateVillain(villain),
  exportFile: (villain) => ({ name: villainFileName(villain, 'json'), text: villainJson(villain) }),
  async create({ stores }) {
    const villain = createVillain()
    await stores.villains.save(villain)
    return villainEditPath(villain.id, 'approach')
  },
}

/** "Round 2 · The Foundry", or "Not started · The Foundry" before the first round. */
export function gameDetails(game: Game): string {
  return [game.round > 0 ? `Round ${game.round}` : 'Not started', game.scene.name.trim() ? sceneDisplayName(game) : ''].filter(Boolean).join(' · ')
}

export const gameType: LibraryType<Game> = {
  key: 'game',
  label: 'Game',
  plural: 'Games',
  backupKey: 'games',
  list: async (stores) => {
    const { games, unreadable } = await stores.games.list()
    return { docs: games, unreadable }
  },
  save: (stores, game) => stores.games.save(game),
  remove: (stores, id) => stores.games.remove(id),
  row(game) {
    const href = gamePath(game.id)
    // No Status column: a game has no Health.
    return { name: gameDisplayName(game), named: Boolean(game.name.trim()), draft: false, details: gameDetails(game), openHref: href, primary: { label: 'Run', href }, editHref: href }
  },
  duplicate: (game) => duplicateGame(game),
  exportFile: (game) => ({ name: gameFileName(game, 'json'), text: gameJson(game) }),
  async create({ stores }) {
    const game = createGame()
    await stores.games.save(game)
    return gamePath(game.id)
  },
}

/** Every library type, in the order the type chips and New menu list them. */
export const LIBRARY_TYPES: readonly LibraryType[] = [heroType as unknown as LibraryType, villainType as unknown as LibraryType, gameType as unknown as LibraryType]

export function libraryType(key: string): LibraryType | undefined {
  return LIBRARY_TYPES.find((t) => t.key === key)
}

/** One library item: its document, its type, and what its row shows. */
export interface LibraryItem {
  type: LibraryType
  doc: LibraryDoc
  row: RowInfo
}

/** The fields the query and sort functions (./query.ts) look at. */
export function itemFields(item: LibraryItem) {
  return { type: item.type.key, typeLabel: item.type.label, name: item.row.name, tags: item.doc.tags, updatedAt: item.doc.updatedAt }
}

/** Builds an item from a document of a type. */
export function toItem(type: LibraryType, doc: LibraryDoc): LibraryItem {
  return { type, doc, row: type.row(doc) }
}
