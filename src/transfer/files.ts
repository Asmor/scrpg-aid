/**
 * Exporting heroes, villains and games to files and reading them back in (Phases 2 and 5, and
 * the game table). A single hero, villain or game is saved in the same versioned envelope as
 * the browser store (../hero/serialize.ts, ../villain/serialize.ts, ../game/serialize.ts), and a backup wraps several in a versioned
 * envelope of its own. Imports go through the same checks and migrations as loading a saved
 * document.
 */
import { newId, type Hero } from '../hero/model'
import { parseSaved, toSaved, type SavedHero } from '../hero/serialize'
import type { Villain } from '../villain/model'
import { parseSavedVillain, villainToSaved, VILLAIN_FORMAT, type SavedVillain } from '../villain/serialize'
import { extractEmbedded } from './embed'
import { parseSavedSearch, searchToSaved, type SavedSearch, type SavedSearchEnvelope } from '../library/saved-searches'
import type { Game } from '../game/model'
import { GAME_FORMAT, gameToSaved, parseSavedGame, type SavedGame } from '../game/serialize'
import { templateFormat } from '../template/serialize'
import { emptyTemplateLists, TEMPLATE_LIST_INFO, TEMPLATE_LIST_KEYS, type TemplateLists } from '../template/lists'

export const BACKUP_FORMAT = 'scrpg-backup'
/**
 * Version 2 added villains, version 3 the library's saved searches, version 4 games, and version
 * 5 the NPC templates (../template/lists.ts), and version 6 environment templates; older backups
 * still read. A multi-item export from
 * the library uses the same format, with no saved searches.
 */
export const BACKUP_VERSION = 6

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  heroes: SavedHero[]
  villains: SavedVillain[]
  games: SavedGame[]
  savedSearches: SavedSearchEnvelope[]
  minionTemplates: unknown[]
  lieutenantTemplates: unknown[]
  challengeTemplates: unknown[]
  environmentTemplates: unknown[]
}

/** One hero as JSON, the same envelope the app stores. */
export function heroJson(hero: Hero): string {
  return JSON.stringify(toSaved(hero), null, 2)
}

/** One villain as JSON, the same envelope the app stores. */
export function villainJson(villain: Villain): string {
  return JSON.stringify(villainToSaved(villain), null, 2)
}

/** One game as JSON, the same envelope the app stores. */
export function gameJson(game: Game): string {
  return JSON.stringify(gameToSaved(game), null, 2)
}

/** Heroes, villains, games and saved searches in one JSON file: a backup, or a library export. `now` is injectable for tests. */
export function backupJson(
  { heroes = [], villains = [], games = [], savedSearches = [], templates = {} }: { heroes?: readonly Hero[]; villains?: readonly Villain[]; games?: readonly Game[]; savedSearches?: readonly SavedSearch[]; templates?: Partial<TemplateLists> },
  now: Date = new Date(),
): string {
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    heroes: heroes.map(toSaved),
    villains: villains.map(villainToSaved),
    games: games.map(gameToSaved),
    savedSearches: savedSearches.map(searchToSaved),
    minionTemplates: [],
    lieutenantTemplates: [],
    challengeTemplates: [],
    environmentTemplates: [],
  }
  for (const key of TEMPLATE_LIST_KEYS) backup[key] = (templates[key] ?? []).map((doc) => TEMPLATE_LIST_INFO[key].envelope.toSaved(doc))
  return JSON.stringify(backup, null, 2)
}

/** A file name from the hero's name: "Maya Reyes" → "maya-reyes.json". */
export function heroFileName(hero: Hero, extension: string): string {
  return fileName(hero.details.name.trim() || hero.details.alias.trim(), 'hero', extension)
}

/** A file name from the game's name, like heroFileName. */
export function gameFileName(game: Game, extension: string): string {
  return fileName(game.name.trim(), 'game', extension)
}

/** A file name from the villain's name, like heroFileName. */
export function villainFileName(villain: Villain, extension: string): string {
  return fileName(villain.details.name.trim() || villain.details.alias.trim(), 'villain', extension)
}

