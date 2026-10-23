/**
 * Puts the hero sheet together from a hero's choices: characteristics, powers and
 * qualities, abilities by zone (with their blanks filled in), principles, status dice,
 * Health, and every rule warning. This is what the sheet view and editor display.
 */
import type { TraitRef } from '../rules/catalog'
import {
  archetypesById,
  backgroundsById,
  personalitiesById,
  powerSourcesById,
  principlesById,
} from '../rules/data'
import { parseSlots } from '../rules/slots'
import type { Ability, AbilityType, Die, HealthRange, Zone } from '../rules/types'
import type { AbilityPick, AbilitySource, Hero, PrincipleChoice } from '../hero/model'
import { checkAbilities, checkAbilityPick, checkAbilityRetcon } from './abilities'
import { computeHealth, statusDice } from './health'
import { findAbility } from './lookup'
import { checkPrinciples, heroPrinciples } from './principles'
import { checkRedAbilities } from './red'
import { deriveTraits, traitLabel, type HeroTrait } from './traits'
import type { RuleWarning } from './warnings'

export interface SheetAbility {
  zone: Zone
  /** The name to show: the player's name for it, or the ability's own name. */
  name: string
  /** The ability's name in the rules data. */
  baseName: string
  type: AbilityType
  /** The game text with its blanks filled in where the player has chosen. */
  text: string
  source: AbilitySource | 'principle'
}

export interface SheetPrinciple {
  name: string
  roleplaying: string
  minorTwist: string
  majorTwist: string
}

export interface HeroSheet {
  characteristics: { background?: string; powerSource?: string; archetype?: string; personality?: string }
  powers: HeroTrait[]
  qualities: HeroTrait[]
  statusDice?: Record<Zone, Die>
  maxHealth?: number
  healthRanges?: HealthRange
  principles: SheetPrinciple[]
  abilities: SheetAbility[]
  outAbility?: string
  warnings: RuleWarning[]
}

/** Replaces bracketed blanks with the player's choices, leaving unfilled ones as they are. */
export function fillText(hero: Hero, text: string, uses: readonly TraitRef[] = [], blanks: AbilityPick['blanks'] = {}): string {
  const slots = parseSlots(text)
  let index = 0
  let traitIndex = 0
  return text.replace(/\[([^\]]+)\]/g, (whole) => {
    const slot = slots[index++]!
    if (slot.type === 'trait') {
      const use = uses[traitIndex++]
      return use ? traitLabel(hero, use) : whole
    }
    const value = blanks[slot.label]
    const filled = Array.isArray(value) ? value.filter((v) => v.trim()).join(' and ') : value?.trim()
    return filled || whole
  })
}

/** Fills a principle's [blank] with the player's customization. */
function fillPrinciple(text: string, choice: PrincipleChoice): string {
  const value = choice.customization?.trim()
  return value ? text.replace(/\[[^\]]+\]/g, value) : text
}

const ZONE_OF: Record<AbilitySource, Zone> = {
  'powerSource.green': 'green',
  'powerSource.yellow': 'yellow',
  'archetype.fixedGreen': 'green',
  'archetype.green': 'green',
  'archetype.fixedYellow': 'yellow',
  'archetype.yellow': 'yellow',
  'archetype.fixedRed': 'red',
  red: 'red',
  retcon: 'red',
}

function sheetAbility(hero: Hero, ability: Ability, pick: AbilityPick): SheetAbility {
  return {
    zone: ZONE_OF[pick.source],
    name: pick.customName?.trim() || ability.name,
    baseName: ability.name,
    type: ability.type,
    text: fillText(hero, ability.text, pick.uses, pick.blanks),
    source: pick.source,
  }
}

/** The Out ability as an ability, so its blanks can be checked like any other. */
function outAbility(text: string): Ability {
  return { name: 'Out ability', type: 'A', text }
}

