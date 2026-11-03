/**
 * NPC templates in the library (docs/design/npcs/spec.md, section 2): minions, lieutenants and
 * challenges the GM prepares, then brings into games, where each copy starts fresh. Templates
 * hold no play state. Environments come in NPCs phase 3.
 *
 * Versioning (./serialize.ts) follows the hero's rules.
 */
import { newId } from '../hero/model'
import type { BasicAction, Die } from '../rules/types'

/** What every template has: the library's fields and a name. */
export interface TemplateBase {
  id: string
  createdAt: string
  updatedAt: string
  /** The GM's own labels (docs/design/library/spec.md). */
  tags: string[]
  name: string
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

/** A copy with a new id, "(copy)" after the name, and the same tags. */
export function duplicateTemplate<T extends TemplateBase>(doc: T, options: { id?: string; now?: Date } = {}): T {
  const at = (options.now ?? new Date()).toISOString()
  return { ...structuredClone(doc), id: options.id ?? newId(), createdAt: at, updatedAt: at, name: `${doc.name.trim() || 'Unnamed'} (copy)` }
}

/** A template's name, or a placeholder until it has one. */
export function templateName(doc: Pick<TemplateBase, 'name'>, kind: 'minion' | 'lieutenant' | 'challenge'): string {
  return doc.name.trim() || `Unnamed ${kind}`
}
