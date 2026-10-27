/** Gives components the villain store (Phase 5), so tests can pass an in-memory one. */
import { createContext, useContext } from 'react'
import type { VillainStore } from '../villain/store'

export const VillainStoreContext = createContext<VillainStore | null>(null)

export function useVillainStore(): VillainStore {
  const store = useContext(VillainStoreContext)
  if (!store) throw new Error('useVillainStore needs a VillainStoreContext provider')
  return store
}
