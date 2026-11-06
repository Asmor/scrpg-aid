/**
 * The versioned save format for heroes. Every stored or shared hero is wrapped in a
 * SavedHero envelope.
 */
import type { Hero } from './model'
import { parseJson, readEnvelope } from '../saved'
import { heroProblem } from './validate'
import { cleanTags } from '../library/tags'

export const HERO_FORMAT = 'scrpg-hero'
export const CURRENT_VERSION = 4

export interface SavedHero {
  format: typeof HERO_FORMAT
  version: number
  hero: Hero
}

export type ParseResult = { ok: true; hero: Hero } | { ok: false; error: string }

export function toSaved(hero: Hero): SavedHero {
  return { format: HERO_FORMAT, version: CURRENT_VERSION, hero }
}

/** Reads a saved hero. Tags may come from anywhere (an import, say): they're tidied. */
export function parseSaved(value: unknown): ParseResult {
  const result = readEnvelope<Hero>(value, { format: HERO_FORMAT, key: 'hero', currentVersion: CURRENT_VERSION, problem: heroProblem })
  if (!result.ok) return result
  return { ok: true, hero: { ...result.doc, tags: cleanTags(result.doc.tags) } }
}

/** Reads a saved hero from JSON text (e.g. an imported file). */
export function parseSavedJson(text: string): ParseResult {
  const json = parseJson(text)
  return json.ok ? parseSaved(json.value) : json
}
