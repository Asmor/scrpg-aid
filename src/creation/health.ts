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
import { healthFormula, healthRanges, personalitiesById, retconsById } from '../rules/data'
import { dieSize, stepDie } from '../rules/dice'
import type { Die, HealthRange, OptionRef, Personality, Zone } from '../rules/types'
import type { Hero } from '../hero/model'
import { traitsInAnyForm } from './divided'
import { dividedChoice, layers } from './layers'
import { traitLabel, type HeroTrait } from './traits'
import { warning, type RuleWarning } from './warnings'

/**
 * The form whose status die the status retcon raises. With two personalities the player
 * picks one (the user's ruling), and it's undefined until they do; otherwise the hero has
 * one set of status dice, recorded as the civilian form's.
 */
export function statusRetconForm(hero: Hero): 'civilian' | 'heroic' | undefined {
  if (hero.retcon?.kind !== 'upgradeStatusDie') return undefined
  return dividedChoice(hero)?.heroicPersonality ? hero.retcon.form : 'civilian'
}

/** A form's status dice before any retcon. */
export function baseStatusDice(hero: Hero, form: 'civilian' | 'heroic' = 'civilian'): Record<Zone, Die> | undefined {
  const choice = form === 'heroic' ? dividedChoice(hero)?.heroicPersonality : hero.personality
  const personality = choice && personalitiesById.get(choice.id)
  return personality ? { ...personality.statusDice } : undefined
}

/**
 * The hero's status dice: the personality's, with the status retcon applied. A Divided hero
 * with a second personality has separate dice for the heroic form (pass 'heroic').
 */
export function statusDice(hero: Hero, form: 'civilian' | 'heroic' = 'civilian'): Record<Zone, Die> | undefined {
  const dice = baseStatusDice(hero, form)
  if (!dice) return undefined
  const retcon = hero.retcon && retconsById.get(hero.retcon.id)
  if (retcon?.kind === 'upgradeStatusDie' && statusRetconForm(hero) === form) {
    dice[retcon.zone] = stepDie(dice[retcon.zone], retcon.steps, { max: retcon.max })
  }
  return dice
}

/** The hero's personalities: one, or two for a Divided hero with a heroic-form personality. */
export function personalitiesOf(hero: Hero): Personality[] {
  const choices = [hero.personality, dividedChoice(hero)?.heroicPersonality]
  return choices.flatMap((c) => (c && personalitiesById.get(c.id)) || [])
}

/**
 * The traits a hero may use for Health: the formula's list, widened by archetype and
 * personality options. Pass every trait the hero has in any form (traitsInAnyForm).
 */
export function healthTraitOptions(hero: Hero, traits: readonly HeroTrait[]): HeroTrait[] {
  const term = healthFormula.addMaxOf.find((t) => 'bestOf' in t)
  const refs: OptionRef[] = term && 'bestOf' in term ? [...term.bestOf] : []
  // Options from every archetype layer (Modular keeps its base archetype's, the user's ruling)
  // and every personality (a Divided hero may have two).
  const sources = [
    ...layers(hero).map((l) => l.archetype.healthOptions),
    ...personalitiesOf(hero).map((p) => p.healthOptions),
  ]
  for (const options of sources) refs.push(...(options?.extraOptions ?? []))
  const any = sources.some((options) => options?.anyPowerOrQuality)
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
  // A Divided hero with two personalities may use a power or quality from either form (the user's ruling).
  const pool = traitsInAnyForm(hero, traits)

  let total = healthFormula.base
  let complete = true
  for (const term of healthFormula.addMaxOf) {
    if ('statusDie' in term) {
      // A Divided hero with two personalities uses the larger of the two dice (the user's ruling).
      const heroic = statusDice(hero, 'heroic')
      total += Math.max(dieSize(dice[term.statusDie]), heroic ? dieSize(heroic[term.statusDie]) : 0)
      continue
    }
    const options = healthTraitOptions(hero, pool)
    if (options.length === 0) {
      if (choice.trait) note('health-trait-not-allowed', `${traitLabel(hero, choice.trait)} can't be used for Health; you have no eligible trait, so use ${term.fallbackDie}.`)
      total += dieSize(term.fallbackDie)
    } else if (!choice.trait) {
      note('health-trait-missing', 'Choose which power or quality adds to your Health.')
      complete = false
    } else {
      const picked = options.find((t) => traitKey(t.trait) === traitKey(choice.trait as TraitRef))
      if (!pool.some((t) => traitKey(t.trait) === traitKey(choice.trait as TraitRef))) {
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
