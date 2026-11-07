/**
 * The tag row on a hero's or villain's sheet (scrpg-aid-designs/library/spec.md, "Tags on an item's
 * own page"): the same chips and + popover as the library. A tag's name opens the library
 * filtered by it. Sheet mode only; it's left out of print.
 */
import { useContext, useEffect, useState } from 'react'
import { StoreContext } from '../app/store-context'
import { useOptionalVillainStore } from '../app/villain-store-context'
import { PopoverGroup } from './Popover'
import { viewHash } from './query'
import { ItemTags } from './TagControls'
import { allTags, compareText, tagKey, withoutTag, withTag, type TagCount } from './tags'

/** Every tag in the library, for suggestions and spelling. Read once; a failure just means no suggestions. */
function useLibraryTags(): TagCount[] {
  // Either store may be missing (a page rendered on its own); its tags just aren't suggested.
  const heroes = useContext(StoreContext)
  const villains = useOptionalVillainStore()
  const [tags, setTags] = useState<TagCount[]>([])
  useEffect(() => {
    let live = true
    Promise.all([heroes?.list(), villains?.list()]).then(
      ([h, v]) => live && setTags(allTags([...(h?.heroes ?? []), ...(v?.villains ?? [])])),
      () => {},
    )
    return () => {
      live = false
    }
  }, [heroes, villains])
  return tags
}

/** The library filtered by one tag. */
const tagLibraryPath = (tag: string) => viewHash({ kind: 'query', query: { text: '', types: [], tags: [tag] } })

interface SheetTagsProps {
  tags: readonly string[]
  itemName: string
  onChange: (tags: string[]) => void
  /** Opens the library filtered by a tag (after saving, on the hero page). */
  onOpenTag: (path: string) => void
}

export function SheetTags({ tags, itemName, onChange, onOpenTag }: SheetTagsProps) {
  const library = useLibraryTags()
  // Tags added here count too, so they're suggested and spelled the same way next time.
  const known = [...library, ...tags.filter((t) => !library.some((l) => tagKey(l.name) === tagKey(t))).map((name) => ({ name, count: 1 }))].sort((a, b) => compareText(a.name, b.name))
  return (
    <PopoverGroup>
      <div className="sheet-tags screen-only" role="group" aria-label="Tags">
        <span className="sheet-tags__label" aria-hidden="true">
          Tags
        </span>
        <ItemTags tags={tags} itemName={itemName} allTags={known} onFilter={(t) => onOpenTag(tagLibraryPath(t))} onAdd={(t) => onChange(withTag(tags, t))} onRemove={(t) => onChange(withoutTag(tags, t))} />
      </div>
    </PopoverGroup>
  )
}
