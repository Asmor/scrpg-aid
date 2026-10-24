/**
 * Divided (p. 94–95) and Modular (p. 96–98) build on a second archetype. The hero's
 * powers, qualities, bonuses, forms, and Health options come from that second archetype
 * (the "trait layer"); the outer archetype adds its own abilities and rules.
 */
import { archetypesById } from '../rules/data'
import type { Archetype } from '../rules/types'
import type { ArchetypeChoice, DividedChoice, Hero } from '../hero/model'
import { warning, type RuleWarning } from './warnings'

export interface ArchetypeLayer {
  choice: ArchetypeChoice
  archetype: Archetype
}

/** The hero's archetype as chosen (Divided, Modular, or any other). */
export function outerLayer(hero: Hero): ArchetypeLayer | undefined {
  const archetype = hero.archetype && archetypesById.get(hero.archetype.id)
  return archetype ? { choice: hero.archetype!, archetype } : undefined
}

/** For Divided and Modular, the second archetype they build on, if it's recorded and known. */
export function secondaryLayer(hero: Hero): ArchetypeLayer | undefined {
  const outer = outerLayer(hero)
  const choice = outer?.archetype.complex ? outer.choice.secondary : undefined
  const archetype = choice && archetypesById.get(choice.id)
  return choice && archetype ? { choice, archetype } : undefined
}

/**
 * The archetype whose powers, qualities, bonuses, forms, and Health options the hero has:
 * the second archetype for Divided and Modular, otherwise the archetype itself.
 */
export function traitLayer(hero: Hero): ArchetypeLayer | undefined {
  const outer = outerLayer(hero)
  return outer?.archetype.complex ? secondaryLayer(hero) : outer
}

/** Every archetype layer the hero has, outer first. */
export function layers(hero: Hero): ArchetypeLayer[] {
  return [outerLayer(hero), secondaryLayer(hero)].filter((l): l is ArchetypeLayer => l !== undefined)
}

/**
 * Divided's own choices, but only when the hero's archetype really is Divided: choices left
 * on another archetype (warned about in ./divided.ts) don't change the hero.
 */
export function dividedChoice(hero: Hero): DividedChoice | undefined {
  return outerLayer(hero)?.archetype.transitionMethods ? hero.archetype?.divided : undefined
}

/** The archetype's name as it goes on the sheet, e.g. "Divided Speedster" (p. 94). */
export function archetypeName(hero: Hero): string | undefined {
  const outer = outerLayer(hero)
  const second = secondaryLayer(hero)
  if (!outer) return undefined
  return second ? `${outer.archetype.name} ${second.archetype.name}` : outer.archetype.name
}

/** Checks the second archetype is chosen, known, and allowed. */
export function checkSecondary(hero: Hero): RuleWarning[] {
  const outer = outerLayer(hero)
  if (!outer) return []
  const choice = outer.choice.secondary
  const spec = outer.archetype.secondaryArchetype
  const warn = (code: string, message: string) => [warning('archetype', code, message)]
  if (!spec) return choice ? warn('unexpected-secondary', `${outer.archetype.name} doesn't build on a second archetype.`) : []
  if (!choice) return warn('secondary-missing', `Choose the archetype ${outer.archetype.name} builds on.`)
  const second = archetypesById.get(choice.id)
  if (!second) return warn('unknown-entry', `Unknown archetype "${choice.id}".`)
  if (spec.exclude.includes(second.id)) return warn('secondary-excluded', `${outer.archetype.name} can't build on ${second.name}.`)
  if (choice.secondary) return warn('unexpected-secondary', `${second.name} can't have its own second archetype.`)
  return []
}
