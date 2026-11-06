/**
 * Where a device keeps its game sessions between reloads: the game it's hosting, playing in or
 * watching, the user's name at the table, the screen's name when watching, the last game joined, the notes already seen, and the device's
 * own client id. It's per-device and small, so it lives in localStorage, read back through
 * versioned readers. Every access is guarded, because storage can be unavailable (private
 * windows, blocked site data); then a session just doesn't survive a reload.
 */
import { newId } from '../hero/model'
import { readHostSaved, type HostSaved } from './host'
import { readPlayingSaved, type PlayingSaved } from './client'
import { readLastGame, type LastGame } from './types'
import { readWatchingSaved, type WatchingSaved } from './watch'

export interface SessionStore {
  /** The last game joined, kept after leaving it. */
  loadLastGame(): LastGame | undefined
  saveLastGame(game: LastGame): void
  /** The game this device is hosting, to pick it back up after a reload. */
  loadHost(): HostSaved | undefined
  saveHost(saved: HostSaved | undefined): void
  /** The hosted game this device is playing in, to rejoin after a reload. */
  loadPlaying(): PlayingSaved | undefined
  savePlaying(saved: PlayingSaved | undefined): void
  /** The hosted game this device is watching (a TV), to watch again after a reload. */
  loadWatching(): WatchingSaved | undefined
  saveWatching(saved: WatchingSaved | undefined): void
  /** The name this screen goes by when watching ("Living room TV"). */
  loadScreenName(): string
  saveScreenName(name: string): void
  /** Notes shown once (the first-join note, per game and hero): whether this one has been, and marking it. */
  noteSeen(key: string): boolean
  markNoteSeen(key: string): void
  /** The name this device's user goes by at the table (as the GM or a player). */
  loadName(): string
  saveName(name: string): void
  /** This browser's id in sessions, the same every time. */
  clientId(): string
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const KEYS = { host: 'scrpg.session.host', playing: 'scrpg.session.playing', notes: 'scrpg.session.notes', name: 'scrpg.session.name', lastGame: 'scrpg.session.lastGame', watching: 'scrpg.session.watching', screenName: 'scrpg.session.screenName', clientId: 'scrpg.session.clientId' }

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
    loadLastGame: () => readLastGame(read(KEYS.lastGame)),
    saveLastGame: (game) => write(KEYS.lastGame, game),
    loadPlaying: () => readPlayingSaved(read(KEYS.playing)),
    savePlaying: (saved) => write(KEYS.playing, saved),
    loadWatching: () => readWatchingSaved(read(KEYS.watching)),
    saveWatching: (saved) => write(KEYS.watching, saved),
    loadScreenName() {
      const name = read(KEYS.screenName)
      return typeof name === 'string' ? name.slice(0, 200) : ''
    },
    saveScreenName: (name) => write(KEYS.screenName, name.trim().slice(0, 200)),
    noteSeen(key) {
      const seen = read(KEYS.notes)
      return Array.isArray(seen) && seen.includes(key)
    },
    markNoteSeen(key) {
      const seen = read(KEYS.notes)
      const list = Array.isArray(seen) ? seen.filter((k): k is string => typeof k === 'string' && k !== key) : []
      // The most recent few hundred are plenty.
      write(KEYS.notes, [...list, key].slice(-300))
    },
    loadHost: () => readHostSaved(read(KEYS.host)),
    saveHost: (saved) => write(KEYS.host, saved),
    loadName() {
      const name = read(KEYS.name)
      return typeof name === 'string' ? name.slice(0, 200) : ''
    },
    saveName: (name) => write(KEYS.name, name.trim().slice(0, 200)),
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
