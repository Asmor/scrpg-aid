/**
 * Templates that come with a villain (the villain wizard spec, section 5): Mook Squad's signature
 * minions and the Villainous Vehicle, built in the wizard and saved as a lieutenant template in
 * the library. Pure: the wizard does the saving.
 */
import { createLieutenantTemplate, type LieutenantTemplate, type MinionTemplate, type TemplateAbility } from '../template/model'
import type { BasicAction } from '../rules/types'
import { villainDisplayName, type Villain, type VillainAttachment } from './model'
import { buildVillainSheet } from './sheet'

export const MOOK_SQUAD = 'mook-squad'
export const VILLAINOUS_VEHICLE = 'villainous-vehicle'

/** The attachment in a role, if any. */
export function attachedAs(villain: Villain, role: VillainAttachment['role']): VillainAttachment | undefined {
  return villain.attached.find((a) => a.role === role)
}

/** Sets (or, with no id, removes) the template in a role; a villain has at most one per role. */
export function setAttached(villain: Villain, role: VillainAttachment['role'], templateId: string | undefined): void {
  villain.attached = villain.attached.filter((a) => a.role !== role)
  if (templateId) villain.attached.push({ templateId, kind: role === 'vehicle' ? 'lieutenant' : 'minion', role })
}

/** The vehicle's name: the GM's, or "<villain>'s vehicle". */
export function vehicleName(villain: Villain): string {
  const vehicle = villain.upgrades.find((u) => u.id === VILLAINOUS_VEHICLE)?.vehicle
  return vehicle?.name?.trim() || `${villainDisplayName(villain)}'s vehicle`
}

/**
 * The vehicle as a lieutenant template: its name, die and abilities (their text filled in) from
 * the wizard, on top of `existing` (its id, tags, notes and anything else the GM changed in the
 * library). A new one gets the villain's tags and comes alone (a group of 1). Undefined without the
 * upgrade or a die.
 */
export function vehicleTemplate(villain: Villain, existing?: LieutenantTemplate, now: Date = new Date()): LieutenantTemplate | undefined {
  const choice = villain.upgrades.find((u) => u.id === VILLAINOUS_VEHICLE)
  const vehicle = buildVillainSheet(villain).vehicle
  if (!choice || !vehicle?.die) return undefined
  const abilities: TemplateAbility[] = vehicle.abilities.map((a) => ({ name: a.name, type: a.type === 'A/I' ? 'A' : a.type, text: a.text }))
  const base = existing ?? { ...createLieutenantTemplate({ now }), groupSize: 1, tags: [...villain.tags] }
  return { ...base, name: vehicleName(villain), die: vehicle.die, abilities, updatedAt: now.toISOString() }
}

/** "Lieutenant · d10 · 3 abilities", for the vehicle's line. */
export function lieutenantLine(t: Pick<LieutenantTemplate, 'die' | 'abilities'>): string {
  return `Lieutenant · ${t.die} · ${t.abilities.length} ${t.abilities.length === 1 ? 'ability' : 'abilities'}`
}

const ACTION_WORD: Record<BasicAction, string> = { attack: 'Attack', defend: 'Defend', boost: 'Boost', hinder: 'Hinder', overcome: 'Overcome' }

/** "Grave Guard · d8 · Attack or Hinder", for the signature-minion picker. */
export function minionLine(t: Pick<MinionTemplate, 'name' | 'die' | 'actions' | 'groupSize'>): string {
  const actions = t.actions === 'any' ? `groups of ${t.groupSize}` : t.actions.map((a) => ACTION_WORD[a]).join(t.actions.length === 2 ? ' or ' : ', ')
  return `${t.name.trim() || 'Unnamed minion'} · ${t.die} · ${actions}`
}
