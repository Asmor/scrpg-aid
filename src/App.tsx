import { useState } from 'react'
import { listPath, useRoute } from './app/route'
import { StoreContext } from './app/store-context'
import { Home } from './components/Home'
import { HeroPage } from './components/HeroPage'
import { AdvancementPage } from './editor/AdvancementPage'
import { HeroEditor } from './editor/HeroEditor'
import { VillainStoreContext } from './app/villain-store-context'
import { createDefaultVillainStore, type VillainStore } from './villain/store'
import { VillainEditor } from './villain/VillainEditor'
import { VillainPage } from './villain/VillainPage'
import { VillainPlayPage } from './villain/VillainPlayPage'
import { GmPage } from './session/GmPage'
import { JoinPage } from './session/JoinPage'
import { SessionProvider } from './session/SessionProvider'
import type { Connect } from './session/transport'
import type { SessionStore } from './session/storage'
import { ThemeToggle } from './components/ThemeToggle'
import { createDefaultStore, type HeroStore } from './hero/store'
import { useTheme } from './theme/useTheme'

/** `store`, `villainStore`, `connect`, and `sessionStore` are injectable for tests. */
export default function App({ store: given, villainStore: givenVillains, connect, sessionStore }: { store?: HeroStore; villainStore?: VillainStore; connect?: Connect; sessionStore?: SessionStore }) {
  const [theme, setTheme] = useTheme()
  const [store] = useState(() => given ?? createDefaultStore())
  const [villainStore] = useState(() => givenVillains ?? createDefaultVillainStore())
  const route = useRoute()
  return (
    <StoreContext.Provider value={store}>
      <VillainStoreContext.Provider value={villainStore}>
      <SessionProvider {...(connect ? { connect } : {})} {...(sessionStore ? { store: sessionStore } : {})}>
      <div className="app">
        <header className="app-header">
          <h1>
            <a href={listPath}>SCRPG Aid</a>
          </h1>
          <ThemeToggle value={theme} onChange={setTheme} />
        </header>
        <main className={route.name === 'edit' ? 'app-main app-main--wide' : 'app-main'}>
          {route.name === 'list' && <Home />}
          {route.name === 'villain' && <VillainPage key={route.id} id={route.id} />}
          {route.name === 'villainPlay' && <VillainPlayPage key={route.id} id={route.id} />}
          {route.name === 'villainEdit' && <VillainEditor key={route.id} id={route.id} step={route.step} />}
          {/* Sheet and Play are one page: the same key keeps it (and the loaded hero) when switching. */}
          {(route.name === 'hero' || route.name === 'play') && <HeroPage key={route.id} id={route.id} mode={route.name === 'play' ? 'play' : 'sheet'} />}
          {route.name === 'edit' && <HeroEditor key={route.id} id={route.id} step={route.step} part={route.part} />}
          {route.name === 'advancement' && <AdvancementPage key={route.id} id={route.id} />}
          {route.name === 'gm' && <GmPage />}
          {route.name === 'join' && <JoinPage key={route.room ?? ''} room={route.room} />}
          {route.name === 'notFound' && (
            <p role="alert">
              That page doesn't exist. <a href={listPath}>Go to your heroes</a>.
            </p>
          )}
        </main>
      </div>
      </SessionProvider>
      </VillainStoreContext.Provider>
    </StoreContext.Provider>
  )
}
