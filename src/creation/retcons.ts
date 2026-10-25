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
import { parseSlots } from '../rules/slots'
import type { Ability, Retcon } from '../rules/types'
import type { AbilityPick, Hero } from '../hero/model'
import { outTraits } from './divided'
import { formLabel, formTraits } from './forms'
import { findAbility, outPick, recordedPicks } from './lookup'
import { findMode, modeTraits } from './modular'
import type { HeroTrait } from './traits'
import { baseStatusDice, statusRetconForm } from './health'
import { dividedChoice, traitLayer } from './layers'
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

/** An ability the "change which power or quality an ability uses" retcon can point at. */
export interface RetconTarget {
  pick: AbilityPick
  ability: Ability
  /** The player's name for it, or its name, plus where it's from when that helps. */
  label: string
  /** The powers and qualities it may use: the Out ability's form's, a form's, or a mode's, otherwise the hero's. */
  traits: readonly HeroTrait[]
}

/**
 * The abilities the ability-trait retcon can target: the hero's power source, archetype, and
 * Red abilities, the Out ability, and Form-Changer form and Modular mode abilities (the
 * user's rulings). Only abilities that use a power or quality through a slot are listed,
 * since there's nothing else to change. `traits` are the hero's traits before the retcon.
 */
export function abilityRetconTargets(hero: Hero, traits: readonly HeroTrait[]): RetconTarget[] {
  const targets: RetconTarget[] = []
  const add = (pick: AbilityPick | undefined, ability: Ability | undefined, usable: readonly HeroTrait[], where?: string) => {
    if (!pick || !ability || !parseSlots(ability.text).some((s) => s.type === 'trait')) return
    const name = pick.customName?.trim() || ability.name
    targets.push({ pick, ability, label: where ? `${name} (${where})` : name, traits: usable })
  }
  for (const { pick, archetype } of recordedPicks(hero)) add(pick, findAbility(hero, pick, archetype), traits)
  const out = outPick(hero)
  if (out) add(out, findAbility(hero, out), outTraits(hero, traits))
  const layer = traitLayer(hero)
  const spec = layer?.archetype.forms
  for (const form of layer?.choice.forms ?? []) {
    const ability = form.ability && [...(spec?.greenFormAbilities ?? []), ...(spec?.yellowFormAbilities ?? [])].find((a) => a.name === form.ability!.name)
    add(form.ability, ability, formTraits(hero, traits, form), formLabel(layer!.choice.forms!, form))
  }
  for (const mode of hero.archetype?.modular?.modes ?? []) {
    const entry = findMode(hero, mode.id)?.mode
    add(mode.ability, entry && mode.ability?.name === entry.ability.name ? entry.ability : undefined, modeTraits(hero, traits, mode.powers), mode.name?.trim() || entry?.name)
  }
  return targets
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
