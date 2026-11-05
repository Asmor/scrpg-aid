/**
 * The swap dialogs' logic (docs/design/advancement/spec.md, section 2): who can be swapped, what
 * for, and what changes. Pure. The rules checks themselves are in ../creation/advancement.ts,
 * which also applies a swap on top of the creation choices.
 */
import type { Action } from '../creation/effects'
import { advancedHero, traitSwapIssues, traitSwapOptions } from '../creation/advancement'
import { buildSheet, type HeroSheet } from '../creation/sheet'
import { deriveTraits, traitLabel, type HeroTrait } from '../creation/traits'
import type { AdvancementChange, AdvancementEntry, Hero } from '../hero/model'
import type { Clock } from '../play/state'
import type { CatalogTrait, TraitRef } from '../rules/catalog'
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
