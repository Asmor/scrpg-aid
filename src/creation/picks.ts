/**
 * Editing an ability pick's choices. `uses` is saved as a list with no gaps (one trait per
 * trait slot, in order), so slots are filled in order: a slot can be set once the ones
 * before it are, and clearing a slot clears the ones after it too.
 */
import type { TraitRef } from '../rules/catalog'
import type { AbilityPick } from '../hero/model'

/** What these helpers edit: a hero's or a villain's ability pick. */
type Editable = Pick<AbilityPick, 'name' | 'uses' | 'blanks' | 'customName'>

/** Whether trait slot `index` can be filled yet. */
export function canSetUse(pick: Editable, index: number): boolean {
  return index <= (pick.uses?.length ?? 0)
}

/** Sets (or, with `trait` undefined, clears) trait slot `index`. Returns a new pick. */
export function setUse<P extends Editable>(pick: P, index: number, trait: TraitRef | undefined): P {
  const uses = pick.uses ?? []
  if (!trait) {
    const kept = uses.slice(0, index)
    const { uses: _, ...rest } = pick
    return (kept.length ? { ...rest, uses: kept } : rest) as P
  }
  if (!canSetUse(pick, index)) return pick
  const next = [...uses]
  next[index] = trait
  return { ...pick, uses: next }
}

/** Sets a word blank. Returns a new pick. */
export function setBlank<P extends Editable>(pick: P, label: string, value: string | string[]): P {
  return { ...pick, blanks: { ...pick.blanks, [label]: value } }
}

/** Sets the player's name for the ability, removing it when empty. Returns a new pick. */
export function setCustomName<P extends Editable>(pick: P, name: string): P {
  const { customName: _, ...rest } = pick
  return (name ? { ...rest, customName: name } : rest) as P
}

/** Adds, replaces, or (with `next` undefined) removes the pick named `name`, keeping the others in order. */
export function replacePick<P extends Editable>(picks: readonly P[], name: string, next: P | undefined): P[] {
  if (!next) return picks.filter((p) => p.name !== name)
  return picks.some((p) => p.name === name) ? picks.map((p) => (p.name === name ? next : p)) : [...picks, next]
}
