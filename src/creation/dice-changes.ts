/**
 * What a form or mode changes from the hero's base dice (docs/design/hero-sheet/spec.md,
 * "Forms and modes"): powers and qualities whose die differs, ones it adds, and ones it
 * doesn't have. Unchanged ones aren't listed, so a card shows only what's different.
 */
import { traitKey } from '../rules/catalog'
import type { Die } from '../rules/types'
import type { HeroTrait } from './traits'

type Trait = Pick<HeroTrait, 'trait' | 'die' | 'name'>

export interface DiceChange {
  name: string
  from: Die
  to: Die
}

export interface DiceChanges {
  changed: DiceChange[]
  added: Trait[]
  dropped: Trait[]
}

/** How `traits` (a form's or mode's) differ from `base`, each list in the order it's given. */
export function diceChanges(base: readonly Trait[], traits: readonly Trait[]): DiceChanges {
  const before = new Map(base.map((t) => [traitKey(t.trait), t]))
  const after = new Set(traits.map((t) => traitKey(t.trait)))
  const changed: DiceChange[] = []
  const added: Trait[] = []
  for (const t of traits) {
    const was = before.get(traitKey(t.trait))
    if (!was) added.push(t)
    else if (was.die !== t.die) changed.push({ name: t.name, from: was.die, to: t.die })
  }
  return { changed, added, dropped: base.filter((t) => !after.has(traitKey(t.trait))) }
}

/** Whether a form or mode changes nothing ("Uses your base dice."). */
export function noChanges(changes: DiceChanges): boolean {
  return !changes.changed.length && !changes.added.length && !changes.dropped.length
}
