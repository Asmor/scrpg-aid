/**
 * The versioned save format for heroes. Every stored or shared hero is wrapped in a
 * SavedHero envelope, and old versions are migrated forward when read.
 */
import type { Hero } from './model'
import { heroProblem } from './validate'

export const HERO_FORMAT = 'scrpg-hero'
export const CURRENT_VERSION = 1

export interface SavedHero {
  format: typeof HERO_FORMAT
  version: number
  hero: Hero
}

/** Upgrades a saved hero's `hero` payload from version N to N + 1. */
export type Migration = (hero: Record<string, unknown>) => Record<string, unknown>

/**
 * Migrations keyed by the version they upgrade *from*. When the format changes,
 * bump CURRENT_VERSION and add an entry here, e.g. `1: (hero) => ({ ...hero, newField: [] })`.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {}

export type ParseResult = { ok: true; hero: Hero; migratedFrom?: number } | { ok: false; error: string }

export function toSaved(hero: Hero): SavedHero {
  return { format: HERO_FORMAT, version: CURRENT_VERSION, hero }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
  if (!isRecord(value) || value.format !== HERO_FORMAT) return { ok: false, error: 'not a saved hero' }
  const { version } = value
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'missing or invalid version' }
  }
  if (version > currentVersion) {
    return { ok: false, error: `saved by a newer version of the app (format ${version})` }
  }
  if (!isRecord(value.hero)) return { ok: false, error: 'missing hero' }

  // Work on a copy so neither migrations nor callers can change the stored record.
  let hero: Record<string, unknown> = structuredClone(value.hero)
  for (let v = version; v < currentVersion; v++) {
    const migrate = migrations[v]
    if (!migrate) return { ok: false, error: `no migration from format ${v}` }
    try {
      hero = migrate(hero)
    } catch (error) {
      return { ok: false, error: `migration from format ${v} failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
  const problem = heroProblem(hero)
  if (problem) return { ok: false, error: problem }
  return version < currentVersion
    ? { ok: true, hero: hero as unknown as Hero, migratedFrom: version }
    : { ok: true, hero: hero as unknown as Hero }
}

/** Reads a saved hero from JSON text (e.g. an imported file). */
export function parseSavedJson(text: string): ParseResult {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, error: 'not valid JSON' }
  }
  return parseSaved(value)
}
