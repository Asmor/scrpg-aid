/** The stores' contexts for Play page tests; the helpers are in ./play-stores.ts. */
import type { ReactNode } from 'react'
import { GameStoreContext } from '../app/game-store-context'
import { StoreContext } from '../app/store-context'
import { VillainStoreContext } from '../app/villain-store-context'
import type { PlayStores } from './play-stores'

/** The stores' contexts. */
export function PlayProviders({ stores, children }: { stores: PlayStores; children: ReactNode }) {
  return (
    <StoreContext.Provider value={stores.heroes}>
      <VillainStoreContext.Provider value={stores.villains}>
        <GameStoreContext.Provider value={stores.games}>{children}</GameStoreContext.Provider>
      </VillainStoreContext.Provider>
    </StoreContext.Provider>
  )
}
