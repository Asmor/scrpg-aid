import { ThemeToggle } from './components/ThemeToggle'
import { useTheme } from './theme/useTheme'

export default function App() {
  const [theme, setTheme] = useTheme()
  return (
    <div className="app">
      <header className="app-header">
        <h1>SCRPG Builder</h1>
        <ThemeToggle value={theme} onChange={setTheme} />
      </header>
      <main className="app-main">
        <p>Hero creation is on its way.</p>
      </main>
    </div>
  )
}
