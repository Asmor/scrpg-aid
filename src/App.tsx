import { lazy, Suspense, useState } from 'react'
import { listPath, useRoute } from './app/route'
import { StoreContext } from './app/store-context'
import { LibraryPage } from './library/LibraryPage'
import { createDefaultSavedSearchStore, type SavedSearchStore } from './library/saved-searches'
import { SavedSearchStoreContext } from './app/saved-search-context'
import type { BackupTimeStore } from './library/backup-time'
import { VillainStoreContext } from './app/villain-store-context'
import { TemplateStoresContext } from './app/template-store-context'
import { createDefaultTemplateStores, type TemplateStores } from './template/store'
import { createDefaultVillainStore, type VillainStore } from './villain/store'
import { GameStoreContext } from './app/game-store-context'
import { createDefaultGameStore, type GameStore } from './game/store'
import { createDefaultJoinedStore, type JoinedStore } from './game/joined-store'
import { JoinedStoreContext } from './app/joined-store-context'
import { SessionProvider } from './session/SessionProvider'
import type { Connect } from './session/transport'
import type { SessionStore } from './session/storage'
import { HelpMenu } from './help/HelpMenu'
import { HelpProvider } from './help/HelpProvider'
import { ThemeToggle } from './components/ThemeToggle'
import { createDefaultStore, type HeroStore } from './hero/store'
import { useTheme } from './theme/useTheme'
import { SettingsLink } from './settings/SettingsLink'
import { PhoneMenu } from './library/LibraryHeader'
import { useMediaQuery } from './components/useMediaQuery'
import type { ThemePreference } from './theme/theme'
import { SettingsProvider } from './settings/SettingsProvider'
import { createDefaultSettingsStore, type SettingsStore } from './settings/store'

