/** Reads this device's settings once at start, and saves each change as it applies. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { applyToRoot, SettingsContext, type SettingsValue } from './context'
import { DEFAULT_SETTINGS, type Settings } from './model'
import type { SettingsStore } from './store'

export function SettingsProvider({ store, roomScale = false, children }: { store: SettingsStore; /** The display view keeps its own size. */ roomScale?: boolean; children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [saveError, setSaveError] = useState<string | undefined>()
  const latest = useRef(settings)
  useEffect(() => {
    let live = true
    store.load().then(
      (loaded) => {
        if (!live) return
        latest.current = loaded
        setSettings(loaded)
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [store])
  useEffect(() => {
    applyToRoot(document.documentElement, { motion: settings.motion, textSize: roomScale ? 'normal' : settings.textSize })
  }, [settings.motion, settings.textSize, roomScale])
  const update = useCallback(
    (change: (settings: Settings) => Settings) => {
      const next = change(latest.current)
      latest.current = next
      setSettings(next)
      store.save(next).then(
        () => setSaveError(undefined),
        (e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)),
      )
    },
    [store],
  )
  const value = useMemo<SettingsValue>(() => ({ settings, update, ...(saveError ? { saveError } : {}) }), [settings, update, saveError])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
