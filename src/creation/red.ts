/**
 * Checks the hero's Red abilities (step 5), including one gained from a retcon.
 *
 * From data/heroes/red-abilities.json `rules` (p. 106): each Red ability comes from a
 * power or quality category, and the hero must have a power or quality in that category
 * to use with it. An ability that uses no power or quality needs a trait in that category
 * at d6 or higher. Minion-Maker's extra Red options are available whenever that hero picks
 * a Red ability and aren't tied to a category (the user's ruling).
 */
import { getCategory, refsMatch } from '../rules/catalog'
import { redAbilityStep } from '../rules/data'
import { compareDice } from '../rules/dice'
import { parseSlots } from '../rules/slots'
import type { Ability, RedAbilityCategory, TraitKind } from '../rules/types'
import type { AbilityPick, Hero } from '../hero/model'
import { checkAbilityPick, primaryUse } from './abilities'
import { findRedAbility, redCategoryRef } from './lookup'
import type { HeroTrait } from './traits'
import { warning, type RuleWarning, type StepId } from './warnings'

function categoryKind(category: RedAbilityCategory): TraitKind {
  return category.powerCategory ? 'power' : 'quality'
}

function categoryName(category: RedAbilityCategory): string {
  const id = (category.powerCategory ?? category.qualityCategory)!
  return `${getCategory(categoryKind(category), id)?.name ?? id} ${categoryKind(category)}`
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

/** Checks one Red ability pick. Returns the key it was resolved to, for duplicate checks. */
function checkRedPick(hero: Hero, traits: readonly HeroTrait[], pick: AbilityPick, step: StepId, warnings: RuleWarning[]): string | undefined {
  const lookup = findRedAbility(hero, pick)
  if (!lookup.found) {
    warnings.push(
      lookup.reason === 'ambiguous'
        ? warning(step, 'red-category-needed', `${pick.name} appears in more than one Red ability list; choose which one you took it from.`)
        : warning(step, 'unknown-ability', `${pick.name} isn't a Red ability you can choose.`),
    )
    return undefined
  }
  const { ability, category } = lookup
  if (!category) {
    warnings.push(...checkAbilityPick(hero, traits, ability, pick, step))
    return ability.name
  }
  const what = `${article(categoryName(category))} ${categoryName(category)}`
  warnings.push(...checkAbilityPick(hero, traits, ability, pick, step, { kind: categoryKind(category), refs: [redCategoryRef(category)], what }))
  if (!usesATrait(ability, pick)) {
    // An ability that uses nothing needs a trait in its category at d6 or higher.
    const ok = traits.some((t) => refsMatch([redCategoryRef(category)], t.trait) && compareDice(t.die, 'd6') >= 0)
    if (!ok) warnings.push(warning(step, 'red-category-missing', `To take ${ability.name}, you need ${what} at d6 or higher.`))
  }
  // The user ruled that two Red abilities can't share a name, even from different lists;
  // only the name in the data counts, not the player's own name for it.
  return ability.name
}

/** Whether an ability uses a power or quality (through a slot, or a named trait). */
function usesATrait(ability: Ability, pick: AbilityPick): boolean {
  return parseSlots(ability.text).some((s) => s.type === 'trait') || primaryUse(ability, pick) !== undefined
}

/** Checks the Red abilities step and a Red ability gained from a retcon. */
export function checkRedAbilities(hero: Hero, traits: readonly HeroTrait[]): RuleWarning[] {
  const warnings: RuleWarning[] = []
  const seen = new Set<string>()
  const note = (key: string | undefined, step: StepId, name: string) => {
    if (!key) return
    if (seen.has(key)) warnings.push(warning(step, 'ability-twice', `You already have a Red ability called ${name}; choose a different one.`))
    seen.add(key)
  }
  for (const pick of hero.redAbilities) note(checkRedPick(hero, traits, pick, 'redAbilities', warnings), 'redAbilities', pick.name)
  // Red abilities are step 5, so the count is checked once the hero has reached it (has a
  // personality), or as soon as there are too many.
  if ((hero.personality || hero.redAbilities.length > redAbilityStep.count) && hero.redAbilities.length !== redAbilityStep.count) {
    warnings.push(warning('redAbilities', 'ability-count', `Choose ${redAbilityStep.count} Red abilities; you have ${hero.redAbilities.length}.`))
  }
  if (hero.retcon?.kind === 'gainRedAbility') {
    note(checkRedPick(hero, traits, hero.retcon.ability, 'retcon', warnings), 'retcon', hero.retcon.ability.name)
  }
  for (const pick of hero.redAbilities.filter((p) => p.source !== 'red')) {
    warnings.push(warning('redAbilities', 'unknown-ability', `${pick.name} isn't recorded as a Red ability.`))
  }
  return warnings
}
