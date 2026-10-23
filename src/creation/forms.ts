/**
 * Form-Changer forms and Minion-Maker minion forms (data/heroes/archetypes.json; see the
 * user's rulings in data/README.md).
 *
 * Form-Changer (p. 90–91): two Green forms and one Yellow form. Each form rearranges the
 * hero's power dice (the same set of dice) across the hero's powers or powers from the
 * archetype's lists. Each Green form takes a different Green form ability; the Yellow form
 * raises two different dice (powers or qualities) one size and takes a Yellow form ability
 * or a Green form ability neither Green form used. A form's ability uses that form's dice.
 *
 * Minion-Maker (p. 88): choose as many minion forms as the max value of a quality the
 * player picks.
 */
import { getTrait, refsMatch, traitKey, type TraitRef } from '../rules/catalog'
import { archetypesById } from '../rules/data'
import { compareDice, dieSize, sortDice, stepDie } from '../rules/dice'
import type { Ability, Archetype, Die } from '../rules/types'
import type { FormChoice, Hero } from '../hero/model'
import { checkAbilityPick } from './abilities'
import { traitLabel, type HeroTrait } from './traits'
import { warning, type RuleWarning } from './warnings'

export interface FormTraits {
  form: FormChoice
  /** The form's powers and dice, plus the hero's qualities (with any Yellow upgrades applied). */
  traits: HeroTrait[]
}

const same = (a: readonly Die[], b: readonly Die[]) => sortDice(a).join() === sortDice(b).join()

/** The traits a hero has while in a form. */
export function formTraits(hero: Hero, traits: readonly HeroTrait[], form: FormChoice): HeroTrait[] {
  const result: HeroTrait[] = [
    ...form.powers.map((a) => ({ trait: a.trait, die: a.die, step: 'archetype' as const, name: traitLabel(hero, a.trait) })),
    ...traits.filter((t) => t.trait.kind === 'quality'),
  ]
  for (const up of form.zone === 'yellow' ? (form.upgrades ?? []) : []) {
    const index = result.findIndex((t) => traitKey(t.trait) === traitKey(up))
    if (index >= 0) result[index] = { ...result[index]!, die: stepDie(result[index]!.die, 1) }
  }
  return result
}

