import { useEffect, useState } from 'react'
import {
  applyTheme,
  readPreference,
  resolveTheme,
  systemScheme,
  writePreference,
  type SystemScheme,
  type ThemePreference,
} from './theme'

/** The player's theme preference, applied to the document and kept in step with the system setting. */
export function useTheme(): [ThemePreference, (preference: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(() => readPreference())
  const [system, setSystem] = useState<SystemScheme>(() => systemScheme())

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const queries = ['(prefers-color-scheme: dark)', '(prefers-color-scheme: light)'].map((q) => window.matchMedia(q))
    const update = () => setSystem(systemScheme())
    queries.forEach((q) => q.addEventListener('change', update))
    return () => queries.forEach((q) => q.removeEventListener('change', update))
  }, [])

  useEffect(() => {
    applyTheme(resolveTheme(preference, system))
  }, [preference, system])

  const choose = (next: ThemePreference) => {
    writePreference(next)
    setPreference(next)
  }
  return [preference, choose]
}
