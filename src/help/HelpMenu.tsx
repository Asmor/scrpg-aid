/**
 * The header's Help menu (scrpg-aid-designs/help/spec.md, section 1): Help topics, Keyboard
 * shortcuts and About SCRPG Aid. On the game table Help topics open in a new tab, so the game
 * isn't left; About and the shortcuts open as dialogs over whatever page this is.
 */
import { useState } from 'react'
import { AboutDialog } from '../components/About'
import { PopoverMenu } from '../library/Popover'
import { usePopover } from '../library/popover-state'
import { helpItems, useHelp } from './help-context'

export const HelpIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" />
    <path d="M9.4 9.2a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.4-2.6 4" />
    <path d="M12 17.4h.01" />
  </svg>
)

export function HelpMenu({ newTab = false, compact = false }: { /** On the game table: Help topics open in a new tab. */ newTab?: boolean; /** An icon button, for a phone's header. */ compact?: boolean }) {
  const [popover, bindPopover] = usePopover()
  const { openShortcuts } = useHelp()
  const [about, setAbout] = useState(false)
  return (
    <span className="popover-anchor">
      <button
        ref={bindPopover}
        type="button"
        className={compact ? 'icon-button' : 'button button--quiet'}
        aria-haspopup="menu"
        aria-expanded={popover.open}
        {...(compact ? { 'aria-label': 'Help' } : {})}
        onClick={(e) => {
          // Safari and Firefox on a Mac don't focus a clicked button; focus comes back here when the menu or a dialog closes.
          e.currentTarget.focus()
          popover.toggle()
        }}
      >
        <HelpIcon size={compact ? 20 : 16} />
        {!compact && 'Help'}
      </button>
      {popover.open && <PopoverMenu popover={popover} label="Help" className="popover--end" items={helpItems({ newTab, openShortcuts, openAbout: () => setAbout(true) })} />}
      {about && <AboutDialog onClose={() => setAbout(false)} />}
    </span>
  )
}
