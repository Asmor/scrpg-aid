/**
 * The game table's keys (scrpg-aid-designs/help/spec.md, section 5): H opens Hand off to… (or Start
 * round 1), R rolls for whoever is being run (the GM's Running panel, or a player's hero), and L
 * jumps to the table log. The buttons they press carry `data-shortcut`, so a key does exactly what
 * the visible button does, and nothing when that button is gone or disabled.
 */
import { usePageKey } from '../help/help-context'

export type TableShortcut = 'hand-off' | 'roll'

/** Focuses and presses the first enabled button marked for `name`; whether there was one. */
function press(name: TableShortcut): boolean {
  const button = [...document.querySelectorAll<HTMLButtonElement>(`[data-shortcut="${name}"]`)].find((b) => !b.disabled)
  if (!button) return false
  // Focus first, so a dialog or menu it opens gives focus back to it.
  button.focus()
  button.click()
  return true
}

export function useTableShortcuts(): void {
  usePageKey('h', (e) => {
    if (press('hand-off')) e.preventDefault()
  })
  usePageKey('r', (e) => {
    if (press('roll')) e.preventDefault()
  })
  usePageKey('l', (e) => {
    // On phones the log is its own tab, with no heading to jump to.
    const log = document.getElementById('gt-log')
    if (!log) return
    e.preventDefault()
    log.scrollIntoView?.({ block: 'start' })
    log.focus({ preventScroll: true })
  })
}
