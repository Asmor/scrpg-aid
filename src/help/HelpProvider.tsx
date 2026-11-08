/**
 * Help that works from any page (scrpg-aid-designs/help/spec.md, sections 1 and 5): `?` opens the
 * Keyboard shortcuts dialog anywhere outside a text field, and the Help menu opens it too.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { HelpContext, usePageKey, type HelpValue } from './help-context'
import { ShortcutsDialog } from './ShortcutsDialog'

export function HelpProvider({ children }: { children: ReactNode }) {
  const [shortcuts, setShortcuts] = useState(false)
  usePageKey(
    '?',
    (e) => {
      e.preventDefault()
      setShortcuts(true)
    },
    !shortcuts,
  )
  const value = useMemo<HelpValue>(() => ({ openShortcuts: () => setShortcuts(true) }), [])
  return (
    <HelpContext.Provider value={value}>
      {children}
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
    </HelpContext.Provider>
  )
}
