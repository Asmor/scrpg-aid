/** Gives components the store of games joined as a player (cached on this device), so tests can pass an in-memory one. */
import { createContext, useContext } from 'react'
import type { JoinedStore } from '../game/joined-store'

export const JoinedStoreContext = createContext<JoinedStore | null>(null)

/** The joined games store, if there is one (pages work without it in tests). */
export function useOptionalJoinedStore(): JoinedStore | null {
  return useContext(JoinedStoreContext)
}
