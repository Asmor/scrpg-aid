/** Gives pages the browser's game session (Phase 4); ./SessionProvider.tsx provides it. */
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { GmSession, PlayerSession, PlayerSnapshot } from './controller'
import type { CurrentSession, SessionManager } from './manager'
import type { SessionState } from './types'

export const SessionContext = createContext<SessionManager | null>(null)

export interface SessionApi extends CurrentSession {
  /** The last game joined, kept after leaving it. */
  lastGame?: { room: string; password?: string; at?: string }
  host(password?: string): void
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
