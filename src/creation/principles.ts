/**
 * Checks the hero's two principles: one from the background step and one from the
 * archetype step, each from that entry's principle category. A retcon may replace
 * either with any principle (data/heroes/retcons.json).
 */
import { archetypesById, backgroundsById, principleCategories, principlesById } from '../rules/data'
import type { PrincipleCategoryId } from '../rules/types'
import type { Hero, PrincipleChoice } from '../hero/model'
import { warning, type RuleWarning, type StepId } from './warnings'

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
  const principle = principlesById.get(choice.id)
  if (!principle) {
    warnings.push(warning(step, 'unknown-entry', `Unknown principle "${choice.id}".`))
    return
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
  const ar = hero.archetype && archetypesById.get(hero.archetype.id)
  if (ar) {
    // Modular takes its principle from the archetype it modularizes; that isn't modelled yet.
    const category = ar.principleCategory === 'fromSecondaryArchetype' ? undefined : ar.principleCategory
    if (hero.archetype!.principle) checkChoice(hero.archetype!.principle, category, 'archetype', warnings)
    else if (category) warnings.push(warning('archetype', 'principle-missing', `Choose a principle of ${categoryName(category)}.`))
  }
  if (hero.retcon?.kind === 'changePrinciple') {
    // The retcon allows any principle, from any category, but it has to be a different one.
    checkChoice(hero.retcon.with, undefined, 'retcon', warnings)
    const replaced = hero.retcon.replace === 'background' ? hero.background?.principle : hero.archetype?.principle
    if (replaced?.id === hero.retcon.with.id) {
      warnings.push(warning('retcon', 'retcon-no-change', 'This retcon should replace a principle with a different one.'))
    }
  }
  return warnings
}
