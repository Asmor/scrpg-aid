/**
 * Lookups over the power and quality catalog, and helpers for option references
 * ({ power }, { quality }, { powerCategory }, { qualityCategory }).
 */
import { powerCategories, qualityCategories } from './data'
import type { OptionRef, Trait, TraitCategory, TraitKind } from './types'

/** A specific power or quality, identified by kind and id. */
export interface TraitRef {
  kind: TraitKind
  id: string
}

export interface CatalogTrait extends Trait {
  kind: TraitKind
  categoryId: string
}

function flatten(kind: TraitKind): CatalogTrait[] {
  return kind === 'power'
    ? powerCategories.flatMap((c) => c.powers.map((t) => ({ ...t, kind, categoryId: c.id })))
    : qualityCategories.flatMap((c) => c.qualities.map((t) => ({ ...t, kind, categoryId: c.id })))
}

const allPowers = flatten('power')
const allQualities = flatten('quality')
const traitIndex = new Map<string, CatalogTrait>(
  [...allPowers, ...allQualities].map((t) => [traitKey(t), t]),
)
const categoryIndex = new Map<string, TraitCategory>([
  ...powerCategories.map((c) => [`power:${c.id}`, c] as const),
  ...qualityCategories.map((c) => [`quality:${c.id}`, c] as const),
])

/** A stable string key for a trait, e.g. "power:flight". */
export function traitKey(ref: TraitRef): string {
  return `${ref.kind}:${ref.id}`
}

/** The reverse of traitKey: "power:flight" → { kind: 'power', id: 'flight' }. */
export function parseTraitKey(key: string): TraitRef {
  const at = key.indexOf(':')
  return { kind: key.slice(0, at) as TraitKind, id: key.slice(at + 1) }
}

export function getTrait(ref: TraitRef): CatalogTrait | undefined {
  return traitIndex.get(traitKey(ref))
}

export function getCategory(kind: TraitKind, id: string): TraitCategory | undefined {
  return categoryIndex.get(`${kind}:${id}`)
}

export function traitsOfKind(kind: TraitKind): readonly CatalogTrait[] {
  return kind === 'power' ? allPowers : allQualities
}

/** What an option reference points at: one trait, or a category of them. */
export function describeRef(ref: OptionRef): { kind: TraitKind; scope: 'trait' | 'category'; id: string } {
  if ('power' in ref) return { kind: 'power', scope: 'trait', id: ref.power }
  if ('quality' in ref) return { kind: 'quality', scope: 'trait', id: ref.quality }
  if ('powerCategory' in ref) return { kind: 'power', scope: 'category', id: ref.powerCategory }
  return { kind: 'quality', scope: 'category', id: ref.qualityCategory }
}

/** Every specific trait an option reference allows (a category expands to its members). */
export function expandRef(ref: OptionRef): CatalogTrait[] {
  const { kind, scope, id } = describeRef(ref)
  if (scope === 'trait') {
    const trait = getTrait({ kind, id })
    return trait ? [trait] : []
  }
  return traitsOfKind(kind).filter((t) => t.categoryId === id)
}

/** Every specific trait a list of option references allows, without duplicates, in list order. */
export function expandRefs(refs: readonly OptionRef[]): CatalogTrait[] {
  const seen = new Set<string>()
  const result: CatalogTrait[] = []
  for (const trait of refs.flatMap(expandRef)) {
    const key = traitKey(trait)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(trait)
    }
  }
  return result
}

/** Whether a specific trait is allowed by an option reference. */
export function refMatches(ref: OptionRef, trait: TraitRef): boolean {
  const { kind, scope, id } = describeRef(ref)
  if (kind !== trait.kind) return false
  if (scope === 'trait') return id === trait.id
  return getTrait(trait)?.categoryId === id
}

/** Whether a specific trait is allowed by any of a list of option references. */
export function refsMatch(refs: readonly OptionRef[], trait: TraitRef): boolean {
  return refs.some((ref) => refMatches(ref, trait))
}
