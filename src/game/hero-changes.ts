/**
 * The GM's changes to a hero at the table (docs/design/game-table/spec.md, section 4, "The GM's
 * ⋯ on a hero card"). The same changes go to a player's device as requests once games are hosted
 * (Phase 2); for a hero from the GM's own library the GM's device applies them directly. Each
 * change is recorded in the hero's history, marked as the GM's ("GM: Lost 4 HP (18 → 14).").
 * A turn starting clears the hero's reaction, which isn't marked: it's the table's doing.
 */
import type { HeroSheet } from '../creation/sheet'
import type { PlayMod, PlayState, PlayTwist } from '../hero/model'
import { addMod, addTwist, setHealth, setReactionUsed, type Clock } from '../play/state'

export type HeroChange =
  | { kind: 'health'; value: number }
  | { kind: 'mod'; mod: Omit<PlayMod, 'id'> }
  | { kind: 'twist'; twist: Omit<PlayTwist, 'id'> }
  | { kind: 'reaction'; used: boolean }
  /** A turn starting. */
  | { kind: 'clearReaction' }

/** Applies the change, marking its new history entries as the GM's (except a turn start's). */
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
      case 'clearReaction':
        return setReactionUsed(play, false, clock)
    }
  })()
  if (change.kind === 'clearReaction' || change.kind === 'mod') return next
  const before = play.history.length
  return { ...next, history: next.history.map((e, i) => (i < before ? e : { ...e, text: `GM: ${e.text}` })) }
}
