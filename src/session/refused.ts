/** What a player sees when the GM's device turns them away (scrpg-aid-designs/game-table/spec.md, section 10). Pure. */
import type { RefusedWhy } from './link'
import type { HeldBy } from './protocol'

/** Why a player can't be in a game, for `gameName` ("Thursday game"). `takenBy`: who took over their hero. */
export function refusedText(reason: RefusedWhy, gameName: string, takenBy = 'Another player'): string {
  switch (reason) {
    case 'removed':
      return `You've been removed from ${gameName}. Ask the GM if you think that's a mistake.`
    case 'wrongGame':
      return 'That code now belongs to a different game. Check the code with your GM.'
    case 'full':
      return 'This game is full.'
    case 'taken':
      // The join page asks what to do instead (section 7); this is for anywhere else.
      return 'Someone else in this game holds that hero.'
    case 'takenOver':
      return `${takenBy} took over your hero.`
    case 'invalid':
      return "The GM's device couldn't read this hero. Reload the page and try again."
    case 'version':
      return "This game's GM is on a newer version of the app. Reload this page to update."
    case 'oldHost':
      return "This game's GM is on an older version of the app. Ask them to reload their page to update."
  }
}

/**
 * Who holds a hero (game-table spec, section 7): "Alex is playing Maya Reyes.", "Alex was playing
 * Maya Reyes; they're not connected right now.", or "The GM is running Maya Reyes."
 */
export function heldText(held: HeldBy, hero: string): string {
  if (held.by === 'gm') return `The GM is running ${hero}.`
  const name = held.name || 'Another player'
  return held.connected ? `${name} is playing ${hero}.` : `${name} was playing ${hero}; they're not connected right now.`
}

/** The note on a hero in Bring a hero once its holder is known: "Alex is playing this one". */
export const heldNote = (held: HeldBy) => (held.by === 'gm' ? 'The GM is running this one' : `${held.name || 'Another player'} is playing this one`)

/** A code no game answers on: changed by the GM, or not hosted yet (the app can't tell which). */
export const NO_GAME = "No game is using this code right now. The GM may have changed it, or isn't hosting yet. Check the code with your GM."
