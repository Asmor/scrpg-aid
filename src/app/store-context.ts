/** Gives components the hero store, so tests can pass an in-memory one. */
import { createContext, useContext } from 'react'
import type { HeroStore } from '../hero/store'

export const StoreContext = createContext<HeroStore | null>(null)

export function useStore(): HeroStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore needs a StoreContext provider')
  return store
}
