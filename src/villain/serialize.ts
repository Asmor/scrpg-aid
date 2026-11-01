/** The versioned save format for villains, like ../hero/serialize.ts. */
import { parseJson, readEnvelope, type Migration } from '../saved'
import type { Villain } from './model'
import { villainProblem } from './validate'
import { cleanTags } from '../library/tags'

export const VILLAIN_FORMAT = 'scrpg-villain'
/** Version 2 added `tags`. */
export const VILLAIN_VERSION = 2

export interface SavedVillain {
  format: typeof VILLAIN_FORMAT
  version: number
  villain: Villain
}

/** Migrations keyed by the version they upgrade from. */
export const VILLAIN_MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (villain) => ({ ...villain, tags: [] }),
}

export type VillainParseResult = { ok: true; villain: Villain; migratedFrom?: number } | { ok: false; error: string }

export function villainToSaved(villain: Villain): SavedVillain {
  return { format: VILLAIN_FORMAT, version: VILLAIN_VERSION, villain }
}

/** Reads a saved villain, migrating it to the current version (injectable for tests). */
export function parseSavedVillain(value: unknown, migrations = VILLAIN_MIGRATIONS, currentVersion = VILLAIN_VERSION): VillainParseResult {
  const result = readEnvelope<Villain>(value, { format: VILLAIN_FORMAT, key: 'villain', currentVersion, migrations, problem: villainProblem })
  if (!result.ok) return result
  const villain = { ...result.doc, tags: cleanTags(result.doc.tags) }
  return result.migratedFrom === undefined ? { ok: true, villain } : { ok: true, villain, migratedFrom: result.migratedFrom }
}

/** Reads a saved villain from JSON text. */
export function parseSavedVillainJson(text: string): VillainParseResult {
  const json = parseJson(text)
  return json.ok ? parseSavedVillain(json.value) : json
}