/** A form's name: the player's, or "Green form 1" / "Yellow form 1", numbered within its zone. */
export function formLabel(forms: readonly FormChoice[], form: FormChoice): string {
  const number = forms.filter((f) => f.zone === form.zone).indexOf(form) + 1
  return form.name?.trim() || `${form.zone === 'green' ? 'Green' : 'Yellow'} form ${number}`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function checkFormChanger(hero: Hero, traits: readonly HeroTrait[], ar: Archetype, warnings: RuleWarning[]): void {
  const spec = ar.forms!
  const forms = hero.archetype!.forms ?? []
  const warn = (code: string, message: string) => warnings.push(warning('archetype', code, message))
  const green = forms.filter((f) => f.zone === 'green')
  const yellow = forms.filter((f) => f.zone === 'yellow')
  if (green.length !== spec.greenFormCount) warn('form-count', `Create ${plural(spec.greenFormCount, 'Green form')}; you have ${green.length}.`)
  if (yellow.length !== spec.yellowFormCount) warn('form-count', `Create ${plural(spec.yellowFormCount, 'Yellow form')}; you have ${yellow.length}.`)

  const basePowers = traits.filter((t) => t.trait.kind === 'power')
  const baseDice = basePowers.map((t) => t.die)
  const archetypeList = [...(ar.powers?.options ?? []), ...(ar.required?.options ?? [])]
  const greenAbilityNames = green.flatMap((f) => (f.ability ? [f.ability.name] : []))

  forms.forEach((form) => {
    const label = formLabel(forms, form)
    // Dice: the hero's power dice, rearranged.
    if (!same(form.powers.map((a) => a.die), baseDice)) {
      warn('form-dice', `${label} must use your power dice (${sortDice(baseDice).reverse().join(', ')}), rearranged.`)
    }
    const seen = new Set<string>()
    for (const a of form.powers) {
      const key = traitKey(a.trait)
      if (seen.has(key)) warn('assigned-twice', `${label} gives ${traitLabel(hero, a.trait)} more than one die.`)
      seen.add(key)
      const held = basePowers.some((t) => traitKey(t.trait) === key)
      if (a.trait.kind !== 'power' || !getTrait(a.trait)) {
        warn('form-not-power', `${label} rearranges powers; ${traitLabel(hero, a.trait)} isn't a power.`)
      } else if (!held && !refsMatch(archetypeList, a.trait)) {
        warn('not-on-list', `${label} can only use your powers or powers from the ${ar.name} lists; ${traitLabel(hero, a.trait)} isn't one.`)
      }
    }

    // Yellow form upgrades: two different dice, powers or qualities, each one size.
    const traitsInForm = formTraits(hero, traits, { ...form, upgrades: [] })
    if (form.zone === 'yellow') {
      const ups = form.upgrades ?? []
      if (ups.length !== spec.yellowFormUpgrades || new Set(ups.map(traitKey)).size !== ups.length) {
        warn('form-upgrades', `${label} raises ${spec.yellowFormUpgrades} different dice one size each.`)
      }
      for (const up of ups) {
        const t = traitsInForm.find((x) => traitKey(x.trait) === traitKey(up))
        if (!t) warn('form-upgrades', `${label} can't raise ${traitLabel(hero, up)}: it isn't one of that form's powers or your qualities.`)
        else if (compareDice(t.die, 'd12') >= 0) warn('already-max', `${traitLabel(hero, up)} is already d12 in ${label}; raise a different die.`)
      }
    } else if (form.upgrades?.length) {
      warn('form-upgrades', `Only the Yellow form raises dice; ${label} is a Green form.`)
    }

    // The form's ability.
    if (!form.ability) {
      warn('form-ability-missing', `Choose ${label}'s form ability.`)
      return
    }
    const options: readonly Ability[] =
      form.zone === 'green'
        ? spec.greenFormAbilities
        : [...spec.yellowFormAbilities, ...spec.greenFormAbilities.filter((a) => !greenAbilityNames.includes(a.name))]
    if (form.ability.source !== 'archetype.form') {
      warn('unknown-ability', `${label}'s ability should be recorded as a form ability.`)
    }
    const ability = options.find((a) => a.name === form.ability!.name)
    if (!ability) {
      warn('unknown-ability', `${form.ability.name} isn't a form ability ${label} can take.`)
      return
    }
    if (form.zone === 'green' && greenAbilityNames.filter((n) => n === ability.name).length > 1) {
      warn('ability-twice', `Each Green form needs a different form ability; ${ability.name} is used twice.`)
    }
    warnings.push(...checkAbilityPick(hero, formTraits(hero, traits, form), ability, form.ability, 'archetype'))
  })
}

function checkMinionForms(hero: Hero, traits: readonly HeroTrait[], ar: Archetype, warnings: RuleWarning[]): void {
  const spec = ar.minionForms!
  const choice = hero.archetype!.minionForms
  const warn = (code: string, message: string) => warnings.push(warning('archetype', code, message))
  if (!choice?.quality) {
    warn('minion-forms-quality', 'Choose the quality that sets how many minion forms you have.')
    return
  }
  const quality = traits.find((t) => traitKey(t.trait) === traitKey(choice.quality as TraitRef))
  if (!quality || quality.trait.kind !== 'quality') {
    warn('minion-forms-quality', `Your minion forms use ${traitLabel(hero, choice.quality)}, which isn't one of your qualities.`)
    return
  }
  const count = dieSize(quality.die)
  if (choice.forms.length !== count) {
    warn('minion-forms-count', `Choose ${count} minion forms (your ${quality.name} is ${quality.die}); you have ${choice.forms.length}.`)
  }
  const seen = new Set<string>()
  for (const name of choice.forms) {
    if (!spec.forms.some((f) => f.name === name)) warn('unknown-minion-form', `${name} isn't a minion form.`)
    if (seen.has(name)) warn('minion-form-twice', `You chose the ${name} minion form more than once.`)
    seen.add(name)
  }
}

/** Checks Form-Changer forms and Minion-Maker minion forms. */
export function checkForms(hero: Hero, traits: readonly HeroTrait[]): RuleWarning[] {
  const warnings: RuleWarning[] = []
  const ar = hero.archetype && archetypesById.get(hero.archetype.id)
  if (!ar) return warnings
  if (ar.forms) checkFormChanger(hero, traits, ar, warnings)
  else if (hero.archetype!.forms?.length) warnings.push(warning('archetype', 'unexpected-forms', `${ar.name} doesn't have forms.`))
  if (ar.minionForms) checkMinionForms(hero, traits, ar, warnings)
  else if (hero.archetype!.minionForms) warnings.push(warning('archetype', 'unexpected-forms', `${ar.name} doesn't have minion forms.`))
  return warnings
}
