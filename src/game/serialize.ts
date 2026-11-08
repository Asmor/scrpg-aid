/** The versioned save format for games, like ../hero/serialize.ts. */
import { readEnvelope } from '../saved'
import { cleanTags } from '../library/tags'
import type { Game } from './model'
import { gameProblem } from './validate'

export const GAME_FORMAT = 'scrpg-game'
export const GAME_VERSION = 8

export interface SavedGame {
  format: typeof GAME_FORMAT
  version: number
  game: Game
}

export type GameParseResult = { ok: true; game: Game } | { ok: false; error: string }

export function gameToSaved(game: Game): SavedGame {
  return { format: GAME_FORMAT, version: GAME_VERSION, game }
}

/** Reads a saved game. */
export function parseSavedGame(value: unknown): GameParseResult {
  const result = readEnvelope<Game>(value, { format: GAME_FORMAT, key: 'game', currentVersion: GAME_VERSION, problem: gameProblem })
  if (!result.ok) return result
  return { ok: true, game: { ...result.doc, tags: cleanTags(result.doc.tags) } }
}
