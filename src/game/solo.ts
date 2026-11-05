/**
 * Solo games (docs/design/game-table/spec.md, section 12): a hero's or villain's standalone Play
 * page keeps its play state in a game of its own, made the first time the page opens. It holds
 * the one copied character, has no turn order or tracker on screen, and takes its scene zone
 * from the Play page's scene control. It isn't listed on the Games page or in the library: it
 * belongs to the character, and deleting the character deletes it.
 *
 * Pure, apart from the id: a character's solo game has a fixed id, so it's found without a search.
 */
import { heroDisplayName, type Hero } from '../hero/model'
import { MAX_HERO_POINTS, startOver, type Clock } from '../play/state'
import { villainDisplayName, type Villain } from '../villain/model'
import { resetVillain } from '../villain/play'
import { createGame, copySheet, heroCopy, villainCopy, type Game, type HeroInGame, type VillainInGame } from './model'
import { sheetDiff, sheetsDiffer } from './sheet-diff'
import { updateSheet } from './table'

export type SoloKind = 'hero' | 'villain'

/** The id of a character's solo game. */
export const soloGameId = (kind: SoloKind, sourceId: string) => `solo-${kind}-${sourceId}`

/** Whether an id is a solo game's: all there is to go on when the game itself can't be read. */
export const isSoloGameId = (id: string) => id.startsWith('solo-')

/** A new solo game for a character, its copy at fresh play state. */
export function createSoloGame(kind: 'hero', doc: Hero, clock: Clock): Game
export function createSoloGame(kind: 'villain', doc: Villain, clock: Clock): Game
export function createSoloGame(kind: SoloKind, doc: Hero | Villain, clock: Clock): Game
export function createSoloGame(kind: SoloKind, doc: Hero | Villain, clock: Clock): Game {
  const game = createGame({ id: soloGameId(kind, doc.id), now: clock.now })
  const solo = { kind, sourceId: doc.id }
  if (kind === 'hero') return { ...game, name: heroDisplayName(doc as Hero), solo, heroes: [heroCopy(doc as Hero, clock.newId())] }
  return { ...game, name: villainDisplayName(doc as Villain), solo, villains: [villainCopy(doc as Villain, clock.newId(), false)] }
}

/** The solo game's character. */
export function soloHero(game: Game): HeroInGame | undefined {
  return game.solo?.kind === 'hero' ? game.heroes[0] : undefined
}

export function soloVillain(game: Game): VillainInGame | undefined {
  return game.solo?.kind === 'villain' ? game.villains[0] : undefined
}

/**
 * Brings the solo game's copy up to date with the library sheet: when the build changed, the
 * sheet is re-copied with `reconcile`'s adjustments, logged (no approval: the player owns it).
 * Other changes (a new costume, notes) are copied quietly. Returns the same game when nothing changed.
 */
export function refreshSolo(game: Game, doc: Hero | Villain, clock: Clock): Game {
  const copy = game.solo?.kind === 'hero' ? soloHero(game) : soloVillain(game)
  if (!copy || !sheetsDiffer(copy.sheet, doc)) return game
  const name = 'method' in doc ? heroDisplayName(doc) : villainDisplayName(doc)
  if (sheetDiff(copy.sheet, doc).every((section) => section.section === 'Appearance')) {
    const sheet = copySheet(doc)
    return game.solo?.kind === 'hero'
      ? { ...game, name, heroes: game.heroes.map((h) => (h.id === copy.id ? { ...h, sheet: sheet as Hero } : h)) }
      : { ...game, name, villains: game.villains.map((v) => (v.id === copy.id ? { ...v, sheet: sheet as Villain } : v)) }
  }
  const ref = 'method' in doc ? { kind: 'hero' as const, id: copy.id, sheet: doc } : { kind: 'villain' as const, id: copy.id, sheet: doc }
  return { ...updateSheet(game, ref, clock, 'from your sheet'), name }
}

/** The solo game's hero points, changed by the player: kept between 0 and the most a hero can earn. */
export function changeSoloHeroPoints(game: Game, by: number): Game {
  return { ...game, heroPoints: Math.max(0, Math.min(MAX_HERO_POINTS, game.heroPoints + by)) }
}

/** Start over: the character back to fresh play state (Health at max, no mods, twists, minions, form or history), no hero points, and an empty log. */
export function startOverSolo(game: Game): Game {
  return {
    ...game,
    heroPoints: 0,
    heroes: game.heroes.map((h) => ({ ...h, play: startOver() })),
    villains: game.villains.map((v) => ({ ...v, play: resetVillain() })),
    feed: [],
  }
}
