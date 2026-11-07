/**
 * The swap dialogs' logic (scrpg-aid-designs/advancement/spec.md, section 2): who can be swapped, what
 * for, and what changes. Pure. The rules checks themselves are in ../creation/advancement.ts,
 * which also applies a swap on top of the creation choices.
 */
import type { Action } from '../creation/effects'
import { abilitySwapOptions, advancedHero, checkAdvancement, swappablePicks, traitSwapIssues, traitSwapOptions } from '../creation/advancement'
import { primaryUse, slotCandidates } from '../creation/abilities'
import { recordedPicks } from '../creation/lookup'
import { heroPrinciples, principleOf } from '../creation/principles'
import { buildSheet, fillPrinciple, type HeroSheet } from '../creation/sheet'
import { deriveTraits, traitLabel, type HeroTrait } from '../creation/traits'
import type { AbilityPick, AdvancementChange, AdvancementEntry, Hero, PrincipleChoice } from '../hero/model'
import { ZONE_LABEL } from '../hero/labels'
import { powerSourcesById } from '../rules/data'
import { traitSlots } from '../rules/slots'
import type { Ability, PrincipleCategoryId, Zone } from '../rules/types'
import type { Clock } from '../play/state'
import { getCategory, type CatalogTrait, type TraitRef } from '../rules/catalog'
import { nameList } from '../game/names'
import { followed, historyEntry } from './records'

/** The hero's powers or qualities as they are now, the roleplaying quality among them. */
export function heldTraits(hero: Hero, kind: TraitRef['kind']): HeroTrait[] {
  return deriveTraits(advancedHero(hero)).traits.filter((t) => t.trait.kind === kind)
}

/** Every power or quality the hero doesn't already have. */
export function traitCandidates(hero: Hero, kind: TraitRef['kind']): CatalogTrait[] {
  return traitSwapOptions(advancedHero(hero), kind)
}

/** An ability a swap changes: its text before and after, and the issue if the swap breaks it. */
export interface AbilityChange {
  key: string
  name: string
  effects: readonly Action[]
  before: string
  after: string
  issue?: string
}

interface AnyAbility {
  key: string
  source?: string
  baseName?: string
  name: string
  effects: readonly Action[]
  text: string
}

function abilitiesOf(sheet: HeroSheet): AnyAbility[] {
  return [
    ...sheet.abilities.map((a, i) => ({ key: `ability:${i}`, source: a.source, baseName: a.baseName, name: a.name, effects: a.effects, text: a.text })),
    ...(sheet.outAbility ? [{ key: 'out', name: 'Out ability', effects: sheet.outEffects, text: sheet.outAbility }] : []),
    ...sheet.forms.flatMap((f, i) => (f.ability ? [{ key: `form:${i}`, name: f.ability.name, effects: f.ability.effects, text: f.ability.text }] : [])),
    ...sheet.modes.flatMap((m, i) => (m.ability ? [{ key: `mode:${i}`, name: m.ability.name, effects: m.ability.effects, text: m.ability.text }] : [])),
  ]
}

/** The hero with a swap recorded, for looking at what it would do. */
const withSwap = (hero: Hero, change: AdvancementChange): Hero => ({ ...hero, advancement: [...hero.advancement, { id: 'preview', at: '', kind: 'details', text: '', change }] })

/** What a swap of `from` for `to` does to the hero's abilities. */
export function traitSwapPreview(hero: Hero, from: TraitRef, to: TraitRef): AbilityChange[] {
  const change: AdvancementChange = { kind: from.kind === 'power' ? 'swapPower' : 'swapQuality', from, to }
  const after = new Map(abilitiesOf(buildSheet(withSwap(hero, change))).map((a) => [a.key, a]))
  const issues = traitSwapIssues(advancedHero(hero), from, to)
  return abilitiesOf(buildSheet(hero)).flatMap((a) => {
    const now = after.get(a.key)
    if (!now || now.text === a.text) return []
    const issue = a.source && issues.find((i) => i.source === a.source && i.name === a.baseName)?.message
    return [{ key: a.key, name: a.name, effects: a.effects, before: a.text, after: now.text, ...(issue ? { issue } : {}) }]
  })
}

