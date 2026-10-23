/**
 * Typed access to the hero rules data in data/heroes/.
 *
 * JSON imports are inferred with widened fields (`string` instead of `'d8'`, etc.).
 * `typed` checks each import's *structure* against its declared type at compile
 * time (field names, required vs optional, nesting) and only casts away that
 * widening. Enumerated values (dice, kinds, zones) are checked by
 * scripts/validate_data.py and data.test.ts.
 */
import archetypesJson from '../../data/heroes/archetypes.json'
import backgroundsJson from '../../data/heroes/backgrounds.json'
import healthJson from '../../data/heroes/health.json'
import personalitiesJson from '../../data/heroes/personalities.json'
import powerSourcesJson from '../../data/heroes/power-sources.json'
import powersQualitiesJson from '../../data/heroes/powers-qualities.json'
import principlesJson from '../../data/heroes/principles.json'
import redAbilitiesJson from '../../data/heroes/red-abilities.json'
import retconsJson from '../../data/heroes/retcons.json'
import type {
  Archetype,
  Background,
  Die,
  HealthFormula,
  HealthRange,
  PageRef,
  Personality,
  PowerCategory,
  PowerSource,
  Principle,
  PrincipleCategory,
  QualityCategory,
  RedAbilityCategory,
  Retcon,
} from './types'

/** T with every literal type widened, which is how TypeScript infers a JSON import. */
type Loose<X> = X extends string
  ? string
  : X extends boolean
    ? boolean
    : X extends number
      ? number
      : X extends readonly (infer E)[]
        ? Loose<E>[]
        : X extends object
          ? { [K in keyof X]: Loose<X[K]> }
          : X

/** Narrows an inferred JSON value to its declared type (see the module comment). */
function typed<T>(value: Loose<T>): T {
  return value as T
}

/** Shared fields of each creation step's file: where it is in the book and its chart page. */
export interface StepInfo extends PageRef {
  step: number
  chartPage?: number
}

function stepInfo(json: { step: number; book: string; page: number; chartPage?: number }): StepInfo {
  return { step: json.step, book: json.book, page: json.page, chartPage: json.chartPage }
}

export const powerCategories = typed<PowerCategory[]>(powersQualitiesJson.powerCategories)
export const qualityCategories = typed<QualityCategory[]>(powersQualitiesJson.qualityCategories)

export const backgrounds = typed<Background[]>(backgroundsJson.backgrounds)
export const backgroundStep = {
  ...stepInfo(backgroundsJson),
  startingDice: typed<Die[]>(backgroundsJson.startingDice),
}

export const powerSources = typed<PowerSource[]>(powerSourcesJson.powerSources)
export const powerSourceStep = stepInfo(powerSourcesJson)

export const archetypes = typed<Archetype[]>(archetypesJson.archetypes)
export const archetypeStep = { ...stepInfo(archetypesJson), notes: archetypesJson.notes }

export const personalities = typed<Personality[]>(personalitiesJson.personalities)
export const personalityStep = {
  ...stepInfo(personalitiesJson),
  roleplayingQuality: typed<PageRef & { die: Die; summary: string }>(personalitiesJson.commonGrants.roleplayingQuality),
  redAbilities: typed<PageRef & { count: number; summary: string }>(personalitiesJson.commonGrants.redAbilities),
}

export const redAbilityCategories = typed<RedAbilityCategory[]>(redAbilitiesJson.categories)
export const redAbilityStep = { ...stepInfo(redAbilitiesJson), count: redAbilitiesJson.count, rules: redAbilitiesJson.rules }

export const retcons = typed<Retcon[]>(retconsJson.retcons)
export const retconStep = { ...stepInfo(retconsJson), count: retconsJson.count }

export const healthFormula = typed<HealthFormula>(healthJson.formula)
export const healthRanges = typed<HealthRange[]>(healthJson.ranges)
export const healthStep = stepInfo(healthJson)

export const principleCategories = typed<PrincipleCategory[]>(principlesJson.categories)
export const principles = typed<Principle[]>(principlesJson.principles)
export const principleStep = {
  book: principlesJson.book,
  page: principlesJson.page,
  chartPage: principlesJson.chartPage,
  count: principlesJson.count,
}

function indexById<T extends { id: string }>(items: readonly T[]): ReadonlyMap<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

export const backgroundsById = indexById(backgrounds)
export const powerSourcesById = indexById(powerSources)
export const archetypesById = indexById(archetypes)
export const personalitiesById = indexById(personalities)
export const principlesById = indexById(principles)
export const retconsById = indexById(retcons)
