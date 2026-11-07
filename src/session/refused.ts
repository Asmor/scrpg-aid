/** What a player sees when the GM's device turns them away (scrpg-aid-designs/game-table/spec.md, section 10). Pure. */
import type { RefusedReason } from './protocol'

/** Why a player can't be in a game, for `gameName` ("Thursday game"). */
export function refusedText(reason: RefusedReason | 'oldHost', gameName: string): string {
  switch (reason) {
    case 'removed':
      return `You've been removed from ${gameName}. Ask the GM if you think that's a mistake.`
    case 'wrongGame':
      return 'That code now belongs to a different game. Check the code with your GM.'
    case 'full':
      return 'This game is full.'
    case 'taken':
      return 'Your hero is being played in this game on another device. Leave the game there, or ask the GM, then try again.'
    case 'version':
      return "This game's GM is on a newer version of the app. Reload this page to update."
    case 'oldHost':
      return "This game's GM is on an older version of the app. Ask them to reload their page to update."
  }
}

/** A code no game answers on: changed by the GM, or not hosted yet (the app can't tell which). */
export const NO_GAME = "No game is using this code right now. The GM may have changed it, or isn't hosting yet. Check the code with your GM."
