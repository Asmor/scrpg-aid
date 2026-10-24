/** Finds the rules entry behind an ability a hero took. */
import { archetypesById, personalitiesById, powerSourcesById, redAbilityCategories } from '../rules/data'
import type { Ability, Archetype, OptionRef, RedAbilityCategory } from '../rules/types'
import type { AbilityPick, Hero, PersonalityChoice } from '../hero/model'
import { dividedChoice, layers } from './layers'

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

/**
 * Minion-Maker's extra Red options, if the hero's archetype (or the one a Divided or
 * Modular hero builds on) has them; the user ruled they're always available to it.
 */
export function extraRedOptions(hero: Hero): readonly Ability[] {
  return layers(hero).flatMap((l) => l.archetype.extraRedAbilityOptions ?? [])
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

/**
 * Every ability a power source or archetype offers for a given pick source. Archetype
 * sources are relative to `ar` (default: the hero's archetype), so a Divided hero's second
 * archetype's abilities are looked up by passing that archetype.
 */
function optionsFor(hero: Hero, pick: AbilityPick, archetype?: Archetype): readonly Ability[] {
  const ps = hero.powerSource && powerSourcesById.get(hero.powerSource.id)
  const ar = archetype ?? (hero.archetype ? archetypesById.get(hero.archetype.id) : undefined)
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
    case 'archetype.transition':
      return (ar?.transitionMethods ?? []).flatMap((m) => m.greenAbilities.options ?? [])
    default:
      return []
  }
}

/** The Out ability as a pick, carrying the personality's Out choices, or undefined before a personality is chosen. */
export function outPick(hero: Hero): AbilityPick | undefined {
  const choice = outPersonality(hero)
  if (!choice || !personalitiesById.has(choice.id)) return undefined
  return { source: 'out', name: OUT_ABILITY_NAME, uses: choice.outUses, blanks: choice.outBlanks }
}

/**
 * The personality whose Out ability the hero uses: a Divided hero with two personalities
 * picks one (the user's ruling); otherwise it's the hero's personality.
 */
export function outPersonality(hero: Hero): PersonalityChoice | null | undefined {
  const divided = dividedChoice(hero)
  return divided?.heroicPersonality && divided.outFrom === 'heroic' ? divided.heroicPersonality : hero.personality
}

export const OUT_ABILITY_NAME = 'Out ability'

/**
 * The rules entry for any ability the hero took, or undefined if it can't be found.
 * Pass `archetype` for picks recorded on a Divided hero's second archetype.
 */
export function findAbility(hero: Hero, pick: AbilityPick, archetype?: Archetype): Ability | undefined {
  if (pick.source === 'out') {
    const choice = outPersonality(hero)
    const personality = choice && personalitiesById.get(choice.id)
    return personality ? { name: OUT_ABILITY_NAME, type: 'A', text: personality.outAbility } : undefined
  }
  if (pick.source === 'red' || pick.source === 'retcon') {
    const red = findRedAbility(hero, pick)
    return red.found ? red.ability : undefined
  }
  return optionsFor(hero, pick, archetype).find((a) => a.name === pick.name)
}

/** A recorded ability pick, with the archetype its source is relative to (for archetype picks). */
export interface PlacedPick {
  pick: AbilityPick
  archetype?: Archetype
}

/**
 * Every ability pick the hero recorded for their power source, archetype(s), and Red
 * abilities (not the Out ability, forms, or retcons): Divided's transition ability and its
 * second archetype's abilities included, Modular's skipped second-archetype abilities not.
 */
export function recordedPicks(hero: Hero): PlacedPick[] {
  const [outer, second] = layers(hero)
  const result: PlacedPick[] = (hero.powerSource?.abilities ?? []).map((pick) => ({ pick }))
  if (outer) {
    result.push(...outer.choice.abilities.map((pick) => ({ pick, archetype: outer.archetype })))
    const transition = outer.choice.divided?.transitionAbility
    if (transition) result.push({ pick: transition, archetype: outer.archetype })
  }
  if (second && !outer?.archetype.secondaryArchetype?.skipAbilities) {
    result.push(...second.choice.abilities.map((pick) => ({ pick, archetype: second.archetype })))
  }
  result.push(...hero.redAbilities.map((pick) => ({ pick })))
  return result
}
