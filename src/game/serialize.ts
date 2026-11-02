/** The versioned save format for games, like ../hero/serialize.ts. */
import { parseJson, readEnvelope, type Migration } from '../saved'
import { cleanTags } from '../library/tags'
import type { Game } from './model'
import { gameProblem } from './validate'

export const GAME_FORMAT = 'scrpg-game'
/**
 * Version 2 made heroes and villains on the table copies holding their sheet and play state
 * (docs/design/game-table/spec.md, section 1), and added `pendingSyncs`. A version 1 game's
 * heroes and villains were links to library documents; there's no migrating their play state,
 * so they leave the table, and everything else stays.
 */
export const GAME_VERSION = 2

export interface SavedGame {
  format: typeof GAME_FORMAT
  version: number
  game: Game
}

/** Migrations keyed by the version they upgrade from. */
export const GAME_MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (game) => {
    type Ref = { kind?: unknown }
    const turn = (game.turn ?? {}) as { order?: Ref[]; acted?: Ref[]; current?: Ref }
    const kept = (ref: Ref) => ref.kind !== 'hero' && ref.kind !== 'villain'
    const { current, ...rest } = turn
    return {
      ...game,
      heroes: [],
      villains: [],
      pendingSyncs: [],
      turn: { ...rest, order: (turn.order ?? []).filter(kept), acted: (turn.acted ?? []).filter(kept), ...(current && kept(current) ? { current } : {}) },
    }
  },
}

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
