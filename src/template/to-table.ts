/**
 * Templates and the game table (scrpg-aid-designs/npcs/spec.md, sections 2 and 3): what a template
 * brings in (a fresh copy each time), and the template quick add's "Save to library" makes.
 * Pure.
 */
import type { CharColor } from '../colors/palette'
import type { NpcGroup } from '../game/model'
import type { Die } from '../rules/types'
import { createChallengeTemplate, createLieutenantTemplate, createMinionTemplate, type ChallengeTemplate, type LieutenantTemplate, type MinionTemplate } from './model'

/** A group from a minion or lieutenant template: its name, die, kind and actions (and a lieutenant's abilities), with as many members as asked. */
export function groupFromTemplate(t: MinionTemplate | LieutenantTemplate, kind: NpcGroup['kind'], count: number, hidden: boolean) {
  const abilities = 'abilities' in t && t.abilities.length ? { abilities: t.abilities } : {}
  return { kind, name: t.name, die: t.die, count, hidden, actions: t.actions, templateId: t.id, ...abilities, ...(t.color ? { color: t.color } : {}) }
}

/** A challenge from a template: its steps, their labels, what it is and what happens when it's done. */
export function challengeFromTemplate(t: ChallengeTemplate, hidden: boolean) {
  return { ...(t.color ? { color: t.color } : {}), name: t.name, steps: t.steps.length, hidden, labels: t.steps.map((s) => s.label), description: t.description, whenDone: t.done, templateId: t.id }
}

/** Quick add's "Save to library": a minion or lieutenant template from the group added. */
export function templateFromGroup(group: { kind: NpcGroup['kind']; name: string; die: Die; count: number; color?: CharColor }): MinionTemplate | LieutenantTemplate {
  const base = group.kind === 'minions' ? createMinionTemplate() : createLieutenantTemplate()
  return { ...base, ...(group.color ? { color: group.color } : {}), name: group.name.trim() || (group.kind === 'minions' ? 'Minions' : 'Lieutenants'), die: group.die, groupSize: group.count }
}

/** Quick add's "Save to library": a challenge template with that many unlabeled steps. */
export function templateFromChallenge(challenge: { name: string; steps: number; color?: CharColor }): ChallengeTemplate {
  return { ...createChallengeTemplate(), ...(challenge.color ? { color: challenge.color } : {}), name: challenge.name.trim() || 'Challenge', steps: Array.from({ length: challenge.steps }, () => ({ label: '' })) }
}
