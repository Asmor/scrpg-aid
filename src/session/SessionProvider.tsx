/**
 * Provides the browser's game session (Phase 4) to every page, resuming a saved one when the
 * app starts.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { newId } from '../hero/model'
import type { Clock } from '../play/state'
import { useOptionalGameStore } from '../app/game-store-context'
import { SessionContext } from './context'
import { SessionManager } from './manager'
import { localSessionStore, type SessionStore } from './storage'
import type { Connect } from './transport'
import { connectTrystero } from './trystero'

const defaultClock = (): Clock => ({ now: new Date(), newId: () => newId() })

interface Props {
  children: ReactNode
  /** Injectable for tests: the transport, the storage, and the clock. */
  connect?: Connect
  store?: SessionStore
  clock?: () => Clock
}

export function SessionProvider({ children, connect = connectTrystero, store, clock = defaultClock }: Props) {
  // Hosting reads and saves games (the game table).
  const games = useOptionalGameStore()
  const [manager] = useState(() => new SessionManager(connect, store ?? localSessionStore(), clock, games ?? undefined))
  useEffect(() => {
    manager.resume()
    return () => manager.suspend()
  }, [manager])
  return <SessionContext.Provider value={manager}>{children}</SessionContext.Provider>
}
