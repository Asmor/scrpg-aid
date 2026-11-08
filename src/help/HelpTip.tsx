/**
 * A "?" button beside a heading, opening a short popover from Help (scrpg-aid-designs/help/spec.md,
 * section 3): the section's title and first paragraph, and More in Help. It's non-modal, so play goes
 * on behind it; Escape or a click outside closes it, and opening one closes any other. On phones
 * it's a bottom sheet. More in Help opens in a new tab, so nothing on this page is left.
 */
import { useId } from 'react'
import { helpUrl } from '../app/route'
import { useMediaQuery } from '../components/useMediaQuery'
import { PopoverDialog } from '../library/Popover'
import { usePopover } from '../library/popover-state'
import { HELP_TIPS, tipContent, type HelpTipName } from './tips'

export function HelpTip({ tip }: { tip: HelpTipName }) {
  const [popover, bindPopover] = usePopover()
  const phone = useMediaQuery('(max-width: 759.98px)', false)
  const id = useId()
  const ref = HELP_TIPS[tip]
  const { title, text } = tipContent(tip)
  return (
    <span className="popover-anchor help-tip">
      <button
        ref={bindPopover}
        type="button"
        className="help-tip__button"
        aria-label={ref.label}
        aria-expanded={popover.open}
        aria-controls={id}
        onClick={(e) => {
          // Safari and Firefox on a Mac don't focus a clicked button; Escape gives focus back here.
          e.currentTarget.focus()
          popover.toggle()
        }}
      >
        ?
      </button>
      {popover.open && (
        <PopoverDialog popover={popover} label={title} id={id} className={phone ? 'popover--sheet help-tip__pop' : 'help-tip__pop'}>
          <p className="help-tip__title">{title}</p>
          <p className="help-tip__text">{text}</p>
          <a className="help-tip__more" href={helpUrl(ref.topic, ref.section)} target="_blank" rel="noopener">
            More in Help <span className="visually-hidden">(opens in a new tab)</span>
          </a>
        </PopoverDialog>
      )}
    </span>
  )
}
