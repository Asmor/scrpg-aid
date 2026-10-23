/**
 * Which retcons (step 6) a hero may take.
 *
 * The user ruled that raising the Red status die isn't allowed when it's already at its
 * maximum (Nurturing and Naive start at d12). This is an exception to "warn, don't block":
 * the app shouldn't offer that retcon, and a saved hero that has it gets a warning.
 */
import { personalitiesById, retcons } from '../rules/data'
import { compareDice } from '../rules/dice'
import type { Retcon } from '../rules/types'
import type { Hero } from '../hero/model'
import { warning, type RuleWarning } from './warnings'

/** Whether the hero may take this retcon, and why not if they can't. */
export function retconUnavailableReason(hero: Hero, retcon: Retcon): string | undefined {
  if (retcon.kind === 'upgradeStatusDie') {
    const personality = hero.personality && personalitiesById.get(hero.personality.id)
    const die = personality?.statusDice[retcon.zone]
    if (die && compareDice(die, retcon.max) >= 0) {
      return `Your ${retcon.zone[0]!.toUpperCase()}${retcon.zone.slice(1)} status die is already ${die}.`
    }
  }
  return undefined
}

/** The retcons to offer this hero. */
export function availableRetcons(hero: Hero): Retcon[] {
  return retcons.filter((r) => !retconUnavailableReason(hero, r))
}

/** Warns when the hero's recorded retcon isn't one they may take. */
export function checkRetcon(hero: Hero): RuleWarning[] {
  const chosen = hero.retcon && retcons.find((r) => r.id === hero.retcon!.id)
  const reason = chosen && retconUnavailableReason(hero, chosen)
  return reason ? [warning('retcon', 'retcon-not-allowed', `${reason} Choose a different retcon.`)] : []
}
