/**
 * The villain document (Phase 5): what the GM chose at each step of villain creation
 * (Core Rules p. 208–239), plus free-form details.
 *
 * Like a hero, a villain stores choices, not results: its dice, abilities, Health, and
 * status rule are derived from these choices and the rules data (./sheet.ts), and rule
 * problems are warnings.
 *
 * Steps: an approach (power and quality dice to assign, a d8 roleplaying quality, base
 * Health, abilities from its list), an archetype (how its status die works, a Health
 * modifier, abilities), optional upgrades (each adds Health and abilities; any upgrade makes
 * it a major villain, which takes one mastery), and Health, which also depends on how many
 * heroes it's built to face.
 *
 * Versioning (./serialize.ts) follows the hero's rules. Until the first public release
 * there are no real saves, so v1 may still change freely.
 */
import { newId, type TraitAssignment } from '../hero/model'
import { traitKey, type TraitRef } from '../rules/catalog'
import type { Die } from '../rules/types'

/** Where a villain's ability came from. */
export type VillainAbilitySource = 'approach' | 'archetype' | 'archetype.fixed' | 'upgrade' | 'vehicle' | 'mastery'

/** An ability the villain took, with the choices made when taking it (like a hero's). */
export interface VillainAbilityPick {
  source: VillainAbilitySource
  /** The ability's name in the rules data. */
  name: string
  /** The powers/qualities filling the ability's trait slots, in the order they appear in its text. */
  uses?: TraitRef[]
  /** Other bracketed choices, keyed by the bracket text. */
  blanks?: Record<string, string | string[]>
  /** The GM's own name for the ability. */
  customName?: string
}

export interface ApproachChoice {
  id: string
  /** The approach's power and quality dice, each on a power or quality from the main list. */
  traits: TraitAssignment[]
  abilities: VillainAbilityPick[]
}

export interface VillainArchetypeChoice {
  id: string
  /** Its abilities, including any it always has (source 'archetype.fixed'). */
  abilities: VillainAbilityPick[]
}

export interface UpgradeChoice {
  id: string
  /** The upgrade's abilities, with their blanks filled in. */
  abilities: VillainAbilityPick[]
  /** Villainous Vehicle: the vehicle's die (it's built as a lieutenant), and the vehicle abilities chosen (source 'vehicle'). */
  vehicle?: { die?: Die; abilities: VillainAbilityPick[] }
}

/** Who the villain is, and the finishing touches (p. 208). */
export const VILLAIN_DETAIL_FIELDS = ['name', 'alias', 'concept', 'appearance', 'costume', 'mannerisms', 'motivation', 'ties'] as const
export type VillainDetailField = (typeof VILLAIN_DETAIL_FIELDS)[number]
export type VillainDetails = Record<VillainDetailField, string>

/** How many heroes a villain is built to face unless the GM says otherwise. */
export const DEFAULT_HERO_COUNT = 4

export interface Villain {
  id: string
  createdAt: string
  updatedAt: string
  details: VillainDetails
  /** The GM's names for traits that need one (the roleplaying quality, ...), keyed by traitKey. */
  traitNames: Record<string, string>
  approach: ApproachChoice | null
  archetype: VillainArchetypeChoice | null
  upgrades: UpgradeChoice[]
  /** A major villain's villainous mastery (p. 238). */
  mastery: VillainAbilityPick | null
  /** How many heroes the villain is built to face: 5 Health each (p. 239). */
  heroCount: number
  notes?: string
}

export function emptyVillainDetails(): VillainDetails {
  return { name: '', alias: '', concept: '', appearance: '', costume: '', mannerisms: '', motivation: '', ties: '' }
}

/** Creates a blank villain. `now` and `id` are injectable for tests. */
export function createVillain(options: { id?: string; now?: Date } = {}): Villain {
  const timestamp = (options.now ?? new Date()).toISOString()
  return {
    id: options.id ?? newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    details: emptyVillainDetails(),
    traitNames: {},
    approach: null,
    archetype: null,
    upgrades: [],
    mastery: null,
    heroCount: DEFAULT_HERO_COUNT,
  }
}

/** The name to show for a villain in lists. */
export function villainDisplayName(villain: Villain): string {
  return villain.details.name.trim() || villain.details.alias.trim() || 'Unnamed villain'
}

/** The GM's name for a trait, if they've given it one. */
export function villainTraitName(villain: Villain, trait: TraitRef): string | undefined {
  return villain.traitNames[traitKey(trait)]
}
