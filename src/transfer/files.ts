/**
 * Exporting heroes to files and reading them back in (Phase 2). A single hero is saved in
 * the same versioned SavedHero envelope as the browser store (../hero/serialize.ts), and a
 * backup wraps several of them in a versioned envelope of its own. Imports go through the
 * same checks and migrations as loading a saved hero.
 */
import { newId, type Hero } from '../hero/model'
import { parseSaved, toSaved, type SavedHero } from '../hero/serialize'
import { extractEmbedded } from './embed'

export const BACKUP_FORMAT = 'scrpg-backup'
export const BACKUP_VERSION = 1

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  heroes: SavedHero[]
}

/** One hero as JSON, the same envelope the app stores. */
export function heroJson(hero: Hero): string {
  return JSON.stringify(toSaved(hero), null, 2)
}

/** Every hero in one JSON file. `now` is injectable for tests. */
export function backupJson(heroes: readonly Hero[], now: Date = new Date()): string {
  const backup: Backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), heroes: heroes.map(toSaved) }
  return JSON.stringify(backup, null, 2)
}

/** A file name from the hero's name: "Maya Reyes" → "maya-reyes.json". */
export function heroFileName(hero: Hero, extension: string): string {
  const name = (hero.details.name.trim() || hero.details.alias.trim())
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${name || 'hero'}.${extension}`
}

/** "scrpg-heroes-2026-10-26.json", in local time. */
export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `scrpg-heroes-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/** A hero in an imported file that couldn't be read; `index` counts from 1 within a backup. */
export interface SkippedHero {
  index: number
  error: string
}

export type ImportResult = { ok: true; heroes: Hero[]; skipped: SkippedHero[] } | { ok: false; error: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const NOT_OURS = "This file isn't a hero or a backup the app can read."

const parseJson = (text: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

/**
 * Reads an imported file: one hero or a backup of several as JSON, or a Markdown or HTML
 * export carrying its hero's JSON (./embed.ts).
 */
export function readImport(text: string): ImportResult {
  let parsed = parseJson(text)
  if (!parsed.ok) {
    const embedded = extractEmbedded(text)
    if (embedded === undefined) return { ok: false, error: NOT_OURS }
    parsed = parseJson(embedded)
    if (!parsed.ok) return { ok: false, error: "This file's hero data is damaged, so it can't be imported." }
  }
  const { value } = parsed
  if (isRecord(value) && value.format === BACKUP_FORMAT) return readBackup(value)
  const result = parseSaved(value)
  if (result.ok) return { ok: true, heroes: [result.hero], skipped: [] }
  return { ok: false, error: result.error === 'not a saved hero' ? NOT_OURS : `This hero couldn't be read: ${result.error}.` }
}

function readBackup(value: Record<string, unknown>): ImportResult {
  const { version } = value
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, error: "This backup couldn't be read: missing or invalid version." }
  if (version > BACKUP_VERSION) return { ok: false, error: `This backup was made by a newer version of the app (format ${version}).` }
  if (!Array.isArray(value.heroes)) return { ok: false, error: "This backup couldn't be read: it has no list of heroes." }
  const heroes: Hero[] = []
  const skipped: SkippedHero[] = []
  value.heroes.forEach((saved, i) => {
    const result = parseSaved(saved)
    if (result.ok) heroes.push(result.hero)
    else skipped.push({ index: i + 1, error: result.error })
  })
  return { ok: true, heroes, skipped }
}

/** How to import a hero whose id is already saved. */
export type Resolution = 'replace' | 'copy'

/** The imported heroes whose ids are already saved, so the player can choose for each. */
export function conflicts(incoming: readonly Hero[], savedIds: ReadonlySet<string>): Hero[] {
  return firstOfEach(incoming).filter((h) => savedIds.has(h.id))
}

/** A hero with the same id earlier in the same file is imported as a copy. */
function firstOfEach(heroes: readonly Hero[]): Hero[] {
  const seen = new Set<string>()
  return heroes.filter((h) => !seen.has(h.id) && seen.add(h.id))
}

/**
 * The heroes to save for an import. A conflict the player chose to keep both for, and any
 * repeat of an id within the file, gets a new id; the rest keep theirs. `makeId` is
 * injectable for tests.
 */
export function heroesToSave(
  incoming: readonly Hero[],
  savedIds: ReadonlySet<string>,
  choices: Readonly<Record<string, Resolution>>,
  makeId: () => string = newId,
): Hero[] {
  const used = new Set<string>()
  return incoming.map((hero) => {
    const repeat = used.has(hero.id)
    used.add(hero.id)
    const copy = repeat || (savedIds.has(hero.id) && choices[hero.id] !== 'replace')
    return copy ? { ...hero, id: makeId() } : hero
  })
}