/** "Fire d8 becomes Lightning d8, and 2 abilities update. 1 rule issue; you can swap anyway and fix it next." */
export function traitSwapSummary(hero: Hero, from: HeroTrait, to: TraitRef, changes: readonly AbilityChange[]): string {
  const now = advancedHero(hero)
  const updates = changes.length ? `, and ${changes.length === 1 ? '1 ability updates' : `${changes.length} abilities update`}` : ''
  const bad = changes.filter((c) => c.issue).length
  const issues = bad ? ` ${bad === 1 ? '1 rule issue' : `${bad} rule issues`}; you can swap anyway and fix it next.` : ''
  return `${from.name} ${from.die} becomes ${traitLabel(now, to)} ${from.die}${updates}.${issues}`
}

/** Records a swap in the history; it applies on top of the creation choices from then on. */
function recordSwap(hero: Hero, change: AdvancementChange, text: string, clock: Clock): Hero {
  const by = followed(hero)
  const entry: AdvancementEntry = historyEntry(clock, 'details', text, { change, ...(by ? { after: by } : {}) })
  return { ...hero, advancement: [...hero.advancement, entry] }
}

/** Swaps a power or quality for another at its die. */
export function swapTrait(hero: Hero, from: TraitRef, to: TraitRef, clock: Clock): Hero {
  const now = advancedHero(hero)
  const held = deriveTraits(now).traits.find((t) => t.trait.kind === from.kind && t.trait.id === from.id)
  if (!held) return hero
  const name = traitLabel(now, to)
  const names = traitSwapPreview(hero, from, to).map((c) => c.name)
  const follows = names.length ? ` ${nameList(names)} now ${names.length === 1 ? 'uses' : 'use'} ${name}.` : ''
  return recordSwap(hero, { kind: from.kind === 'power' ? 'swapPower' : 'swapQuality', from, to }, `Swapped ${held.name} ${held.die} for ${name} ${held.die}.${follows}`, clock)
}

// ---- Principles ----

/** A principle's name with its blank filled in. */
export function principleName(choice: PrincipleChoice | undefined): string {
  const principle = choice && principleOf(choice)
  return principle ? fillPrinciple(principle.name, choice) : 'Another principle'
}

/** The two principles a swap can replace, as the hero has them now. */
export function heldPrinciples(hero: Hero): { replace: 'background' | 'archetype'; choice: PrincipleChoice }[] {
  const held = heroPrinciples(advancedHero(hero))
  return (['background', 'archetype'] as const).flatMap((replace) => {
    const choice = held[replace]
    return choice ? [{ replace, choice }] : []
  })
}

/** What the picker offers: the hero's own categories first, and not one they hold (one with a blank can be taken again, filled differently). */
export function principleOptions(hero: Hero): { categories: PrincipleCategoryId[]; exclude: string[] } {
  const held = heldPrinciples(hero).flatMap((h) => {
    const principle = principleOf(h.choice)
    return principle ? [{ choice: h.choice, principle }] : []
  })
  return { categories: [...new Set(held.map((h) => h.principle.category))], exclude: held.filter((h) => !h.principle.customization).map((h) => h.choice.id) }
}

export function swapPrinciple(hero: Hero, replace: 'background' | 'archetype', choice: PrincipleChoice, clock: Clock): Hero {
  const old = heroPrinciples(advancedHero(hero))[replace]
  return recordSwap(hero, { kind: 'swapPrinciple', replace, with: choice }, `Swapped ${principleName(old)} for ${principleName(choice)}.`, clock)
}

// ---- Abilities ----

/** An ability a swap can start from: its color, and where it came from. */
export interface SwappableAbility {
  key: string
  pick: AbilityPick
  ability: Ability
  zone: Zone
  /** "Accident", "Speedster", "Athletic". */
  sourceName: string
  /** "Power source: Accident". */
  tag: string
}

const pickZone = (pick: AbilityPick): Zone => (pick.source.endsWith('.green') ? 'green' : pick.source.endsWith('.yellow') ? 'yellow' : 'red')

