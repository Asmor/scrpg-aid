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
import type { Defense } from '../play/defense'
import { newId, type PlayHistoryEntry, type PlayMod, type PlayTwist, type TraitAssignment } from '../hero/model'
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
  /**
   * Power Upgrade and Quality Upgrade: the abilities taken for dice already at d12, one each,
   * from the archetype's list (powers) or the approach's (qualities), with those sources.
   */
  extra?: VillainAbilityPick[]
  /**
   * Villainous Vehicle: the vehicle as built in the wizard (it's a lieutenant): its name, die,
   * and the vehicle abilities chosen (source 'vehicle'). The wizard saves it as a lieutenant
   * template in the library and attaches that (role 'vehicle').
   */
  vehicle?: { name?: string; die?: Die; abilities: VillainAbilityPick[] }
}

/** A minion or lieutenant template that comes with the villain (the villain wizard spec, section 5). */
export interface VillainAttachment {
  templateId: string
  kind: 'minion' | 'lieutenant'
  /** Mook Squad's signature minions, or the Villainous Vehicle. */
  role: 'signature' | 'vehicle'
}

/** Villain wizard steps that offer Suggest 3 (the spec, section 4). */
export type SuggestStep = 'approach' | 'archetype' | 'upgrades' | 'mastery'

export type VillainStatus = 'draft' | 'complete'

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
  /** The GM's own labels for organizing the library (docs/design/library/spec.md); see ../library/tags.ts. */
  tags: string[]
  /** A new villain is a draft until the GM finishes it in the wizard; drafts can't be brought into games. */
  status: VillainStatus
  /** A draft's furthest wizard step (1–7), for the library's "Step N of 7" and Continue. */
  furthestStep?: number
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
  /** Templates that come with the villain, brought in with it. */
  attached: VillainAttachment[]
  /** Suggest 3 (unofficial): each step's 3 random ids while it's on. */
  suggest?: Partial<Record<SuggestStep, string[]>>
  notes?: string
}

/** A villain in play, kept in a game next to its copied sheet (../game/model.ts): like a hero's play state, plus what its archetype's status rule needs. */
export interface VillainPlayState {
  /** Current Health; until set, the villain is at its max. */
  health?: number
  /** Heroes in this scene, when different from the number it's built for (5 Health each). */
  heroCount?: number
  reactionUsed: boolean
  /** It has used its once-per-scene Overcome to advance the scene tracker (p. 154). */
  sceneAdvanced?: true
  mods: PlayMod[]
  /** Defends protecting the villain until its next turn starts (ruling 65). */
  defenses?: Defense[]
  /** Minor twists only: villains never take major twists (p. 154–155). */
  twists: PlayTwist[]
  history: PlayHistoryEntry[]
  /** A count-based status rule's count, e.g. minions in the scene. */
  statusCount?: number
  /** A weakness-based status rule's tier (index into the archetype's tiers). */
  weaknessTier?: number
  /** The Titan: how many parts of its challenge are complete. */
  challengeParts?: number
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
    tags: [],
    status: 'complete',
    details: emptyVillainDetails(),
    traitNames: {},
    approach: null,
    archetype: null,
    upgrades: [],
    mastery: null,
    heroCount: DEFAULT_HERO_COUNT,
    attached: [],
  }
}

export function isVillainDraft(villain: Pick<Villain, 'status'>): boolean {
  return villain.status === 'draft'
}

/** The name to show for a villain in lists. */
export function villainDisplayName(villain: Villain): string {
  return villain.details.name.trim() || villain.details.alias.trim() || 'Unnamed villain'
}

/** The GM's name for a trait, if they've given it one. */
export function villainTraitName(villain: Villain, trait: TraitRef): string | undefined {
  return villain.traitNames[traitKey(trait)]
}

/** A copy of the villain to save as a new one, like ../hero/model.ts duplicateHero. */
export function duplicateVillain(villain: Villain, options: { id?: string; now?: Date } = {}): Villain {
  const timestamp = (options.now ?? new Date()).toISOString()
  const rest = structuredClone(villain)
  const details = { ...rest.details }
  if (details.name.trim()) details.name = `${details.name.trim()} (copy)`
  else if (details.alias.trim()) details.alias = `${details.alias.trim()} (copy)`
  return { ...rest, id: options.id ?? newId(), createdAt: timestamp, updatedAt: timestamp, details }
}
