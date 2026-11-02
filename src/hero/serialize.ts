/**
 * The versioned save format for heroes. Every stored or shared hero is wrapped in a
 * SavedHero envelope, and old versions are migrated forward when read.
 */
import type { Hero } from './model'
import { parseJson, readEnvelope, type Migration } from '../saved'
import { heroProblem } from './validate'
import { cleanTags } from '../library/tags'

export const HERO_FORMAT = 'scrpg-hero'
/**
 * Version 2 added `tags`. Version 3 took play state off the hero (`play`, `currentHealth`):
 * games hold it now (docs/design/game-table/spec.md, section 1), and old play state is dropped.
 */
export const CURRENT_VERSION = 3

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
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (hero) => ({ ...hero, tags: [] }),
  2: (hero) => withoutPlay(hero),
}

/** A hero document without play state, which belongs to games now. */
export function withoutPlay<T extends Record<string, unknown>>(hero: T): Omit<T, 'play' | 'currentHealth'> {
  const { play: _play, currentHealth: _health, ...rest } = hero
  return rest
}

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
  // Tags may come from anywhere (an import, an older app): keep them tidy. Play state an older
  // app wrote back is dropped too.
  const hero = { ...(withoutPlay(result.doc as unknown as Record<string, unknown>) as unknown as Hero), tags: cleanTags(result.doc.tags) }
  return result.migratedFrom === undefined ? { ok: true, hero } : { ok: true, hero, migratedFrom: result.migratedFrom }
}

/** Reads a saved hero from JSON text (e.g. an imported file). */
export function parseSavedJson(text: string): ParseResult {
  const json = parseJson(text)
  return json.ok ? parseSaved(json.value) : json
}
