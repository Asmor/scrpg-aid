/**
 * What the table's cards show (./TableCenter.tsx), from a game's heroes and villains: the GM's
 * full game, or the projection a player's device received (./project.ts). Pure.
 */
import { buildSheet } from '../creation/sheet'
import { heroDisplayName } from '../hero/model'
import { formDice } from '../play/forms'
import { currentHealth, effectiveZone, statusDieFor } from '../play/state'
import type { Game, HeroInGame } from './model'
import type { HeroOnTable, VillainOnTable } from './project'
import { heroPlayInScene } from './table'
import type { HeroView, VillainView } from './TableCenter'

/** A hero's card: from the game's copy, with the scene's zone. */
export function heroView(h: HeroInGame | HeroOnTable, game: Pick<Game, 'scene' | 'solo'>, extra: { disconnected?: boolean; syncRequested?: boolean } = {}): HeroView {
  const sheet = buildSheet(h.sheet)
  const play = heroPlayInScene(game, h.play)
  const zone = effectiveZone(sheet, play)
  const statusDie = statusDieFor(formDice(h.sheet, sheet, play), zone)
  const health = currentHealth(sheet, play)
  return {
    ref: { kind: 'hero', id: h.id },
    name: heroDisplayName(h.sheet),
    sub: h.player ? h.player.name || 'A player' : "GM's hero",
    ...(zone ? { zone } : {}),
    ...(health !== undefined ? { health } : {}),
    ...(sheet.maxHealth !== undefined ? { maxHealth: sheet.maxHealth } : {}),
    ...(statusDie ? { statusDie } : {}),
    mods: play.mods,
    minions: (play.minions ?? []).map((m) => ({ id: m.id, name: m.name, die: m.die })),
    reactionUsed: play.reactionUsed,
    ...(extra.disconnected ? { disconnected: true } : {}),
    ...(extra.syncRequested ? { syncRequested: true } : {}),
  }
}

/** A villain's card from what the audience received of it. */
export function villainView(v: VillainOnTable): VillainView {
  return {
    ref: { kind: 'villain', id: v.id },
    name: v.name,
    kind: v.major ? 'Major villain' : 'Minor villain',
    hidden: v.hidden,
    playersSee: v.playersSee,
    ...(v.zone ? { zone: v.zone } : {}),
    ...(v.health !== undefined ? { health: v.health } : {}),
    ...(v.maxHealth !== undefined ? { maxHealth: v.maxHealth } : {}),
    ...(v.statusDie ? { statusDie: v.statusDie } : {}),
    mods: v.mods ?? [],
  }
}
