/**
 * Provides the browser's game session (Phase 4) to every page, resuming a saved one once the
 * device's settings are read (hosting depends on them), whatever page is open.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { newId } from '../hero/model'
import type { Clock } from '../play/state'
import { useOptionalGameStore } from '../app/game-store-context'
import { useOptionalJoinedStore } from '../app/joined-store-context'
import { useSettings } from '../settings/context'
import { npcSavesOf } from '../settings/model'
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
  const joined = useOptionalJoinedStore()
  const [manager] = useState(() => new SessionManager(connect, store ?? localSessionStore(), clock, games ?? undefined, joined ?? undefined))
  // Settings › Saves for minions and lieutenants: players' Attacks hold saves for the GM unless they roll automatically.
  const { settings, loaded } = useSettings()
  const holdSaves = npcSavesOf(settings) !== 'auto'
  useEffect(() => manager.setHoldSaves(holdSaves), [manager, holdSaves])
  useEffect(() => {
    // Not before the settings are read, so a resumed game doesn't roll saves the GM wanted to.
    if (loaded === false) return
    manager.resume()
    return () => manager.suspend()
  }, [manager, loaded])
  return <SessionContext.Provider value={manager}>{children}</SessionContext.Provider>
}
