/** The versioned save format for games, like ../hero/serialize.ts. */
import { parseJson, readEnvelope, type Migration } from '../saved'
import { cleanTags } from '../library/tags'
import type { Game } from './model'
import { gameProblem } from './validate'

export const GAME_FORMAT = 'scrpg-game'
export const GAME_VERSION = 1

export interface SavedGame {
  format: typeof GAME_FORMAT
  version: number
  game: Game
}

/** Migrations keyed by the version they upgrade from. */
export const GAME_MIGRATIONS: Readonly<Record<number, Migration>> = {}

export type GameParseResult = { ok: true; game: Game; migratedFrom?: number } | { ok: false; error: string }

export function gameToSaved(game: Game): SavedGame {
  return { format: GAME_FORMAT, version: GAME_VERSION, game }
}

/** Reads a saved game, migrating it to the current version (injectable for tests). */
export function parseSavedGame(value: unknown, migrations = GAME_MIGRATIONS, currentVersion = GAME_VERSION): GameParseResult {
  const result = readEnvelope<Game>(value, { format: GAME_FORMAT, key: 'game', currentVersion, migrations, problem: gameProblem })
  if (!result.ok) return result
  const game = { ...result.doc, tags: cleanTags(result.doc.tags) }
  return result.migratedFrom === undefined ? { ok: true, game } : { ok: true, game, migratedFrom: result.migratedFrom }
}

/** Reads a saved game from JSON text. */
export function parseSavedGameJson(text: string): GameParseResult {
  const json = parseJson(text)
  return json.ok ? parseSavedGame(json.value) : json
}
