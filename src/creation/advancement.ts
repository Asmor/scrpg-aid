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
import { traitSlots, type TraitSlot } from '../rules/slots'
import { checkAbilityPick, primaryUse, slotCandidates } from './abilities'
import { findAbility, findRedAbility, optionsFor, recordedPicks, retconnedPick } from './lookup'
import type { AbilitySource } from '../hero/model'
import { heroPrinciples, principleOf } from './principles'
import { deriveTraits, ROLEPLAYING_QUALITY, traitLabel } from './traits'
import { warning, type IssueCode, type RuleWarning } from './warnings'

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

/** The swaps that apply on top of the creation choices: those since the last rewrite, which built them in. */
export function changesInForce(hero: Pick<Hero, 'advancement'>): AdvancementChange[] {
  const rewrite = hero.advancement.findLastIndex((e) => e.kind === 'rewrite')
  return hero.advancement.slice(rewrite + 1).flatMap((e) => (e.kind === 'details' && e.change && e.change.kind !== 'cosmetic' ? [e.change] : []))
}

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

/** What a slot wants, for an issue: only slots limited to a list can refuse anything. */
function slotWants(slot: TraitSlot): string {
  switch (slot.label.toLowerCase()) {
    case 'element/energy you have a related power for':
      return 'an energy or element power'
    case 'self control power':
      return 'a self-control power'
    case 'psychic power':
      return 'a psychic power'
    case 'mental quality':
      return 'a mental quality'
    case 'any physical or mental quality':
      return 'a physical or mental quality'
    case 'a power gained from your archetype':
      return 'a power from your archetype'
    case 'a quality gained from your archetype':
      return 'a quality from your archetype'
    default:
      return slot.label
  }
}

/** An ability a trait swap breaks: it needs that slot's kind of trait, and the new one isn't. */
export interface SlotIssue {
  source: AbilitySource
  name: string
  message: string
}

/**
 * The abilities using a power or quality whose slot wouldn't take its replacement. Issues don't
 * block a swap, as in the wizard. `hero` is as the hero is before the swap.
 */
export function traitSwapIssues(hero: Hero, from: TraitRef, to: TraitRef): SlotIssue[] {
  if (sameTrait(from, ROLEPLAYING_QUALITY)) return []
  const after = applyChange(structuredClone(hero), { kind: from.kind === 'power' ? 'swapPower' : 'swapQuality', from, to })
  const traits = deriveTraits(after).traits
  return recordedPicks(hero).flatMap(({ pick, archetype }) => {
    const ability = findAbility(hero, pick, archetype)
    if (!ability) return []
    const current = retconnedPick(hero, pick)
    const slots = traitSlots(ability.text)
    const broken = slots.find((slot, i) => current.uses?.[i] && sameTrait(current.uses[i]!, from) && !slotCandidates(after, traits, slot, 'advancement').some((t) => sameTrait(t.trait, to)))
    return broken ? [{ source: pick.source, name: pick.name, message: `Needs ${slotWants(broken)}. ${traitLabel(after, to)} isn't one, so this ability would need swapping too.` }] : []
  })
}

/** Applies one change to a hero (in place, except for trait swaps, which return a new hero). */
function applyChange(hero: Hero, change: AdvancementChange): Hero {
  switch (change.kind) {
    case 'swapPower':
    case 'swapQuality': {
      // Swapping the roleplaying quality makes it the new quality at its die (the advancement spec, ruling 49).
      if (sameTrait(change.from, ROLEPLAYING_QUALITY)) {
        hero.traitNames[traitKey(ROLEPLAYING_QUALITY)] = traitLabel(hero, change.to)
        return hero
      }
      // The hero's build only: its history keeps saying what happened.
      const { backIssues, collections, advancement, ...rest } = hero
      return { ...renameTrait(rest, change.from, change.to), backIssues, collections, advancement }
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
export function advancedHero(hero: Hero, count?: number): Hero {
  let result = structuredClone(hero)
  for (const change of changesInForce(hero).slice(0, count)) result = applyChange(result, change)
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
  const traits = deriveTraits(hero).traits
  const held = new Set(traits.map((t) => traitKey(t.trait)))
  // A roleplaying quality swapped for a listed one holds that quality under its own key.
  const names = new Set(traits.map((t) => t.name))
  return traitsOfKind(kind).filter((t) => !held.has(traitKey(t)) && !names.has(traitLabel(hero, t)))
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
  const warn = (code: IssueCode, message: string) => [warning('advancement', code, `Change ${n}: ${message}`)]
  const traits = deriveTraits(before).traits
  switch (change.kind) {
    case 'swapPower':
    case 'swapQuality': {
      const kind = change.kind === 'swapPower' ? 'power' : 'quality'
      if (change.from.kind !== kind || change.to.kind !== kind) return warn('advancement-kind', `this swaps a ${kind} for another ${kind}.`)
      if (!traits.some((t) => sameTrait(t.trait, change.from))) return warn('advancement-not-held', `you don't have ${traitLabel(before, change.from)}.`)
      if (!getTrait(change.to)) return warn('unknown-trait', `"${change.to.id}" isn't a known ${kind}.`)
      if (traits.some((t) => sameTrait(t.trait, change.to))) return warn('advancement-already-have', `you already have ${traitLabel(before, change.to)}.`)
      return traitSwapIssues(before, change.from, change.to).map((issue) => warning('advancement', 'advancement-slot', `${issue.name}: ${issue.message}`))
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

/** Checks each swap in order, on the hero as the ones before it left them. */
export function checkAdvancement(hero: Hero): RuleWarning[] {
  return changesInForce(hero).flatMap((change, i) => checkChange(advancedHero(hero, i), change, i + 1))
}
