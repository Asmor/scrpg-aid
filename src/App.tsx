import { useState } from 'react'
import { listPath, useRoute } from './app/route'
import { StoreContext } from './app/store-context'
import { HeroList } from './components/HeroList'
import { HeroPage } from './components/HeroPage'
import { HeroEditor } from './editor/HeroEditor'
import { ThemeToggle } from './components/ThemeToggle'
import { createDefaultStore, type HeroStore } from './hero/store'
import { useTheme } from './theme/useTheme'

export default function App({ store: given }: { store?: HeroStore }) {
  const [theme, setTheme] = useTheme()
  const [store] = useState(() => given ?? createDefaultStore())
  const route = useRoute()
  return (
    <StoreContext.Provider value={store}>
      <div className="app">
        <header className="app-header">
          <h1>
            <a href={listPath}>SCRPG Builder</a>
          </h1>
          <ThemeToggle value={theme} onChange={setTheme} />
        </header>
        <main className="app-main">
          {route.name === 'list' && <HeroList />}
          {route.name === 'hero' && <HeroPage key={route.id} id={route.id} />}
          {route.name === 'edit' && <HeroEditor key={route.id} id={route.id} step={route.step} />}
          {route.name === 'notFound' && (
            <p role="alert">
              That page doesn't exist. <a href={listPath}>Go to your heroes</a>.
            </p>
          )}
        </main>
      </div>
    </StoreContext.Provider>
  )
}