export function buildSheet(hero: Hero): HeroSheet {
  const derived = deriveTraits(hero)
  const traits = derived.traits
  const warnings: RuleWarning[] = [
    ...derived.warnings,
    ...checkAbilities(hero, traits),
    ...checkRedAbilities(hero, traits),
    ...checkAbilityRetcon(hero, traits),
    ...checkPrinciples(hero),
  ]

  // Ability picks, with the ability retcon's new traits applied.
  const retcon = hero.retcon?.kind === 'changeAbilityTrait' ? hero.retcon : undefined
  const picks = [
    ...(hero.powerSource?.abilities ?? []),
    ...(hero.archetype?.abilities ?? []),
    ...hero.redAbilities,
    ...(hero.retcon?.kind === 'gainRedAbility' ? [{ ...hero.retcon.ability, source: 'retcon' as const }] : []),
  ].map((p) => (retcon && p.source === retcon.ability.source && p.name === retcon.ability.name ? { ...p, uses: retcon.uses } : p))

  const abilities: SheetAbility[] = []
  for (const pick of picks) {
    const ability = findAbility(hero, pick)
    if (ability) abilities.push(sheetAbility(hero, ability, pick))
  }
  // Fixed abilities without blanks come with the archetype even if no pick was recorded.
  const ar = hero.archetype && archetypesById.get(hero.archetype.id)
  const fixed: [Ability[] | undefined, AbilitySource][] = [
    [ar?.fixedGreenAbilities, 'archetype.fixedGreen'],
    [ar?.fixedYellowAbilities, 'archetype.fixedYellow'],
    [ar?.fixedRedAbilities, 'archetype.fixedRed'],
  ]
  for (const [list, source] of fixed) {
    for (const ability of list ?? []) {
      if (!picks.some((p) => p.source === source && p.name === ability.name)) {
        abilities.push(sheetAbility(hero, ability, { source, name: ability.name }))
      }
    }
  }

  // Principles: their roleplaying text and twists, and their Green abilities.
  const principles: SheetPrinciple[] = []
  for (const choice of Object.values(heroPrinciples(hero))) {
    const principle = choice && principlesById.get(choice.id)
    if (!choice || !principle) continue
    principles.push({
      name: fillPrinciple(principle.name, choice),
      roleplaying: fillPrinciple(principle.roleplaying, choice),
      minorTwist: principle.minorTwist,
      majorTwist: principle.majorTwist,
    })
    abilities.push({
      zone: 'green',
      name: fillPrinciple(principle.greenAbility.name, choice),
      baseName: principle.greenAbility.name,
      type: principle.greenAbility.type,
      text: fillPrinciple(principle.greenAbility.text, choice),
      source: 'principle',
    })
  }

  // The Out ability, checked like any ability with blanks.
  const personality = hero.personality && personalitiesById.get(hero.personality.id)
  let out: string | undefined
  if (personality) {
    const pick: AbilityPick = { source: 'red', name: 'Out ability', uses: hero.personality!.outUses, blanks: hero.personality!.outBlanks }
    warnings.push(...checkAbilityPick(hero, traits, outAbility(personality.outAbility), pick, 'personality'))
    out = fillText(hero, personality.outAbility, pick.uses, pick.blanks)
  }

  const health = computeHealth(hero, traits)
  warnings.push(...health.warnings)

  const bg = hero.background && backgroundsById.get(hero.background.id)
  const ps = hero.powerSource && powerSourcesById.get(hero.powerSource.id)
  const byDie = (a: HeroTrait, b: HeroTrait) => Number(b.die.slice(1)) - Number(a.die.slice(1)) || a.name.localeCompare(b.name)
  return {
    characteristics: { background: bg?.name, powerSource: ps?.name, archetype: ar?.name, personality: personality?.name },
    powers: traits.filter((t) => t.trait.kind === 'power').sort(byDie),
    qualities: traits.filter((t) => t.trait.kind === 'quality').sort(byDie),
    statusDice: statusDice(hero),
    maxHealth: health.max,
    healthRanges: health.ranges,
    principles,
    abilities,
    outAbility: out,
    warnings,
  }
}
