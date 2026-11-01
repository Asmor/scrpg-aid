/** Gives components the library's saved searches store, so tests can pass an in-memory one. */
import { createContext, useContext } from 'react'
import type { SavedSearchStore } from '../library/saved-searches'

export const SavedSearchStoreContext = createContext<SavedSearchStore | null>(null)

/** The saved searches store, if there is one (an import restores saved searches only with one). */
export function useOptionalSavedSearchStore(): SavedSearchStore | null {
  return useContext(SavedSearchStoreContext)
}
