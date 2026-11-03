/** Gives pages the device's game session; ./SessionProvider.tsx provides it. */
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Hero } from '../hero/model'
import type { ClientSnapshot, PlayerClient, Received } from './client'
import type { HostSession, HostSnapshot } from './host'
import type { LinkSnapshot } from './link'
import type { CurrentSession, SessionManager } from './manager'
import type { ObserverClient } from './watch'

export const SessionContext = createContext<SessionManager | null>(null)

export interface SessionApi extends CurrentSession {
  /** The last game joined, kept after leaving it. */
  lastGame?: { room: string; at?: string }
  /** The name this device's user goes by at the table. */
  name: string
  /** Hosts a game as `gm`; the name is remembered on this device. */
  /** Resolves with why hosting couldn't start, or undefined once it has. */
  hostGame(gameId: string, gm: string): Promise<string | undefined>
  /** Changes the GM's name players see, and remembers it on this device. */
  renameGm(gm: string): void
  stopHosting(): Promise<void>
  /** Gives a game a new code; while hosting it, keeps these connected players and screens and removes the rest. */
  newCode(gameId: string, keep?: ReadonlySet<string>): ReturnType<SessionManager['newCode']>
  /** Joins a hosted game as a player with one hero. */
  joinGame(options: { room: string; name: string; hero: Hero; cached?: Received; gameId?: string }): void
  leaveGame(): void
  /** The name this screen goes by when watching. */
  screenName: string
  /** Watches a hosted game on this screen; the screen's name is remembered on this device. */
  watchGame(options: { room: string; screenName: string }): void
  stopWatching(): void
  /** Notes shown once per key (the first-join note). */
  noteSeen(key: string): boolean
  markNoteSeen(key: string): void
}

const noSubscribe = () => () => {}
const nothing = () => undefined
const noSession = (): CurrentSession => NONE
const NONE: CurrentSession = {}

/** The current session and what can be done with it. Without a provider (a page rendered on its own, in tests), there's never a session. */
export function useSession(): SessionApi {
  const manager = useContext(SessionContext)
  const current = useSyncExternalStore(manager?.subscribe ?? noSubscribe, manager?.getSnapshot ?? noSession)
  const lastGame = manager?.lastGame()
  return {
    ...current,
    ...(lastGame ? { lastGame } : {}),
    name: manager?.name() ?? '',
    hostGame: (gameId, gm) => manager?.hostGame(gameId, gm) ?? Promise.resolve("There's no game session here."),
    renameGm: (gm) => manager?.renameGm(gm),
    stopHosting: () => manager?.stopHosting() ?? Promise.resolve(),
    newCode: (gameId, keep) => manager?.newCode(gameId, keep) ?? Promise.resolve({ ok: false as const, error: "There's no game session here." }),
    joinGame: (options) => manager?.joinGame(options),
    leaveGame: () => manager?.leaveGame(),
    screenName: manager?.screenName() ?? '',
    watchGame: (options) => manager?.watchGame(options),
    stopWatching: () => manager?.stopWatching(),
    noteSeen: (key) => manager?.noteSeen(key) ?? true,
    markNoteSeen: (key) => manager?.markNoteSeen(key),
  }
}

/** The hosting session's snapshot (the game, its version, who's connected), kept current; undefined without one. */
export function useHostSnapshot(host: HostSession | undefined): HostSnapshot | undefined {
  return useSyncExternalStore(host?.subscribe ?? noSubscribe, host?.getSnapshot ?? nothing)
}

/** The player's game client's snapshot (status, the table, pending actions, notices); undefined without one. */
export function usePlayingSnapshot(client: PlayerClient | undefined): ClientSnapshot | undefined {
  return useSyncExternalStore(client?.subscribe ?? noSubscribe, client?.getSnapshot ?? nothing)
}

/** The watching device's snapshot (status and the table); undefined without one. */
export function useWatchingSnapshot(client: ObserverClient | undefined): LinkSnapshot | undefined {
  return useSyncExternalStore(client?.subscribe ?? noSubscribe, client?.getSnapshot ?? nothing)
}
