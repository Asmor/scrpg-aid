/** The versioned save format for villains, like ../hero/serialize.ts. */
import { readEnvelope } from '../saved'
import type { Villain } from './model'
import { villainProblem } from './validate'
import { cleanTags } from '../library/tags'

export const VILLAIN_FORMAT = 'scrpg-villain'
export const VILLAIN_VERSION = 4

export interface SavedVillain {
  format: typeof VILLAIN_FORMAT
  version: number
  villain: Villain
}

export type VillainParseResult = { ok: true; villain: Villain } | { ok: false; error: string }

export function villainToSaved(villain: Villain): SavedVillain {
  return { format: VILLAIN_FORMAT, version: VILLAIN_VERSION, villain }
}

/** Reads a saved villain. */
export function parseSavedVillain(value: unknown): VillainParseResult {
  const result = readEnvelope<Villain>(value, { format: VILLAIN_FORMAT, key: 'villain', currentVersion: VILLAIN_VERSION, problem: villainProblem })
  if (!result.ok) return result
  return { ok: true, villain: { ...result.doc, tags: cleanTags(result.doc.tags) } }
}
