/** Gives pages the device's game session; ./SessionProvider.tsx provides it. */
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Hero } from '../hero/model'
import type { ClientSnapshot, PlayerClient, Received } from './client'
import type { HostSession, HostSnapshot } from './host'
import type { CurrentSession, SessionManager } from './manager'

export const SessionContext = createContext<SessionManager | null>(null)

export interface SessionApi extends CurrentSession {
  /** The last game joined, kept after leaving it. */
  lastGame?: { room: string; at?: string }
  /** The name this device's user goes by at the table. */
  name: string
  /** Hosts a game as `gm`; the name is remembered on this device. */
  hostGame(gameId: string, gm: string): void
  stopHosting(): Promise<void>
  /** Joins a hosted game as a player with one hero. */
  joinGame(options: { room: string; name: string; hero: Hero; cached?: Received }): void
  leaveGame(): void
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
    hostGame: (gameId, gm) => manager?.hostGame(gameId, gm),
    stopHosting: () => manager?.stopHosting() ?? Promise.resolve(),
    joinGame: (options) => manager?.joinGame(options),
    leaveGame: () => manager?.leaveGame(),
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
