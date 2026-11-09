/**
 * The GM's changes to a hero at the table (scrpg-aid-designs/game-table/spec.md, section 5, "The GM's
 * ⋯ on a hero card"). They change the game's copy directly (./table.ts changeHeroPlay), and the
 * player sees the result like any other change. Each one goes in the hero's history marked as
 * the GM's ("GM: Lost 4 HP (18 → 14)."); a mod already says it's from the GM.
 */
import type { HeroSheet } from '../creation/sheet'
import type { PlayMod, PlayState, PlayTwist } from '../hero/model'
import { addMod, addTwist, setHealth, setReactionUsed, type Clock } from '../play/state'

export type HeroChange =
  | { kind: 'health'; value: number }
  | { kind: 'mod'; mod: Omit<PlayMod, 'id'> }
  | { kind: 'twist'; twist: Omit<PlayTwist, 'id'> }
  | { kind: 'reaction'; used: boolean }

/** Applies the change, marking its new history entries as the GM's. */
export function applyHeroChange(play: PlayState, sheet: Pick<HeroSheet, 'healthRanges' | 'maxHealth'>, change: HeroChange, clock: Clock): PlayState {
  const next = (() => {
    switch (change.kind) {
      case 'health':
        return setHealth(play, sheet, change.value, clock)
      case 'mod':
        return addMod(play, change.mod, clock, { from: 'the GM' })
      case 'twist':
        return addTwist(play, change.twist, clock)
      case 'reaction':
        return setReactionUsed(play, change.used, clock)
    }
  })()
  if (change.kind === 'mod') return next
  // By id, not position: a full history drops its oldest entry as it gains one.
  const before = new Set(play.history.map((e) => e.id))
  return { ...next, history: next.history.map((e) => (before.has(e.id) ? e : { ...e, text: `GM: ${e.text}` })) }
}
