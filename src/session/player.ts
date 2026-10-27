/**
 * A player's side of a game session (Phase 4). Pure: what the table sees of the hero, the
 * session's changes applied to the hero's play state (the GM's scene, mods others gave),
 * and which history entries to share.
 */
import type { HeroSheet } from '../creation/sheet'
import type { Hero, PlayHistoryEntry, PlayState } from '../hero/model'
import { heroDisplayName } from '../hero/model'
import { addMod, currentHealth, effectiveZone, sceneByGmText, setSceneZone, type Clock } from '../play/state'
import type { HeroSummary, SessionState, SharedEntry } from './types'

export function heroSummary(hero: Hero, sheet: Pick<HeroSheet, 'maxHealth' | 'healthRanges'>, play: PlayState): HeroSummary {
  const health = currentHealth(sheet, play)
  const zone = effectiveZone(sheet, play)
  return {
    name: heroDisplayName(hero),
    ...(health !== undefined ? { health } : {}),
    ...(sheet.maxHealth !== undefined ? { maxHealth: sheet.maxHealth } : {}),
    ...(zone ? { zone } : {}),
    mods: play.mods,
    twists: play.twists,
  }
}

/**
 * Brings the hero's play state in line with the session: the GM's scene, and the mods
 * waiting for this player. `applied` holds the ids of mods already added (a mod the player
 * has since removed must not come back). Returns the new state, the ids newly added, and
 * every waiting id to acknowledge, so the GM can stop holding them.
 */
export function applySession(
  play: PlayState,
  state: SessionState,
  clientId: string,
  applied: ReadonlySet<string>,
  clock: Clock,
): { play: PlayState; added: string[]; ack: string[] } {
  let next = setSceneZone(play, state.scene, clock, true)
  const mine = state.inbox.filter((i) => i.to === clientId)
  const added: string[] = []
  for (const item of mine) {
    if (applied.has(item.id) || next.mods.some((m) => m.id === item.id)) continue
    next = addMod(next, item.mod, clock, { id: item.id, from: item.from })
    added.push(item.id)
  }
  return { play: next, added, ack: mine.map((i) => i.id) }
}

/**
 * The history entries to share with the table: those after `after` (the last one shared),
 * leaving out the GM's scene changes, which the GM's own feed entry already covers.
 */
export function entriesToShare(history: readonly PlayHistoryEntry[], after: string | undefined): SharedEntry[] {
  const start = after === undefined ? 0 : history.findIndex((h) => h.id === after) + 1
  // If the last shared entry is no longer in the history, don't share the whole history again.
  if (after !== undefined && start === 0) return []
  const gmScene = new Set((['green', 'yellow', 'red'] as const).map(sceneByGmText))
  return history
    .slice(start)
    .filter((h) => !gmScene.has(h.text))
    .map((h) => ({ id: h.id, at: h.at, text: h.text, ...(h.details?.length ? { details: h.details } : {}) }))
}
