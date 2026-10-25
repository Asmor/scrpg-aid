/**
 * Hero advancement (p. 142–143). Creation choices stay as they were made; the changes made
 * between collections are recorded separately and applied on top, in order, to give the hero
 * as they are now (the user's design). The creation checks run on the hero as created, so
 * they don't flag what advancement changed; these checks cover the changes themselves, not the
 * links creation set up (ruling 51).
 */
import { getTrait, traitKey, traitsOfKind, type CatalogTrait, type TraitRef } from '../rules/catalog'
import type { Ability } from '../rules/types'
import type { AbilityPick, AdvancementChange, Hero } from '../hero/model'
import { checkAbilityPick, primaryUse } from './abilities'
import { findAbility, findRedAbility, optionsFor, recordedPicks, retconnedPick } from './lookup'
import type { AbilitySource } from '../hero/model'
import { heroPrinciples, principleOf } from './principles'
import { deriveTraits, ROLEPLAYING_QUALITY, traitLabel } from './traits'
import { warning, type RuleWarning } from './warnings'

/**
 * The ability lists a swap can work within: the ones the player picks from. Fixed abilities
 * come with the archetype anyway, and Divided's transition ability belongs to its method.
 * Red abilities are included (ruling 50).
 */
export const SWAPPABLE_SOURCES: readonly AbilitySource[] = ['powerSource.green', 'powerSource.yellow', 'archetype.green', 'archetype.yellow', 'red']

/** The ability picks an ability swap can start from, as the hero has them now (the ability retcon applied). */
export function swappablePicks(hero: Hero): { pick: AbilityPick; ability: Ability }[] {
  return recordedPicks(hero).flatMap(({ pick, archetype }) => {
    const ability = SWAPPABLE_SOURCES.includes(pick.source) ? findAbility(hero, pick, archetype) : undefined
    return ability ? [{ pick: retconnedPick(hero, pick), ability }] : []
  })
}

/** Six back issues make a collection (p. 142). */
export const BACK_ISSUES_PER_COLLECTION = 6

const sameTrait = (a: TraitRef, b: TraitRef) => a.kind === b.kind && a.id === b.id

/** Replaces every reference to one trait with another, anywhere in a value (a copy is returned). */
function renameTrait<T>(value: T, from: TraitRef, to: TraitRef): T {
  if (Array.isArray(value)) return value.map((v) => renameTrait(v, from, to)) as T
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.kind === 'string' && typeof obj.id === 'string' && Object.keys(obj).length === 2 && sameTrait(obj as unknown as TraitRef, from)) return { ...to } as T
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, renameTrait(v, from, to)])) as T
  }
  return value
}

/** The lists of ability picks an ability swap can replace a pick in. */
function pickLists(hero: Hero): AbilityPick[][] {
  return [hero.powerSource?.abilities, hero.archetype?.abilities, hero.archetype?.secondary?.abilities, hero.redAbilities].filter((l): l is AbilityPick[] => Boolean(l))
}

/** Applies one change to a hero (in place, except for trait swaps, which return a new hero). */
function applyChange(hero: Hero, change: AdvancementChange): Hero {
  switch (change.kind) {
    case 'swapPower':
    case 'swapQuality': {
      const { advancement, ...rest } = hero
      const renamed = renameTrait(rest, change.from, change.to) as Hero
      return advancement ? { ...renamed, advancement } : renamed
    }
    case 'swapPrinciple': {
      // A retcon that already replaced this principle is what the hero has now, so replace that.
      if (hero.retcon?.kind === 'changePrinciple' && hero.retcon.replace === change.replace) hero.retcon = { ...hero.retcon, with: change.with }
      else if (change.replace === 'background' && hero.background) hero.background.principle = change.with
      else if (change.replace === 'archetype' && hero.archetype) hero.archetype.principle = change.with
      return hero
    }
    case 'swapAbility': {
      for (const list of pickLists(hero)) {
        const index = list.findIndex((p) => p.source === change.from.source && p.name === change.from.name)
        if (index >= 0) {
          list[index] = change.to
          break
        }
      }
      return hero
    }
  }
}

/** The hero with the first `count` advancement changes applied (all of them by default). */
export function advancedHero(hero: Hero, count = hero.advancement?.changes.length ?? 0): Hero {
  let result = structuredClone(hero)
  for (const change of hero.advancement?.changes.slice(0, count) ?? []) result = applyChange(result, change)
  return result
}

/**
 * The abilities an ability swap could put in place of `pick`: the other options of the same
 * color from the same entry, leaving out ones the hero already took from that list.
 */
export function abilitySwapOptions(hero: Hero, pick: AbilityPick): Ability[] {
  const taken = new Set(recordedPicks(hero).filter((p) => p.pick.source === pick.source).map((p) => p.pick.name))
  if (pick.source === 'red') {
    const found = findRedAbility(hero, pick)
    if (!found.found) return []
    return (found.category ? found.category.abilities : []).filter((a) => !taken.has(a.name))
  }
  const placed = recordedPicks(hero).find((p) => p.pick.source === pick.source && p.pick.name === pick.name)
  return optionsFor(hero, pick, placed?.archetype).filter((a) => !taken.has(a.name))
}

