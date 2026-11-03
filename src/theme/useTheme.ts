import { useEffect, useState } from 'react'
import {
  applyTheme,
  readPreference,
  resolveTheme,
  systemScheme,
  writePreference,
  type SystemScheme,
  type Theme,
  type ThemePreference,
} from './theme'

/**
 * The player's theme preference, applied to the document and kept in step with the system setting.
 * `systemDefault` overrides what System shows (the display view is dark unless the player chose light).
 */
export function useTheme(systemDefault?: Theme): [ThemePreference, (preference: ThemePreference) => void] {
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
    applyTheme(preference === 'system' && systemDefault ? systemDefault : resolveTheme(preference, system))
  }, [preference, system, systemDefault])

  const choose = (next: ThemePreference) => {
    writePreference(next)
    setPreference(next)
  }
  return [preference, choose]
}