const shownName = (pick: AbilityPick) => pick.customName?.trim() || pick.name

/** The hero's abilities a swap can start from, Green first. */
export function swappableAbilities(hero: Hero): SwappableAbility[] {
  const now = advancedHero(hero)
  const placed = recordedPicks(now)
  const order: Zone[] = ['green', 'yellow', 'red']
  return swappablePicks(now)
    .map(({ pick, ability }): SwappableAbility => {
      const key = `${pick.source}|${pick.name}`
      if (pick.source === 'red') {
        const [kind, id] = (pick.category ?? '').split(':') as [TraitRef['kind'], string]
        const category = getCategory(kind, id)?.name ?? 'Red abilities'
        return { key, pick, ability, zone: 'red', sourceName: category, tag: `Red ability: ${category}` }
      }
      if (pick.source.startsWith('powerSource')) {
        const name = (now.powerSource && powerSourcesById.get(now.powerSource.id)?.name) ?? 'its power source'
        return { key, pick, ability, zone: pickZone(pick), sourceName: name, tag: `Power source: ${name}` }
      }
      const name = placed.find((p) => p.pick.source === pick.source && p.pick.name === pick.name)?.archetype?.name ?? 'its archetype'
      return { key, pick, ability, zone: pickZone(pick), sourceName: name, tag: `Archetype: ${name}` }
    })
    .sort((a, b) => order.indexOf(a.zone) - order.indexOf(b.zone))
}

/** The power or quality an ability uses, if it uses one. */
export function usedTrait(from: Pick<SwappableAbility, 'ability' | 'pick'>): TraitRef | undefined {
  return primaryUse(from.ability, from.pick)
}

/**
 * What an ability can be swapped for: the same color from the same source's entries, that can use
 * the same power or quality, and that the hero doesn't already have.
 */
export function abilityCandidates(hero: Hero, from: SwappableAbility): Ability[] {
  const now = advancedHero(hero)
  const use = usedTrait(from)
  if (!use) return [...abilitySwapOptions(now, from.pick)]
  const traits = deriveTraits(now).traits
  const same = (t: TraitRef) => t.kind === use.kind && t.id === use.id
  return abilitySwapOptions(now, from.pick).filter((a) => {
    const slot = traitSlots(a.text)[0]
    if (slot) return slotCandidates(now, traits, slot, 'advancement').some((t) => same(t.trait))
    const named = primaryUse(a, { source: from.pick.source, name: a.name })
    return Boolean(named && same(named))
  })
}

/** The new ability, with the old one's power or quality filled in. */
export function startingPick(from: SwappableAbility, ability: Ability): AbilityPick {
  const use = usedTrait(from)
  const usesSlot = traitSlots(ability.text).length > 0
  return { source: from.pick.source, name: ability.name, ...(usesSlot && use ? { uses: [use] } : {}), ...(from.pick.category ? { category: from.pick.category } : {}) }
}

/** "No other Yellow abilities from Accident can use Fire." */
export function noCandidatesText(hero: Hero, from: SwappableAbility): string {
  const use = usedTrait(from)
  return `No other ${ZONE_LABEL[from.zone]} abilities from ${from.sourceName}${use ? ` can use ${traitLabel(advancedHero(hero), use)}` : ' are left'}.`
}

const abilityChange = (from: AbilityPick, to: AbilityPick): AdvancementChange => ({ kind: 'swapAbility', from: { source: from.source, name: from.name }, to })

/** How many rule issues the swap would add. */
export function abilitySwapIssues(hero: Hero, from: AbilityPick, to: AbilityPick): number {
  return checkAdvancement(withSwap(hero, abilityChange(from, to))).length - checkAdvancement(hero).length
}

export function swapAbility(hero: Hero, from: SwappableAbility, to: AbilityPick, clock: Clock): Hero {
  const use = primaryUse(from.ability, from.pick)
  const follows = use ? ` It uses ${traitLabel(advancedHero(hero), use)}.` : ''
  return recordSwap(hero, abilityChange(from.pick, to), `Swapped ${shownName(from.pick)} for ${shownName(to)}.${follows}`, clock)
}
