/**
 * Tags: the user's own labels on library items (docs/design/library/spec.md, "Tags on every
 * item"). They have no built-in meaning. Matching ignores case, but a tag is shown as it was
 * typed. There's no registry: "all tags" is the union of the tags on current items.
 */

/** The longest tag, in characters. */
export const MAX_TAG_LENGTH = 40

/** A tag's key for matching and uniqueness: its lower-cased text. */
export const tagKey = (tag: string): string => tag.toLocaleLowerCase()

/** Trims a typed tag, collapses its inner whitespace, and caps its length; undefined if nothing's left. */
export function normalizeTag(raw: string): string | undefined {
  const tag = [...raw.trim().replace(/\s+/g, ' ')].slice(0, MAX_TAG_LENGTH).join('').trim()
  return tag || undefined
}

/** Whether the list has the tag, ignoring case. */
export function hasTag(tags: readonly string[], tag: string): boolean {
  const key = tagKey(tag)
  return tags.some((t) => tagKey(t) === key)
}

/** The list with the tag added, unless it already has it (ignoring case). */
export function withTag(tags: readonly string[], tag: string): string[] {
  return hasTag(tags, tag) ? [...tags] : [...tags, tag]
}

/** The list without the tag, ignoring case. */
export function withoutTag(tags: readonly string[], tag: string): string[] {
  const key = tagKey(tag)
  return tags.filter((t) => tagKey(t) !== key)
}

/**
 * Tags read from a saved or imported document, which may come from anywhere: each normalized,
 * empty ones dropped, and repeats (ignoring case) kept once, first spelling first.
 */
export function cleanTags(tags: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of tags) {
    const tag = normalizeTag(raw)
    if (tag && !hasTag(out, tag)) out.push(tag)
  }
  return out
}

/** A tag in use, with how many items have it. */
export interface TagCount {
  /** The spelling shown, and used when the tag is picked or typed again. */
  name: string
  count: number
}

/**
 * Every tag on the items, alphabetical, with its item count. When items spell a tag
 * differently (an import can do that), the most common spelling wins, then the first
 * alphabetically.
 */
export function allTags(items: readonly { tags: readonly string[] }[]): TagCount[] {
  const byKey = new Map<string, Map<string, number>>()
  for (const item of items) {
    for (const tag of item.tags) {
      const spellings = byKey.get(tagKey(tag)) ?? new Map<string, number>()
      spellings.set(tag, (spellings.get(tag) ?? 0) + 1)
      byKey.set(tagKey(tag), spellings)
    }
  }
  return [...byKey.values()]
    .map((spellings) => {
      const [name] = [...spellings.entries()].sort(([a, m], [b, n]) => n - m || compareText(a, b))[0]!
      return { name, count: [...spellings.values()].reduce((sum, n) => sum + n, 0) }
    })
    .sort((a, b) => compareText(a.name, b.name))
}

/** Alphabetical order, ignoring case and accents, with numbers in number order ("scene-2" before "scene-10"). */
export const compareText = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }) || a.localeCompare(b)

/** The spelling to save for a typed tag: an existing tag's spelling if it matches one, ignoring case. */
export function spellingFor(typed: string, existing: readonly TagCount[]): string | undefined {
  const tag = normalizeTag(typed)
  if (!tag) return undefined
  return existing.find((t) => tagKey(t.name) === tagKey(tag))?.name ?? tag
}

/** The add-tag popover's choices for what's typed. */
export interface TagSuggestions {
  /** Up to six existing tags containing the text and not already on the item, alphabetical (an exact match first). */
  suggestions: string[]
  /** The tag to offer to create: the typed text, when it doesn't match an existing tag. */
  create?: string
  /** The existing tag the text matches, ignoring case, even if the item already has it. */
  exact?: string
}

export const MAX_SUGGESTIONS = 6

/** What the add-tag popover offers for `typed`, leaving out the tags in `exclude` (already on the item). */
export function suggestTags(typed: string, existing: readonly TagCount[], exclude: readonly string[] = []): TagSuggestions {
  const tag = normalizeTag(typed)
  const key = tag ? tagKey(tag) : ''
  const exact = tag === undefined ? undefined : existing.find((t) => tagKey(t.name) === key)?.name
  const suggestions = existing
    .filter((t) => tagKey(t.name).includes(key) && !hasTag(exclude, t.name))
    .map((t) => t.name)
    .sort((a, b) => Number(b === exact) - Number(a === exact))
    .slice(0, MAX_SUGGESTIONS)
  if (exact !== undefined) return { suggestions, exact }
  return tag ? { suggestions, create: tag } : { suggestions }
}

/**
 * What Enter picks in the add-tag popover: the existing tag the text matches, else the first
 * suggestion, else the tag to create.
 */
export function enterChoice(s: TagSuggestions): string | undefined {
  return s.exact ?? s.suggestions[0] ?? s.create
}