function fileName(raw: string, fallback: string, extension: string): string {
  const name = raw
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${name || fallback}.${extension}`
}

/** "scrpg-aid-backup-2026-10-26.json", in local time. */
export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `scrpg-aid-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/** A hero, villain, game or saved search in an imported backup that couldn't be read; `index` counts from 1 within its list. */
export interface SkippedHero {
  kind: 'hero' | 'villain' | 'game' | 'savedSearch' | 'minion' | 'lieutenant' | 'challenge' | 'environment'
  index: number
  error: string
}

export type ImportResult = { ok: true; heroes: Hero[]; villains: Villain[]; games: Game[]; savedSearches: SavedSearch[]; templates: TemplateLists; skipped: SkippedHero[] } | { ok: false; error: string }

/** An import result with nothing in it but what's given. */
const only = (given: Partial<Omit<Extract<ImportResult, { ok: true }>, 'ok'>>): ImportResult => ({ ok: true, heroes: [], villains: [], games: [], savedSearches: [], templates: emptyTemplateLists(), skipped: [], ...given })

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const NOT_OURS = "This file isn't a hero, villain, template, game, or backup the app can read."

const parseJson = (text: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

/**
 * Reads an imported file: one hero or villain, or a backup of several, as JSON; or a
 * Markdown or HTML export carrying its hero's or villain's JSON (./embed.ts).
 */
export function readImport(text: string): ImportResult {
  let parsed = parseJson(text)
  if (!parsed.ok) {
    const embedded = extractEmbedded(text)
    if (embedded === undefined) return { ok: false, error: NOT_OURS }
    parsed = parseJson(embedded)
    if (!parsed.ok) return { ok: false, error: "This file's data is damaged, so it can't be imported." }
  }
  const { value } = parsed
  if (isRecord(value) && value.format === BACKUP_FORMAT) return readBackup(value)
  if (isRecord(value) && value.format === VILLAIN_FORMAT) {
    const villain = parseSavedVillain(value)
    return villain.ok ? only({ villains: [villain.villain] }) : { ok: false, error: `This villain couldn't be read: ${villain.error}.` }
  }
  if (isRecord(value) && value.format === GAME_FORMAT) {
    const game = parseSavedGame(value)
    return game.ok ? only({ games: [game.game] }) : { ok: false, error: `This game couldn't be read: ${game.error}.` }
  }
  // One template: its envelope's format names its kind.
  for (const key of TEMPLATE_LIST_KEYS) {
    const info = TEMPLATE_LIST_INFO[key]
    if (!isRecord(value) || value.format !== templateFormat(info.kind)) continue
    const doc = info.envelope.parse(value)
    if (!doc.ok) return { ok: false, error: `This ${info.one} couldn't be read: ${doc.error}.` }
    const templates = emptyTemplateLists()
    ;(templates[key] as unknown[]).push(doc.doc)
    return only({ templates })
  }
  const result = parseSaved(value)
  if (result.ok) return only({ heroes: [result.hero] })
  return { ok: false, error: result.error === 'not a saved hero' ? NOT_OURS : `This hero couldn't be read: ${result.error}.` }
}

function readBackup(value: Record<string, unknown>): ImportResult {
  const { version } = value
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, error: "This backup couldn't be read: missing or invalid version." }
  if (version > BACKUP_VERSION) return { ok: false, error: `This backup was made by a newer version of the app (format ${version}).` }
  if (!Array.isArray(value.heroes)) return { ok: false, error: "This backup couldn't be read: it has no list of heroes." }
  // Version 1 had no villains.
  if (version >= 2 && !Array.isArray(value.villains)) return { ok: false, error: "This backup couldn't be read: it has no list of villains." }
  // Version 3 added saved searches.
  if (version >= 3 && !Array.isArray(value.savedSearches)) return { ok: false, error: "This backup couldn't be read: it has no list of saved searches." }
  // Version 4 added games.
  if (version >= 4 && !Array.isArray(value.games)) return { ok: false, error: "This backup couldn't be read: it has no list of games." }
  const heroes: Hero[] = []
  const villains: Villain[] = []
  const games: Game[] = []
  const savedSearches: SavedSearch[] = []
  const skipped: SkippedHero[] = []
  value.heroes.forEach((saved, i) => {
    const result = parseSaved(saved)
    if (result.ok) heroes.push(result.hero)
    else skipped.push({ kind: 'hero', index: i + 1, error: result.error })
  })
  ;((version >= 2 ? value.villains : []) as unknown[]).forEach((saved, i) => {
    const result = parseSavedVillain(saved)
    if (result.ok) villains.push(result.villain)
    else skipped.push({ kind: 'villain', index: i + 1, error: result.error })
  })
  ;((version >= 4 ? value.games : []) as unknown[]).forEach((saved, i) => {
    const result = parseSavedGame(saved)
    if (result.ok) games.push(result.game)
    else skipped.push({ kind: 'game', index: i + 1, error: result.error })
  })
  ;((version >= 3 ? value.savedSearches : []) as unknown[]).forEach((saved, i) => {
    const result = parseSavedSearch(saved)
    if (result.ok) savedSearches.push(result.search)
    else skipped.push({ kind: 'savedSearch', index: i + 1, error: result.error })
  })
  // Version 5 added the NPC templates, and version 6 environments.
  const templates = emptyTemplateLists()
  for (const key of TEMPLATE_LIST_KEYS) {
    if (version < TEMPLATE_LIST_INFO[key].since) continue
    const list = value[key]
    if (!Array.isArray(list)) return { ok: false, error: `This backup couldn't be read: it has no list of ${TEMPLATE_LIST_INFO[key].many}.` }
    list.forEach((saved, i) => {
      const result = TEMPLATE_LIST_INFO[key].envelope.parse(saved)
      if (result.ok) (templates[key] as unknown[]).push(result.doc)
      else skipped.push({ kind: TEMPLATE_LIST_INFO[key].kind, index: i + 1, error: result.error })
    })
  }
  return { ok: true, heroes, villains, games, savedSearches, templates, skipped }
}

/** How to import a hero or villain whose id is already saved. */
export type Resolution = 'replace' | 'copy'

/** The imported heroes (or villains) whose ids are already saved, so the player can choose for each. */
export function conflicts<T extends { id: string }>(incoming: readonly T[], savedIds: ReadonlySet<string>): T[] {
  return firstOfEach(incoming).filter((h) => savedIds.has(h.id))
}

/** One with the same id earlier in the same file is imported as a copy. */
function firstOfEach<T extends { id: string }>(docs: readonly T[]): T[] {
  const seen = new Set<string>()
  return docs.filter((h) => !seen.has(h.id) && seen.add(h.id))
}

/**
 * The heroes (or villains) to save for an import. A conflict the player chose to keep both
 * for, and any repeat of an id within the file, gets a new id; the rest keep theirs.
 * `makeId` is injectable for tests.
 */
export function heroesToSave<T extends { id: string }>(
  incoming: readonly T[],
  savedIds: ReadonlySet<string>,
  choices: Readonly<Record<string, Resolution>>,
  makeId: () => string = newId,
): T[] {
  const used = new Set<string>()
  return incoming.map((hero) => {
    const repeat = used.has(hero.id)
    used.add(hero.id)
    const copy = repeat || (savedIds.has(hero.id) && choices[hero.id] !== 'replace')
    return copy ? { ...hero, id: makeId() } : hero
  })
}
