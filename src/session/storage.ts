/**
 * Where a browser keeps its game session between reloads (Phase 4): the GM's session or
 * the player's, and the browser's own client id. It's per-device and small, so it lives in
 * localStorage, read back through the versioned readers in ./types.ts. Every access is
 * guarded, because storage can be unavailable (private windows, blocked site data); then a
 * session just doesn't survive a reload.
 */
import { newId } from '../hero/model'
import { readGmSaved, readLastGame, readPlayerSaved, type GmSaved, type LastGame, type PlayerSaved } from './types'

export interface SessionStore {
  loadGm(): GmSaved | undefined
  saveGm(saved: GmSaved | undefined): void
  loadPlayer(): PlayerSaved | undefined
  savePlayer(saved: PlayerSaved | undefined): void
  /** The last game joined, kept after leaving it. */
  loadLastGame(): LastGame | undefined
  saveLastGame(game: LastGame): void
  /** This browser's id in sessions, the same every time. */
  clientId(): string
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const KEYS = { gm: 'scrpg.session.gm', player: 'scrpg.session.player', lastGame: 'scrpg.session.lastGame', clientId: 'scrpg.session.clientId' }

function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** A store over localStorage (or any Storage-like object, for tests; null for none). */
export function localSessionStore(storage: StorageLike | null | undefined = defaultStorage()): SessionStore {
  let fallbackId: string | undefined
  const read = (key: string): unknown => {
    try {
      const raw = storage?.getItem(key)
      return raw ? (JSON.parse(raw) as unknown) : undefined
    } catch {
      return undefined
    }
  }
  const write = (key: string, value: unknown) => {
    try {
      if (value === undefined) storage?.removeItem(key)
      else storage?.setItem(key, JSON.stringify(value))
    } catch {
      // Unavailable or full: the session just won't survive a reload.
    }
  }
  return {
    loadGm: () => readGmSaved(read(KEYS.gm)),
    saveGm: (saved) => write(KEYS.gm, saved),
    loadPlayer: () => readPlayerSaved(read(KEYS.player)),
    savePlayer: (saved) => write(KEYS.player, saved),
    loadLastGame: () => readLastGame(read(KEYS.lastGame)),
    saveLastGame: (game) => write(KEYS.lastGame, game),
    clientId() {
      const known = read(KEYS.clientId)
      if (typeof known === 'string' && known) return known
      fallbackId ??= newId()
      write(KEYS.clientId, fallbackId)
      return fallbackId
    },
  }
}

/** An in-memory Storage-like object, for tests. */
export function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}
