/**
 * Status dice and Health (steps 4 and 7, data/heroes/health.json and personalities.json).
 *
 * Max Health = base + the max of each `addMaxOf` term (the Red status die, then one chosen
 * trait from the allowed list, or the fallback die if the hero has none) + a roll or the
 * fixed value. The hero records one Health trait, so this assumes the formula has a single
 * trait term, as health.json does. Some archetypes and personalities widen the trait list (`healthOptions`).
 * Health that can't be worked out yet (missing choices) is left undefined, with a note
 * saying what's missing; that's incompleteness, not a rule problem.
 */
import { refsMatch, traitKey, type TraitRef } from '../rules/catalog'
import { archetypesById, healthFormula, healthRanges, personalitiesById, retconsById } from '../rules/data'
import { dieSize, stepDie } from '../rules/dice'
import type { Die, HealthRange, OptionRef, Zone } from '../rules/types'
import type { Hero } from '../hero/model'
import { traitLabel, type HeroTrait } from './traits'
import { warning, type RuleWarning } from './warnings'

/** The hero's status dice: the personality's, with the Red die raised by the status retcon. */
export function statusDice(hero: Hero): Record<Zone, Die> | undefined {
  const personality = hero.personality && personalitiesById.get(hero.personality.id)
  if (!personality) return undefined
  const dice = { ...personality.statusDice }
  const retcon = hero.retcon && retconsById.get(hero.retcon.id)
  if (hero.retcon?.kind === 'upgradeStatusDie' && retcon?.kind === 'upgradeStatusDie') {
    dice[retcon.zone] = stepDie(dice[retcon.zone], retcon.steps, { max: retcon.max })
  }
  return dice
}

/** The traits a hero may use for Health: the formula's list, widened by archetype and personality options. */
export function healthTraitOptions(hero: Hero, traits: readonly HeroTrait[]): HeroTrait[] {
  const term = healthFormula.addMaxOf.find((t) => 'bestOf' in t)
  const refs: OptionRef[] = term && 'bestOf' in term ? [...term.bestOf] : []
  const ar = hero.archetype && archetypesById.get(hero.archetype.id)
  const personality = hero.personality && personalitiesById.get(hero.personality.id)
  refs.push(...(ar?.healthOptions?.extraOptions ?? []), ...(personality?.healthOptions?.extraOptions ?? []))
  const any = ar?.healthOptions?.anyPowerOrQuality || personality?.healthOptions?.anyPowerOrQuality
  return traits.filter((t) => any || refsMatch(refs, t.trait))
}

export interface HealthResult {
  max?: number
  ranges?: HealthRange
  warnings: RuleWarning[]
}

export function computeHealth(hero: Hero, traits: readonly HeroTrait[]): HealthResult {
  const warnings: RuleWarning[] = []
  const note = (code: string, message: string) => warnings.push(warning('health', code, message))
  const dice = statusDice(hero)
  const choice = hero.health
  if (!dice || !choice) return { warnings }

  let total = healthFormula.base
  let complete = true
  for (const term of healthFormula.addMaxOf) {
    if ('statusDie' in term) {
      total += dieSize(dice[term.statusDie])
      continue
    }
    const options = healthTraitOptions(hero, traits)
    if (options.length === 0) {
      if (choice.trait) note('health-trait-not-allowed', `${traitLabel(hero, choice.trait)} can't be used for Health; you have no eligible trait, so use ${term.fallbackDie}.`)
      total += dieSize(term.fallbackDie)
    } else if (!choice.trait) {
      note('health-trait-missing', 'Choose which power or quality adds to your Health.')
      complete = false
    } else {
      const picked = options.find((t) => traitKey(t.trait) === traitKey(choice.trait as TraitRef))
      if (!traits.some((t) => traitKey(t.trait) === traitKey(choice.trait as TraitRef))) {
        note('health-trait-not-held', `Your Health uses ${traitLabel(hero, choice.trait)}, which you don't have.`)
        complete = false
      } else if (!picked) {
        note('health-trait-not-allowed', `${traitLabel(hero, choice.trait)} can't be used for Health.`)
        complete = false
      } else {
        total += dieSize(picked.die)
      }
    }
  }

  const roll = healthFormula.addRoll
  if (choice.mode === 'fixed') {
    total += roll.orFixed
  } else if (choice.rollResult === undefined) {
    note('health-roll-missing', `Roll your ${roll.die} for Health, or take the flat ${roll.orFixed}.`)
    complete = false
  } else if (!Number.isInteger(choice.rollResult) || choice.rollResult < 1 || choice.rollResult > dieSize(roll.die)) {
    note('health-roll-invalid', `A ${roll.die} can't roll ${choice.rollResult}.`)
    complete = false
  } else {
    total += choice.rollResult
  }

  if (!complete) return { warnings }
  const ranges = healthRanges.find((r) => r.max === total)
  if (!ranges) note('health-out-of-range', `Max Health ${total} is outside the Health table.`)
  return { max: total, ranges, warnings }
}