// Every page but the library (the home screen) loads when first opened, so the first load is
// smaller (review 2026-11-09, item 18). The service worker precaches every chunk, so they all
// still work offline.
const HeroPage = lazy(() => import('./components/HeroPage').then((m) => ({ default: m.HeroPage })))
const AdvancementPage = lazy(() => import('./advancement/AdvancementPage').then((m) => ({ default: m.AdvancementPage })))
const HeroEditor = lazy(() => import('./editor/HeroEditor').then((m) => ({ default: m.HeroEditor })))
const NewVillain = lazy(() => import('./villain/VillainWizard').then((m) => ({ default: m.NewVillain })))
const VillainWizard = lazy(() => import('./villain/VillainWizard').then((m) => ({ default: m.VillainWizard })))
const VillainPage = lazy(() => import('./villain/VillainPage').then((m) => ({ default: m.VillainPage })))
const VillainPlayPage = lazy(() => import('./villain/VillainPlayPage').then((m) => ({ default: m.VillainPlayPage })))
const GamePage = lazy(() => import('./game/GamePage').then((m) => ({ default: m.GamePage })))
const GamesPage = lazy(() => import('./game/GamesPage').then((m) => ({ default: m.GamesPage })))
const GameDisplayPage = lazy(() => import('./game/GameDisplayPage').then((m) => ({ default: m.GameDisplayPage })))
const PlayerTable = lazy(() => import('./game/PlayerTable').then((m) => ({ default: m.PlayerTable })))
const JoinPage = lazy(() => import('./session/JoinPage').then((m) => ({ default: m.JoinPage })))
const WatchPage = lazy(() => import('./session/WatchPage').then((m) => ({ default: m.WatchPage })))
const ReceivePage = lazy(() => import('./session/ReceivePage').then((m) => ({ default: m.ReceivePage })))
const TemplateEditor = lazy(() => import('./template/TemplateEditor').then((m) => ({ default: m.TemplateEditor })))
const HelpPage = lazy(() => import('./help/HelpPage').then((m) => ({ default: m.HelpPage })))
const SettingsPage = lazy(() => import('./settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

interface AppProps {
  store?: HeroStore
  villainStore?: VillainStore
  gameStore?: GameStore
  joinedStore?: JoinedStore
  searchStore?: SavedSearchStore
  templateStores?: TemplateStores
  settingsStore?: SettingsStore
  backupTime?: BackupTimeStore
  connect?: Connect
  sessionStore?: SessionStore
}

/** The stores, `connect`, `sessionStore`, and `backupTime` are injectable for tests. */
export default function App({ store: given, villainStore: givenVillains, gameStore: givenGames, joinedStore: givenJoined, searchStore: givenSearches, templateStores: givenTemplates, settingsStore: givenSettings, backupTime, connect, sessionStore }: AppProps) {
  const [store] = useState(() => given ?? createDefaultStore())
  const [villainStore] = useState(() => givenVillains ?? createDefaultVillainStore())
  const [gameStore] = useState(() => givenGames ?? createDefaultGameStore())
  const [joinedStore] = useState(() => givenJoined ?? createDefaultJoinedStore())
  const [searchStore] = useState(() => givenSearches ?? createDefaultSavedSearchStore())
  const [templateStores] = useState(() => givenTemplates ?? createDefaultTemplateStores())
  const [settingsStore] = useState(() => givenSettings ?? createDefaultSettingsStore())
  const route = useRoute()
  // The display view is dark unless the player chose light (scrpg-aid-designs/game-table/spec.md, section 13).
  const [theme, setTheme] = useTheme(route.name === 'watch' || route.name === 'gameDisplay' ? 'dark' : undefined)
  return (
    <SettingsProvider store={settingsStore} roomScale={route.name === 'watch' || route.name === 'gameDisplay'}>
    <StoreContext.Provider value={store}>
      <VillainStoreContext.Provider value={villainStore}>
      <GameStoreContext.Provider value={gameStore}>
      <JoinedStoreContext.Provider value={joinedStore}>
      <SavedSearchStoreContext.Provider value={searchStore}>
      <TemplateStoresContext.Provider value={templateStores}>
      <SessionProvider {...(connect ? { connect } : {})} {...(sessionStore ? { store: sessionStore } : {})}>
      <HelpProvider>
      <Suspense fallback={<p className="app-loading" role="status">Loading…</p>}>
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
          <HeaderActions theme={theme} setTheme={setTheme} />
        </header>
        <main className={route.name === 'edit' || route.name === 'villainEdit' || route.name === 'help' ? 'app-main app-main--wide' : 'app-main'}>
          {route.name === 'villain' && <VillainPage key={route.id} id={route.id} />}
          {route.name === 'villainPlay' && <VillainPlayPage key={route.id} id={route.id} />}
          {route.name === 'villainEdit' && <VillainWizard key={route.id} id={route.id} step={route.step} />}
          {route.name === 'villainNew' && <NewVillain />}
          {/* Sheet and Play are one page: the same key keeps it (and the loaded hero) when switching. */}
          {(route.name === 'hero' || route.name === 'play') && <HeroPage key={route.id} id={route.id} mode={route.name === 'play' ? 'play' : 'sheet'} />}
          {route.name === 'edit' && <HeroEditor key={route.id} id={route.id} step={route.step} part={route.part} />}
          {route.name === 'advancement' && <AdvancementPage key={route.id} id={route.id} />}
          {route.name === 'join' && <JoinPage key={route.room ?? ''} room={route.room} />}
          {route.name === 'receive' && <ReceivePage key={route.code ?? ''} code={route.code} />}
          {route.name === 'template' && <TemplateEditor key={`${route.kind}:${route.id}`} kind={route.kind} id={route.id} />}
          {route.name === 'settings' && <SettingsPage {...(backupTime ? { backupTime } : {})} />}
          {route.name === 'help' && <HelpPage {...(route.topic ? { topic: route.topic } : {})} {...(route.section ? { section: route.section } : {})} />}
          {route.name === 'notFound' && (
            <p role="alert">
              That page doesn't exist. <a href={listPath}>Go to your library</a>.
            </p>
          )}
        </main>
      </div>
      )}
      </Suspense>
      </HelpProvider>
      </SessionProvider>
      </TemplateStoresContext.Provider>
      </SavedSearchStoreContext.Provider>
      </JoinedStoreContext.Provider>
      </GameStoreContext.Provider>
      </VillainStoreContext.Provider>
    </StoreContext.Provider>
    </SettingsProvider>
  )
}

/** The other pages' header buttons: on phones, the library's one menu, so the header stays one row. */
function HeaderActions({ theme, setTheme }: { theme: ThemePreference; setTheme: (t: ThemePreference) => void }) {
  const phone = useMediaQuery('(max-width: 759.98px)', false)
  return (
    <span className="app-header__actions">
      {phone ? (
        <PhoneMenu theme={theme} setTheme={setTheme} />
      ) : (
        <>
          <ThemeToggle value={theme} onChange={setTheme} />
          <SettingsLink />
          <HelpMenu />
        </>
      )}
    </span>
  )
}
