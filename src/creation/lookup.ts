/** Finds the rules entry behind an ability a hero took. */
import { archetypesById, powerSourcesById, redAbilityCategories } from '../rules/data'
import type { Ability, OptionRef, RedAbilityCategory } from '../rules/types'
import type { AbilityPick, Hero } from '../hero/model'

/** A Red ability category's key, as stored in AbilityPick.category: "power:athletic" or "quality:mental". */
export function redCategoryKey(category: RedAbilityCategory): string {
  return category.powerCategory ? `power:${category.powerCategory}` : `quality:${category.qualityCategory}`
}

/** The category as an option reference, e.g. { powerCategory: 'athletic' }. */
export function redCategoryRef(category: RedAbilityCategory): OptionRef {
  return category.powerCategory ? { powerCategory: category.powerCategory } : { qualityCategory: category.qualityCategory! }
}

export type RedLookup =
  | { found: true; ability: Ability; category: RedAbilityCategory }
  /** One of Minion-Maker's extra Red options, which belong to no category. */
  | { found: true; ability: Ability; category: undefined }
  | { found: false; reason: 'unknown' | 'ambiguous' }

/** Minion-Maker's extra Red options, if the hero's archetype has them (the user's ruling: always available to it). */
export function extraRedOptions(hero: Hero): readonly Ability[] {
  const ar = hero.archetype && archetypesById.get(hero.archetype.id)
  return ar?.extraRedAbilityOptions ?? []
}

/**
 * Finds a Red ability by name and (if recorded) category. Names repeat across
 * categories, so a pick without a category is ambiguous unless the name is unique.
 */
export function findRedAbility(hero: Hero, pick: AbilityPick): RedLookup {
  if (pick.category) {
    const category = redAbilityCategories.find((c) => redCategoryKey(c) === pick.category)
    const ability = category?.abilities.find((a) => a.name === pick.name)
    return category && ability ? { found: true, ability, category } : { found: false, reason: 'unknown' }
  }
  const extra = extraRedOptions(hero).find((a) => a.name === pick.name)
  if (extra) return { found: true, ability: extra, category: undefined }
  const matches = redAbilityCategories.filter((c) => c.abilities.some((a) => a.name === pick.name))
  if (matches.length > 1) return { found: false, reason: 'ambiguous' }
  const category = matches[0]
  return category
    ? { found: true, ability: category.abilities.find((a) => a.name === pick.name)!, category }
    : { found: false, reason: 'unknown' }
}

/** Every ability a power source or archetype offers for a given pick source. */
function optionsFor(hero: Hero, pick: AbilityPick): readonly Ability[] {
  const ps = hero.powerSource && powerSourcesById.get(hero.powerSource.id)
  const ar = hero.archetype && archetypesById.get(hero.archetype.id)
  switch (pick.source) {
    case 'powerSource.green':
      return ps?.greenAbilities?.options ?? []
    case 'powerSource.yellow':
      return ps?.yellowAbilities.options ?? []
    case 'archetype.fixedGreen':
      return ar?.fixedGreenAbilities ?? []
    case 'archetype.green':
      return ar?.greenAbilities?.options ?? []
    case 'archetype.fixedYellow':
      return ar?.fixedYellowAbilities ?? []
    case 'archetype.yellow':
      return ar?.yellowAbilities?.fromGreenList ? (ar.greenAbilities?.options ?? []) : (ar?.yellowAbilities?.options ?? [])
    case 'archetype.fixedRed':
      return ar?.fixedRedAbilities ?? []
    default:
      return []
  }
}

/** The rules entry for any ability the hero took, or undefined if it can't be found. */
export function findAbility(hero: Hero, pick: AbilityPick): Ability | undefined {
  if (pick.source === 'red' || pick.source === 'retcon') {
    const red = findRedAbility(hero, pick)
    return red.found ? red.ability : undefined
  }
  return optionsFor(hero, pick).find((a) => a.name === pick.name)
}
