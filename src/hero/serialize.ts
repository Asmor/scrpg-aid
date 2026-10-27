/**
 * The versioned save format for heroes. Every stored or shared hero is wrapped in a
 * SavedHero envelope, and old versions are migrated forward when read.
 */
import type { Hero } from './model'
import { parseJson, readEnvelope, type Migration } from '../saved'
import { heroProblem } from './validate'

export const HERO_FORMAT = 'scrpg-hero'
export const CURRENT_VERSION = 1

export interface SavedHero {
  format: typeof HERO_FORMAT
  version: number
  hero: Hero
}

/** Upgrades a saved hero's `hero` payload from version N to N + 1. */
export type { Migration }

/**
 * Migrations keyed by the version they upgrade *from*. When the format changes,
 * bump CURRENT_VERSION and add an entry here, e.g. `1: (hero) => ({ ...hero, newField: [] })`.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {}

export type ParseResult = { ok: true; hero: Hero; migratedFrom?: number } | { ok: false; error: string }

export function toSaved(hero: Hero): SavedHero {
  return { format: HERO_FORMAT, version: CURRENT_VERSION, hero }
}

/**
 * Reads a saved hero, migrating it to the current version.
 * `migrations` and `currentVersion` are injectable so the migration path can be tested.
 */
export function parseSaved(
  value: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  currentVersion: number = CURRENT_VERSION,
): ParseResult {
  const result = readEnvelope<Hero>(value, { format: HERO_FORMAT, key: 'hero', currentVersion, migrations, problem: heroProblem })
  if (!result.ok) return result
  return result.migratedFrom === undefined ? { ok: true, hero: result.doc } : { ok: true, hero: result.doc, migratedFrom: result.migratedFrom }
}

/** Reads a saved hero from JSON text (e.g. an imported file). */
export function parseSavedJson(text: string): ParseResult {
  const json = parseJson(text)
  return json.ok ? parseSaved(json.value) : json
}
