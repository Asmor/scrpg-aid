/**
 * Tags on an item (scrpg-aid-designs/library/spec.md, "Tags in a row"): each tag a chip whose name
 * filters by it and whose X (always visible) removes it, then a dashed + that opens the add-tag
 * popover. The same pieces serve the library table, the bulk bar, and the sheets.
 */
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { PopoverDialog } from './Popover'
import { usePopover, type Popover } from './popover-state'
import { enterChoice, suggestTags, type TagCount } from './tags'

const X = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const PlusIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

interface TagChipProps {
  tag: string
  /** The item's name, for the X's label ("Remove scene-3 from Gravelord"). */
  itemName: string
  /** The tag is in the current filter (accent style). */
  active?: boolean
  /** Filters by the tag; without it the name is plain text (phones). */
  onFilter?: () => void
  onRemove: () => void
}

export function TagChip({ tag, itemName, active, onFilter, onRemove }: TagChipProps) {
  return (
    <span className={active ? 'tag-chip tag-chip--active' : 'tag-chip'}>
      {onFilter ? (
        <button type="button" className="tag-chip__name" aria-label={`Filter by ${tag}`} title={`Filter by ${tag}`} onClick={onFilter}>
          {tag}
        </button>
      ) : (
        <span className="tag-chip__name">{tag}</span>
      )}
      <button type="button" className="tag-chip__x" aria-label={`Remove ${tag} from ${itemName}`} title={`Remove ${tag} from ${itemName}`} onClick={onRemove}>
        <X />
      </button>
    </span>
  )
}

interface AddTagPanelProps {
  popover: Popover
  label: string
  /** Every tag in the library, for suggestions and spelling. */
  allTags: readonly TagCount[]
  /** Tags not to suggest (the item already has them). */
  exclude: readonly string[]
  onAdd: (tag: string) => void
}

/** The add-tag popover: a text field, up to six suggestions, and Create. */
export function AddTagPanel({ popover, label, allTags, exclude, onAdd }: AddTagPanelProps) {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const choices = suggestTags(text, allTags, exclude)
  const add = (tag: string | undefined) => {
    if (!tag) return
    popover.close()
    onAdd(tag)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    add(enterChoice(choices))
  }
  return (
    <PopoverDialog popover={popover} label={label} className="popover--tags" initialFocus={input}>
      <input ref={input} type="text" className="popover__field" aria-label="Tag" placeholder="Type a tag" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} aria-controls={listId} />
      <div id={listId} className="popover__options">
        {choices.suggestions.map((tag) => (
          <button key={tag} type="button" className="popover__option" onClick={() => add(tag)}>
            {tag}
          </button>
        ))}
        {choices.create && (
          <button type="button" className="popover__option" onClick={() => add(choices.create)}>
            Create tag “{choices.create}”
          </button>
        )}
        {!choices.create && choices.suggestions.length === 0 && <p className="popover__hint">{text.trim() ? 'The item already has this tag.' : 'Type a tag to add.'}</p>}
      </div>
    </PopoverDialog>
  )
}

interface ItemTagsProps {
  tags: readonly string[]
  itemName: string
  allTags: readonly TagCount[]
  /** Tags in the current filter, shown in the accent style. */
  isActive?: (tag: string) => boolean
  onFilter?: (tag: string) => void
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  className?: string
}

/** An item's tag chips and its + button with the add-tag popover. */
export function ItemTags({ tags, itemName, allTags, isActive, onFilter, onAdd, onRemove, className }: ItemTagsProps) {
  const [popover, bindPopover] = usePopover()
  const label = `Add a tag to ${itemName}`
  return (
    <div className={`item-tags ${className ?? ''}`}>
      {tags.map((tag) => (
        <TagChip key={tag} tag={tag} itemName={itemName} active={isActive?.(tag)} {...(onFilter ? { onFilter: () => onFilter(tag) } : {})} onRemove={() => onRemove(tag)} />
      ))}
      <span className="popover-anchor">
        <button ref={bindPopover} type="button" className="tag-add" aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={popover.open} onClick={popover.toggle}>
          <PlusIcon />
        </button>
        {popover.open && <AddTagPanel popover={popover} label={label} allTags={allTags} exclude={tags} onAdd={onAdd} />}
      </span>
    </div>
  )
}
