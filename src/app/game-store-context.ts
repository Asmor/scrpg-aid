/** Gives components the game store (the game table), so tests can pass an in-memory one. */
import { createContext, useContext } from 'react'
import type { GameStore } from '../game/store'

export const GameStoreContext = createContext<GameStore | null>(null)

export function useGameStore(): GameStore {
  const store = useContext(GameStoreContext)
  if (!store) throw new Error('useGameStore needs a GameStoreContext provider')
  return store
}

/** The game store if there is one (import and backup work without it, in tests). */
export function useOptionalGameStore(): GameStore | null {
  return useContext(GameStoreContext)
}
