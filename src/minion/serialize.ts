/** The versioned save format for minions, like ../hero/serialize.ts. */
import { parseJson, readEnvelope, type Migration } from '../saved'
import type { Minion } from './model'
import { minionProblem } from './validate'

export const MINION_FORMAT = 'scrpg-minion'
export const MINION_VERSION = 1

export interface SavedMinion {
  format: typeof MINION_FORMAT
  version: number
  minion: Minion
}

/** Migrations keyed by the version they upgrade from (none yet). */
export const MINION_MIGRATIONS: Readonly<Record<number, Migration>> = {}

export type MinionParseResult = { ok: true; minion: Minion; migratedFrom?: number } | { ok: false; error: string }

export function minionToSaved(minion: Minion): SavedMinion {
  return { format: MINION_FORMAT, version: MINION_VERSION, minion }
}

/** Reads a saved minion, migrating it to the current version (injectable for tests). */
export function parseSavedMinion(value: unknown, migrations = MINION_MIGRATIONS, currentVersion = MINION_VERSION): MinionParseResult {
  const result = readEnvelope<Minion>(value, { format: MINION_FORMAT, key: 'minion', currentVersion, migrations, problem: minionProblem })
  if (!result.ok) return result
  return result.migratedFrom === undefined ? { ok: true, minion: result.doc } : { ok: true, minion: result.doc, migratedFrom: result.migratedFrom }
}

/** Reads a saved minion from JSON text. */
export function parseSavedMinionJson(text: string): MinionParseResult {
  const json = parseJson(text)
  return json.ok ? parseSavedMinion(json.value) : json
}
