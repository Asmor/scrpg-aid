/**
 * Which retcons (step 6) a hero may take.
 *
 * The user ruled that raising the Red status die isn't allowed when it's already at its
 * maximum (Nurturing and Naive start at d12). This is an exception to "warn, don't block":
 * the app shouldn't offer that retcon, and a saved hero that has it gets a warning.
 *
 * A Divided hero with two personalities has two sets of status dice; the retcon raises the
 * die of one form, which the player picks (the user's ruling).
 */
import { retcons } from '../rules/data'
import { compareDice } from '../rules/dice'
import type { Retcon } from '../rules/types'
import type { Hero } from '../hero/model'
import { baseStatusDice, statusRetconForm } from './health'
import { dividedChoice } from './layers'
import { warning, type RuleWarning } from './warnings'

const capitalized = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`

/** The forms whose status die this retcon could still raise. */
function formsWithRoom(hero: Hero, retcon: Retcon & { kind: 'upgradeStatusDie' }): ('civilian' | 'heroic')[] {
  const forms = dividedChoice(hero)?.heroicPersonality ? (['civilian', 'heroic'] as const) : (['civilian'] as const)
  return forms.filter((form) => {
    const die = baseStatusDice(hero, form)?.[retcon.zone]
    return !die || compareDice(die, retcon.max) < 0
  })
}

/** Whether the hero may take this retcon, and why not if they can't. */
export function retconUnavailableReason(hero: Hero, retcon: Retcon): string | undefined {
  if (retcon.kind === 'upgradeStatusDie' && formsWithRoom(hero, retcon).length === 0) {
    const die = baseStatusDice(hero)?.[retcon.zone]
    const both = dividedChoice(hero)?.heroicPersonality ? ' in both forms' : ''
    return `Your ${capitalized(retcon.zone)} status die is already ${die}${both}.`
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
  if (reason) return [warning('retcon', 'retcon-not-allowed', `${reason} Choose a different retcon.`)]
  if (chosen?.kind === 'upgradeStatusDie' && hero.retcon?.kind === 'upgradeStatusDie') {
    const form = statusRetconForm(hero)
    const zone = capitalized(chosen.zone)
    if (!form) return [warning('retcon', 'retcon-form-missing', `Choose which form's ${zone} status die this retcon raises.`)]
    if (hero.retcon.form === 'heroic' && form === 'civilian') {
      return [warning('retcon', 'retcon-form', `This retcon raises your heroic form's ${zone} die, but you have only one personality.`)]
    }
    if (!formsWithRoom(hero, chosen).includes(form)) {
      return [warning('retcon', 'retcon-not-allowed', `Your ${form} form's ${zone} status die is already ${baseStatusDice(hero, form)?.[chosen.zone]}; raise the other form's.`)]
    }
  }
  return []
}
