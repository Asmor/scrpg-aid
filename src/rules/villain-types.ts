/** Types for the villain rules data in data/villains/ (Phase 5); see data/README.md. */
import type { Ability, AbilityChoice, Die, HealthRange, OptionRef, PageRef, TraitKind } from './types'

export interface VillainApproach extends PageRef {
  id: string
  number: number
  name: string
  baseHealth: number
  powerDice: Die[]
  suggestedPowers: OptionRef[]
  qualityDice: Die[]
  suggestedQualities: OptionRef[]
  abilities: AbilityChoice & { options: Ability[] }
}

/** A count tier: the status die while the counted thing is between `min` and `max` (no max: or more). */
export interface CountTier {
  min: number
  max?: number
  die: Die
}

/** How a villain archetype's status die is set (p. 220–234). */
export type VillainStatusRule =
  | { basis: 'healthZone'; summary: string; zones: Record<'green' | 'yellow' | 'red', Die> }
  | { basis: 'count'; summary?: string; counts: string; tiers: CountTier[] }
  | { basis: 'fixed'; summary: string; die: Die }
  | { basis: 'weakness'; summary: string; tiers: { condition: string; die: Die }[] }
  | { basis: 'challenge'; summary: string; startingDie: Die; challenge: { successes: number; text: string }[] }

export interface VillainArchetype extends PageRef {
  id: string
  number: number
  name: string
  healthModifier: number
  suggestedApproaches: string[]
  /** Advice that applies when the villain's approach is one of `approaches`. */
  pairingNote?: { approaches: string[]; text: string }
  /** The archetype needs an ability that makes minions (`makesMinions`, ruling 66) from somewhere: Legion. */
  needsMinionMaker?: { note: string }
  status: VillainStatusRule
  abilities: AbilityChoice & { options: Ability[] }
  /** Abilities every villain of this archetype has (Legion). */
  fixedAbilities?: Ability[]
}

/** What an upgrade does to the villain's dice (Power Upgrade, Quality Upgrade). */
export interface UpgradeEffect {
  kind: 'upgradeAllDice'
  targets: TraitKind[]
  steps: number
  excludeRoleplayingQuality?: boolean
  /** A die already at d12 gives another ability from this list instead. */
  overflow: 'gainArchetypeAbility' | 'gainApproachAbility'
}

export interface VillainUpgrade extends PageRef {
  id: string
  number: number
  name: string
  health: number
  requirement: string
  summary?: string
  abilities?: Ability[]
  effect?: UpgradeEffect
  /** Villainous Vehicle: the vehicle is built as a lieutenant; its die sets how many vehicle abilities it gets. */
  lieutenantOptions?: { die: Die; abilityCount: number }[]
  vehicleAbilities?: Ability[]
}

export interface VillainHealthChart {
  /** Health = the sum of the terms: a field of the approach/archetype/upgrades, or so much per hero. */
  formula: { summary: string; terms: ({ source: string; field: string; sum?: boolean } | { perHero: number })[] }
  ranges: (HealthRange & { orMore?: true })[]
}
