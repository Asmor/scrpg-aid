import { useState } from 'react'
import { listPath, useRoute } from './app/route'
import { StoreContext } from './app/store-context'
import { LibraryPage } from './library/LibraryPage'
import { createDefaultSavedSearchStore, type SavedSearchStore } from './library/saved-searches'
import { SavedSearchStoreContext } from './app/saved-search-context'
import type { BackupTimeStore } from './library/backup-time'
import { HeroPage } from './components/HeroPage'
import { AdvancementPage } from './editor/AdvancementPage'
import { HeroEditor } from './editor/HeroEditor'
import { VillainStoreContext } from './app/villain-store-context'
import { createDefaultVillainStore, type VillainStore } from './villain/store'
import { VillainEditor } from './villain/VillainEditor'
import { VillainPage } from './villain/VillainPage'
import { VillainPlayPage } from './villain/VillainPlayPage'
import { GameStoreContext } from './app/game-store-context'
import { createDefaultGameStore, type GameStore } from './game/store'
import { GamePage } from './game/GamePage'
import { GamesPage } from './game/GamesPage'
import { GameDisplayPage } from './game/GameDisplayPage'
import { createDefaultJoinedStore, type JoinedStore } from './game/joined-store'
import { JoinedStoreContext } from './app/joined-store-context'
import { PlayerTable } from './game/PlayerTable'
import { JoinPage } from './session/JoinPage'
import { WatchPage } from './session/WatchPage'
import { ReceivePage } from './session/ReceivePage'
import { SessionProvider } from './session/SessionProvider'
import type { Connect } from './session/transport'
import type { SessionStore } from './session/storage'
import { ThemeToggle } from './components/ThemeToggle'
import { createDefaultStore, type HeroStore } from './hero/store'
import { useTheme } from './theme/useTheme'

interface AppProps {
  store?: HeroStore
  villainStore?: VillainStore
  gameStore?: GameStore
  joinedStore?: JoinedStore
  searchStore?: SavedSearchStore
  backupTime?: BackupTimeStore
  connect?: Connect
  sessionStore?: SessionStore
}

/** The stores, `connect`, `sessionStore`, and `backupTime` are injectable for tests. */
export default function App({ store: given, villainStore: givenVillains, gameStore: givenGames, joinedStore: givenJoined, searchStore: givenSearches, backupTime, connect, sessionStore }: AppProps) {
  const [store] = useState(() => given ?? createDefaultStore())
  const [villainStore] = useState(() => givenVillains ?? createDefaultVillainStore())
  const [gameStore] = useState(() => givenGames ?? createDefaultGameStore())
  const [joinedStore] = useState(() => givenJoined ?? createDefaultJoinedStore())
  const [searchStore] = useState(() => givenSearches ?? createDefaultSavedSearchStore())
  const route = useRoute()
  // The display view is dark unless the player chose light (docs/design/game-table/spec.md, section 13).
  const [theme, setTheme] = useTheme(route.name === 'watch' || route.name === 'gameDisplay' ? 'dark' : undefined)
  return (
    <StoreContext.Provider value={store}>
      <VillainStoreContext.Provider value={villainStore}>
      <GameStoreContext.Provider value={gameStore}>
      <JoinedStoreContext.Provider value={joinedStore}>
      <SavedSearchStoreContext.Provider value={searchStore}>
      <SessionProvider {...(connect ? { connect } : {})} {...(sessionStore ? { store: sessionStore } : {})}>
      {/* The library (the home screen), the Games page and the game table have their own header bars and layouts. */}
      {route.name === 'list' ? (
        <div className="app">
          <LibraryPage theme={theme} setTheme={setTheme} searchStore={searchStore} {...(backupTime ? { backupTime } : {})} />
        </div>
      ) : route.name === 'games' ? (
        <div className="app">
          <GamesPage theme={theme} setTheme={setTheme} searchStore={searchStore} {...(backupTime ? { backupTime } : {})} />
        </div>
      ) : route.name === 'game' ? (
        <div className="app">
          <GamePage key={route.id} id={route.id} />
        </div>
      ) : route.name === 'gameDisplay' ? (
        <div className="app">
          <GameDisplayPage key={route.id} id={route.id} />
        </div>
      ) : route.name === 'watch' ? (
        <div className="app">
          <WatchPage key={route.room ?? ''} room={route.room} />
        </div>
      ) : route.name === 'table' ? (
        <div className="app">
          <PlayerTable key={route.room} room={route.room} />
        </div>
      ) : (
      <div className="app">
        <header className="app-header">
          <h1>
            <a href={listPath}>SCRPG Aid</a>
          </h1>
          <ThemeToggle value={theme} onChange={setTheme} />
        </header>
        <main className={route.name === 'edit' ? 'app-main app-main--wide' : 'app-main'}>
          {route.name === 'villain' && <VillainPage key={route.id} id={route.id} />}
          {route.name === 'villainPlay' && <VillainPlayPage key={route.id} id={route.id} />}
          {route.name === 'villainEdit' && <VillainEditor key={route.id} id={route.id} step={route.step} />}
          {/* Sheet and Play are one page: the same key keeps it (and the loaded hero) when switching. */}
          {(route.name === 'hero' || route.name === 'play') && <HeroPage key={route.id} id={route.id} mode={route.name === 'play' ? 'play' : 'sheet'} />}
          {route.name === 'edit' && <HeroEditor key={route.id} id={route.id} step={route.step} part={route.part} />}
          {route.name === 'advancement' && <AdvancementPage key={route.id} id={route.id} />}
          {route.name === 'join' && <JoinPage key={route.room ?? ''} room={route.room} />}
          {route.name === 'receive' && <ReceivePage key={route.code ?? ''} code={route.code} />}
          {route.name === 'notFound' && (
            <p role="alert">
              That page doesn't exist. <a href={listPath}>Go to your library</a>.
            </p>
          )}
        </main>
      </div>
      )}
      </SessionProvider>
      </SavedSearchStoreContext.Provider>
      </JoinedStoreContext.Provider>
      </GameStoreContext.Provider>
      </VillainStoreContext.Provider>
    </StoreContext.Provider>
  )
}
