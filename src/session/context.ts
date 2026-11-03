/** Gives pages the browser's game session (Phase 4); ./SessionProvider.tsx provides it. */
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { GmSession, PlayerSession, PlayerSnapshot } from './controller'
import type { HostSession, HostSnapshot } from './host'
import type { CurrentSession, SessionManager } from './manager'
import type { SessionState } from './types'

export const SessionContext = createContext<SessionManager | null>(null)

export interface SessionApi extends CurrentSession {
  /** The last game joined, kept after leaving it. */
  lastGame?: { room: string; password?: string; at?: string }
  host(password?: string): void
  /** Hosts a game (the game table) as `gm`; the name is remembered on this device. */
  hostGame(gameId: string, gm: string): void
  stopHosting(): Promise<void>
  /** The name this device's user goes by at the table. */
  name: string
  join(options: { room: string; password?: string; heroId: string; sharedUpTo?: string }): void
  leave(): void
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
    host: (password) => manager?.host(password),
    hostGame: (gameId, gm) => manager?.hostGame(gameId, gm),
    stopHosting: () => manager?.stopHosting() ?? Promise.resolve(),
    name: manager?.name() ?? '',
    join: (options) => manager?.join(options),
    leave: () => manager?.leave(),
  }
}

/** The GM session's state, kept current; undefined without one. */
export function useGmState(gm: GmSession | undefined): SessionState | undefined {
  return useSyncExternalStore(gm?.subscribe ?? noSubscribe, gm?.getSnapshot ?? nothing)
}

/** The player session's status and state, kept current; undefined without one. */
export function usePlayerSnapshot(player: PlayerSession | undefined): PlayerSnapshot | undefined {
  return useSyncExternalStore(player?.subscribe ?? noSubscribe, player?.getSnapshot ?? nothing)
}

/** The hosting session's snapshot (the game, its version, who's connected), kept current; undefined without one. */
export function useHostSnapshot(host: HostSession | undefined): HostSnapshot | undefined {
  return useSyncExternalStore(host?.subscribe ?? noSubscribe, host?.getSnapshot ?? nothing)
}
