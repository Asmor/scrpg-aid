import { useState } from 'react'
import { listPath, useRoute } from './app/route'
import { StoreContext } from './app/store-context'
import { HeroList } from './components/HeroList'
import { HeroPage } from './components/HeroPage'
import { HeroEditor } from './editor/HeroEditor'
import { PlayPage } from './play/PlayPage'
import { GmPage } from './session/GmPage'
import { JoinPage } from './session/JoinPage'
import { SessionProvider } from './session/SessionProvider'
import type { Connect } from './session/transport'
import type { SessionStore } from './session/storage'
import { ThemeToggle } from './components/ThemeToggle'
import { createDefaultStore, type HeroStore } from './hero/store'
import { useTheme } from './theme/useTheme'

/** `store`, `connect`, and `sessionStore` are injectable for tests. */
export default function App({ store: given, connect, sessionStore }: { store?: HeroStore; connect?: Connect; sessionStore?: SessionStore }) {
  const [theme, setTheme] = useTheme()
  const [store] = useState(() => given ?? createDefaultStore())
  const route = useRoute()
  return (
    <StoreContext.Provider value={store}>
      <SessionProvider {...(connect ? { connect } : {})} {...(sessionStore ? { store: sessionStore } : {})}>
      <div className="app">
        <header className="app-header">
          <h1>
            <a href={listPath}>SCRPG Aid</a>
          </h1>
          <ThemeToggle value={theme} onChange={setTheme} />
        </header>
        <main className="app-main">
          {route.name === 'list' && <HeroList />}
          {route.name === 'hero' && <HeroPage key={route.id} id={route.id} />}
          {route.name === 'edit' && <HeroEditor key={route.id} id={route.id} step={route.step} />}
          {route.name === 'play' && <PlayPage key={route.id} id={route.id} />}
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
    </StoreContext.Provider>
  )
}
