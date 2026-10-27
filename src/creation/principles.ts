/**
 * Checks the hero's two principles: one from the background step and one from the
 * archetype step, each from that entry's principle category. A retcon may replace
 * either with any principle (data/heroes/retcons.json). Either may be one the player made
 * (p. 141), which needs the GM's approval; the app only checks that it's filled in.
 */
import { backgroundsById, principleCategories, principlesById } from '../rules/data'
import { outerLayer, secondaryLayer } from './layers'
import type { EntryRef, Principle, PrincipleCategoryId } from '../rules/types'
import { CUSTOM_PRINCIPLE_ID, type Hero, type PrincipleChoice } from '../hero/model'
import { warning, type RuleWarning, type StepId } from './warnings'

/** A principle as the sheet and checks use it: from the data, or one the player made (which has no page). */
export type PrincipleEntry = Omit<Principle, keyof EntryRef> & Partial<EntryRef>

/** The principle a choice names: the data's, or the player's own. */
export function principleOf(choice: PrincipleChoice): PrincipleEntry | undefined {
  if (choice.id !== CUSTOM_PRINCIPLE_ID) return principlesById.get(choice.id)
  const custom = choice.custom
  if (!custom) return undefined
  const name = custom.name.trim() || 'Custom principle'
  return {
    id: CUSTOM_PRINCIPLE_ID,
    name,
    category: custom.category,
    roleplaying: custom.roleplaying,
    minorTwist: custom.minorTwist,
    majorTwist: custom.majorTwist,
    greenAbility: { name: custom.greenAbility.name.trim() || name, type: 'A', text: custom.greenAbility.text, ...(custom.greenAbility.effects ? { effects: custom.greenAbility.effects } : {}) },
  }
}

export interface HeroPrinciples {
  background?: PrincipleChoice
  archetype?: PrincipleChoice
}

/** The hero's principles after any retcon. */
export function heroPrinciples(hero: Hero): HeroPrinciples {
  const result: HeroPrinciples = { background: hero.background?.principle, archetype: hero.archetype?.principle }
  if (hero.retcon?.kind === 'changePrinciple') result[hero.retcon.replace] = hero.retcon.with
  return result
}

function categoryName(id: PrincipleCategoryId): string {
  return principleCategories.find((c) => c.id === id)?.name ?? id
}

/** Checks one principle choice: it exists, fits the category (if one applies), and has its blank filled. */
function checkChoice(choice: PrincipleChoice, category: PrincipleCategoryId | undefined, step: StepId, warnings: RuleWarning[]): void {
  const principle = principleOf(choice)
  if (!principle) {
    warnings.push(warning(step, 'unknown-entry', choice.id === CUSTOM_PRINCIPLE_ID ? 'Write your custom principle.' : `Unknown principle "${choice.id}".`))
    return
  }
  const custom = choice.id === CUSTOM_PRINCIPLE_ID ? choice.custom : undefined
  if (custom) {
    const missing = [
      !custom.name.trim() && 'its name',
      !custom.roleplaying.trim() && 'what it means during roleplaying',
      !custom.minorTwist.trim() && 'a minor twist question',
      !custom.majorTwist.trim() && 'a major twist question',
      !custom.greenAbility.text.trim() && 'its Green ability',
    ].filter((x): x is string => Boolean(x))
    if (missing.length) {
      const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}` : missing[0]
      warnings.push(warning(step, 'principle-custom-incomplete', `Fill in your custom principle: ${list}.`))
    }
  }
  if (category && principle.category !== category) {
    warnings.push(
      warning(step, 'principle-category', `This step's principle comes from ${categoryName(category)}, but ${principle.name} is ${categoryName(principle.category)}.`),
    )
  }
  if (principle.customization && !choice.customization?.trim()) {
    warnings.push(warning(step, 'principle-blank', `Fill in [${principle.customization}] for ${principle.name}.`))
  }
}

export function checkPrinciples(hero: Hero): RuleWarning[] {
  const warnings: RuleWarning[] = []
  const bg = hero.background && backgroundsById.get(hero.background.id)
  if (bg) {
    if (hero.background!.principle) checkChoice(hero.background!.principle, bg.principleCategory, 'background', warnings)
    else warnings.push(warning('background', 'principle-missing', `Choose a principle of ${categoryName(bg.principleCategory)}.`))
  }
  const outer = outerLayer(hero)
  if (outer) {
    // Modular takes its principle category from the archetype it builds on; Divided takes a
    // Responsibility principle in place of that archetype's (both recorded on the outer choice).
    const second = secondaryLayer(hero)
    const fromSecond = second?.archetype.principleCategory
    const category =
      outer.archetype.principleCategory === 'fromSecondaryArchetype'
        ? fromSecond === 'fromSecondaryArchetype'
          ? undefined
          : fromSecond
        : outer.archetype.principleCategory
    if (outer.choice.principle) checkChoice(outer.choice.principle, category, 'archetype', warnings)
    else if (category) warnings.push(warning('archetype', 'principle-missing', `Choose a principle of ${categoryName(category)}.`))
    if (second?.choice.principle) {
      warnings.push(warning('archetype', 'secondary-principle', `Record your archetype principle on ${outer.archetype.name}, not ${second.archetype.name}.`))
    }
  }
  if (hero.retcon?.kind === 'changePrinciple') {
    // The retcon allows any principle, from any category, but it has to be a different one.
    checkChoice(hero.retcon.with, undefined, 'retcon', warnings)
    const replaced = hero.retcon.replace === 'background' ? hero.background?.principle : hero.archetype?.principle
    // Custom principles all share one id, so compare what they say.
    const same = replaced?.id === hero.retcon.with.id && (replaced.id !== CUSTOM_PRINCIPLE_ID || JSON.stringify(replaced.custom) === JSON.stringify(hero.retcon.with.custom))
    if (same) {
      warnings.push(warning('retcon', 'retcon-no-change', 'This retcon should replace a principle with a different one.'))
    }
  }
  return warnings
}
