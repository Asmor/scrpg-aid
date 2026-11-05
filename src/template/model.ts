/**
 * NPC templates in the library (docs/design/npcs/spec.md, section 2): minions, lieutenants,
 * challenges and environments the GM prepares, then brings into games, where each copy starts
 * fresh. Templates hold no play state.
 *
 * Versioning (./serialize.ts) follows the hero's rules.
 */
import type { CharColor } from '../colors/palette'
import { newId } from '../hero/model'
import type { BasicAction, Die } from '../rules/types'

/** The template kinds, by name. */
export type TemplateKindName = 'minion' | 'lieutenant' | 'challenge' | 'environment'

/** What every template has: the library's fields and a name. */
export interface TemplateBase {
  id: string
  createdAt: string
  updatedAt: string
  /** The GM's own labels (docs/design/library/spec.md). */
  tags: string[]
  name: string
  /** Unset: by side (docs/design/character-colors/spec.md). */
  color?: CharColor
}

export { MAX_GROUP_SIZE, MAX_STEPS } from '../game/model'

export interface MinionTemplate extends TemplateBase {
  /** The die each member starts with. */
  die: Die
  /** How many usually appear together (1–20): the count a group starts with. */
  groupSize: number
  /** The basic actions it can take: any, or a chosen few. */
  actions: 'any' | BasicAction[]
  notes: string
}

/** A lieutenant's ability: Action, Reaction or Inherent, with text that may name actions (shown with their icons). */
export interface TemplateAbility {
  name: string
  type: 'A' | 'R' | 'I'
  text: string
  /** Added to each damage save's result (a vehicle's Sturdy, from the rules data). */
  saveBonus?: number
}

export interface LieutenantTemplate extends MinionTemplate {
  abilities: TemplateAbility[]
}

/** A challenge's step: an optional label ("Vent the pressure"). */
export interface ChallengeStep {
  label: string
}

export interface ChallengeTemplate extends TemplateBase {
  description: string
  steps: ChallengeStep[]
  /** What happens when every step is done. */
  done: string
}

/** One of an environment's three aspects: its name and its die, one of the environment dice. */
export interface EnvironmentAspect {
  name: string
  die: Die
}

/**
 * A twist: a suggestion in free text for a zone, minor or major. The app shows it and tracks its
 * use but never applies its mechanics.
 */
export interface EnvironmentTwist {
  id: string
  zone: 'green' | 'yellow' | 'red'
  kind: 'minor' | 'major'
  name?: string
  text: string
}

/** A minion, lieutenant or challenge template the environment brings along. */
export interface AttachedTemplate {
  kind: 'minion' | 'lieutenant' | 'challenge'
  templateId: string
}

export const ASPECT_COUNT = 3
export const MAX_TWISTS = 60
export const MAX_ATTACHED = 20

export interface EnvironmentTemplate extends TemplateBase {
  description: string
  /** Always three. */
  aspects: EnvironmentAspect[]
  twists: EnvironmentTwist[]
  attached: AttachedTemplate[]
}

const stamp = (options: { id?: string; now?: Date }) => {
  const at = (options.now ?? new Date()).toISOString()
  return { id: options.id ?? newId(), createdAt: at, updatedAt: at, tags: [], name: '' }
}

/** A new minion: a d6, in groups of 4, taking any basic action. `id` and `now` are injectable for tests. */
export function createMinionTemplate(options: { id?: string; now?: Date } = {}): MinionTemplate {
  return { ...stamp(options), die: 'd6', groupSize: 4, actions: 'any', notes: '' }
}

/** A new lieutenant: a d8, in pairs, taking any basic action, with no abilities yet. */
export function createLieutenantTemplate(options: { id?: string; now?: Date } = {}): LieutenantTemplate {
  return { ...stamp(options), die: 'd8', groupSize: 2, actions: 'any', notes: '', abilities: [] }
}

/** A new challenge with three unlabeled steps (the table's quick-add default). */
export function createChallengeTemplate(options: { id?: string; now?: Date } = {}): ChallengeTemplate {
  return { ...stamp(options), description: '', steps: [{ label: '' }, { label: '' }, { label: '' }], done: '' }
}

/** A new environment: three unnamed d8 aspects, no twists, nothing attached. */
export function createEnvironmentTemplate(options: { id?: string; now?: Date } = {}): EnvironmentTemplate {
  return { ...stamp(options), description: '', aspects: Array.from({ length: ASPECT_COUNT }, () => ({ name: '', die: 'd8' as const })), twists: [], attached: [] }
}

/** A new twist for a zone: minor, with no text yet. */
export function createTwist(zone: EnvironmentTwist['zone']): EnvironmentTwist {
  return { id: newId(), zone, kind: 'minor', text: '' }
}

/** A copy with a new id, "(copy)" after the name, and the same tags. */
export function duplicateTemplate<T extends TemplateBase>(doc: T, options: { id?: string; now?: Date } = {}): T {
  const at = (options.now ?? new Date()).toISOString()
  return { ...structuredClone(doc), id: options.id ?? newId(), createdAt: at, updatedAt: at, name: `${doc.name.trim() || 'Unnamed'} (copy)` }
}

/** A template's name, or a placeholder until it has one. */
export function templateName(doc: Pick<TemplateBase, 'name'>, kind: TemplateKindName): string {
  return doc.name.trim() || `Unnamed ${kind}`
}
