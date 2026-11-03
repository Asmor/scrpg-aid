/**
 * Edit mode's snapshot (the hero wizard spec, "Saving and revert"): the document (a hero, or an
 * NPC template) as it was on entering edit mode, so "Revert changes" can tell whether anything
 * changed and put it back.
 */
/** What a snapshot covers: any library document. */
type Doc = { updatedAt: string; tags: string[] }

/** Whether two values hold the same data, whatever order their keys were added in. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  // A key set to undefined is the same as one that isn't there.
  const keys = (o: object) => Object.entries(o).filter(([, v]) => v !== undefined).map(([k]) => k)
  const ak = keys(a)
  if (ak.length !== keys(b).length) return false
  return ak.every((k) => Object.hasOwn(b, k) && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/**
 * Whether the hero differs from the snapshot, ignoring when it was last saved. Tags are
 * outside the snapshot (docs/design/library/spec.md): changing them isn't an edit to revert.
 */
export function changedSince<T extends Doc>(snapshot: T, hero: T): boolean {
  return !same({ ...snapshot, updatedAt: '', tags: [] }, { ...hero, updatedAt: '', tags: [] })
}

/** Puts the snapshot's data back into `draft` (an editor change), keeping only its current tags. */
export function restoreSnapshot<T extends Doc>(draft: T, snapshot: T): void {
  const tags = [...draft.tags]
  for (const key of Object.keys(draft)) delete (draft as unknown as Record<string, unknown>)[key]
  Object.assign(draft, structuredClone(snapshot), { tags })
}
