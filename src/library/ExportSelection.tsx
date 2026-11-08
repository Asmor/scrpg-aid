/** The selection bar's Export menu (scrpg-aid-designs/library/spec.md, section 3): a backup file, or a reference sheet. */
import type { LibraryModel } from './LibraryPage'
import { PopoverMenu } from './Popover'
import { usePopover } from './popover-state'

export function ExportSelectionMenu({ model, keys }: { model: LibraryModel; keys: readonly string[] }) {
  const [popover, bind] = usePopover()
  return (
    <span className="popover-anchor">
      <button ref={bind} type="button" className="button button--small" aria-haspopup="menu" aria-expanded={popover.open} onClick={popover.toggle}>
        Export
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {popover.open && (
        <PopoverMenu
          popover={popover}
          label="Export the selected items"
          items={[
            {
              label: 'Backup file (.json)',
              onSelect: () => model.exportItems(keys),
            },
            {
              label: 'Reference sheet…',
              onSelect: () => model.referenceSheet(keys),
            },
          ]}
        />
      )}
    </span>
  )
}