/** The traits a trait swap can give: ones of the same kind the hero doesn't have. */
export function traitSwapOptions(hero: Hero, kind: TraitRef['kind']): CatalogTrait[] {
  const held = new Set(deriveTraits(hero).traits.map((t) => traitKey(t.trait)))
  return traitsOfKind(kind).filter((t) => !held.has(traitKey(t)))
}

/** A one-line description of a change, for lists. */
export function describeChange(hero: Hero, change: AdvancementChange): string {
  switch (change.kind) {
    case 'swapPower':
    case 'swapQuality':
      return `Swapped ${traitLabel(hero, change.from)} for ${traitLabel(hero, change.to)}`
    case 'swapPrinciple':
      return `Swapped your ${change.replace} principle for ${principleOf(change.with)?.name ?? 'another'}`
    case 'swapAbility':
      return `Swapped ${change.from.name} for ${change.to.customName?.trim() || change.to.name}`
  }
}

function checkChange(before: Hero, change: AdvancementChange, n: number): RuleWarning[] {
  const warn = (code: string, message: string) => [warning('advancement', code, `Change ${n}: ${message}`)]
  const traits = deriveTraits(before).traits
  switch (change.kind) {
    case 'swapPower':
    case 'swapQuality': {
      const kind = change.kind === 'swapPower' ? 'power' : 'quality'
      if (change.from.kind !== kind || change.to.kind !== kind) return warn('advancement-kind', `this swaps a ${kind} for another ${kind}.`)
      // The roleplaying quality is the hero's own invention: changing it means renaming it.
      if (sameTrait(change.from, ROLEPLAYING_QUALITY)) return warn('advancement-roleplaying', 'to change your roleplaying quality, rename it in the personality step.')
      if (!traits.some((t) => sameTrait(t.trait, change.from))) return warn('advancement-not-held', `you don't have ${traitLabel(before, change.from)}.`)
      if (!getTrait(change.to)) return warn('unknown-trait', `"${change.to.id}" isn't a known ${kind}.`)
      if (traits.some((t) => sameTrait(t.trait, change.to))) return warn('advancement-already-have', `you already have ${traitLabel(before, change.to)}.`)
      return []
    }
    case 'swapPrinciple': {
      if (!principleOf(change.with)) return warn('unknown-entry', 'choose the new principle.')
      const current = heroPrinciples(before)[change.replace]
      const same = (a: typeof current) => a?.id === change.with.id && JSON.stringify(a.custom) === JSON.stringify(change.with.custom)
      if (same(current)) return warn('advancement-no-change', 'choose a different principle.')
      if (same(heroPrinciples(before)[change.replace === 'background' ? 'archetype' : 'background'])) return warn('advancement-duplicate-principle', 'you already have that principle.')
      return []
    }
    case 'swapAbility': {
      if (!SWAPPABLE_SOURCES.includes(change.from.source)) return warn('advancement-ability-source', `${change.from.name} can't be swapped: it comes with your archetype or transition method.`)
      const from = swappablePicks(before).find((p) => p.pick.source === change.from.source && p.pick.name === change.from.name)
      const fromAbility = from?.ability
      if (!from || !fromAbility) return warn('advancement-not-held', `you don't have ${change.from.name}.`)
      if (change.to.source !== change.from.source) return warn('advancement-ability-source', 'the new ability must come from the same list.')
      const toAbility = abilitySwapOptions(before, from.pick).find((a) => a.name === change.to.name)
      if (!toAbility) return warn('advancement-ability-source', `${change.to.name} isn't another ability from the same list and color as ${change.from.name}.`)
      const oldUse = primaryUse(fromAbility, from.pick)
      const newUse = primaryUse(toAbility, change.to)
      const out: RuleWarning[] = checkAbilityPick(before, traits, toAbility, change.to, 'advancement').map((w) => ({ ...w, message: `Change ${n}: ${w.message}` }))
      if (oldUse && (!newUse || !sameTrait(oldUse, newUse))) out.push(...warn('advancement-ability-use', `${change.to.name} must use ${traitLabel(before, oldUse)}, as ${change.from.name} did.`))
      return out
    }
  }
}

/** Checks the advancement record: the back issue count, collection names, and each change in order. */
export function checkAdvancement(hero: Hero): RuleWarning[] {
  const adv = hero.advancement
  if (!adv) return []
  const warnings: RuleWarning[] = []
  if (!Number.isInteger(adv.backIssues) || adv.backIssues < 0) warnings.push(warning('advancement', 'back-issues', 'Back issues must be a whole number, 0 or more.'))
  else if (adv.backIssues >= BACK_ISSUES_PER_COLLECTION) {
    warnings.push(warning('advancement', 'back-issues', `You have ${adv.backIssues} back issues: name a collection.`))
  }
  adv.collections.forEach((c, i) => {
    if (!c.name.trim()) warnings.push(warning('advancement', 'collection-name', `Name collection ${i + 1}.`))
  })
  adv.changes.forEach((change, i) => warnings.push(...checkChange(advancedHero(hero, i), change, i + 1)))
  return warnings
}
