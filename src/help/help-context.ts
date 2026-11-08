/** Opens the Keyboard shortcuts dialog from anywhere (./HelpProvider.tsx renders it), page shortcut keys, and the Help menu's items. */
import { createContext, useContext, useEffect, useRef } from 'react'
import { helpPath, helpUrl } from '../app/route'
import type { MenuItem } from '../library/Popover'
import { modalOpen, typingOrModified } from './shortcuts'

export interface HelpValue {
  openShortcuts: () => void
}

export const HelpContext = createContext<HelpValue>({ openShortcuts: () => {} })

export const useHelp = () => useContext(HelpContext)

/**
 * Calls `handler` when `key` (a lowercase letter, or any other key) is pressed, unless focus is in a field (./shortcuts.ts), in a dialog
 * or popover, or a modal is open: page shortcuts never reach into a dialog that isn't theirs.
 */
export function usePageKey(key: string, handler: (e: KeyboardEvent) => void, enabled = true): void {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      // Letters match either case (Shift doesn't matter); other keys match exactly.
      const pressed = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : e.key
      if (pressed !== key || typingOrModified(e) || modalOpen()) return
      if (e.target instanceof Element && e.target.closest('[role="dialog"], [role="menu"]')) return
      latest.current(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, enabled])
}

/** The menu's items, for the phone's header menu as well as the Help button. */
export function helpItems({ newTab, openShortcuts, openAbout }: { newTab: boolean; openShortcuts: () => void; openAbout: () => void }): MenuItem[] {
  return [
    { label: 'Help topics', href: newTab ? helpUrl() : helpPath(), ...(newTab ? { newTab: true as const } : {}), onSelect: () => {} },
    { label: 'Keyboard shortcuts', shortcut: '?', onSelect: openShortcuts },
    { label: 'About SCRPG Aid', onSelect: openAbout },
  ]
}
