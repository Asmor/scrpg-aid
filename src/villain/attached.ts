/**
 * Templates that come with a villain (the villain wizard spec, section 5): Mook Squad's signature
 * minions and the Villainous Vehicle, built in the wizard and saved as a lieutenant template in
 * the library. Pure: the wizard does the saving.
 */
import { createLieutenantTemplate, type LieutenantTemplate, type MinionTemplate, type TemplateAbility } from '../template/model'
import type { BasicAction } from '../rules/types'
import { villainUpgradesById } from '../rules/villain-data'
import type { VillainUpgrade } from '../rules/villain-types'
import { villainDisplayName, type UpgradeChoice, type Villain, type VillainAttachment } from './model'
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
 * The vehicle as a lieutenant template: its name, die and vehicle abilities (their text filled in)
 * from the wizard, on top of `existing` (its id, tags, notes, abilities that aren't vehicle
 * abilities, and anything else the GM changed in the library). A new one gets the villain's tags
 * and comes alone (a group of 1). Undefined without the upgrade or a die.
 */
export function vehicleTemplate(villain: Villain, existing?: LieutenantTemplate, now: Date = new Date()): LieutenantTemplate | undefined {
  const choice = villain.upgrades.find((u) => u.id === VILLAINOUS_VEHICLE)
  const vehicle = buildVillainSheet(villain).vehicle
  if (!choice || !vehicle?.die) return undefined
  const built: TemplateAbility[] = vehicle.abilities.map((a) => ({ name: a.name, type: a.type === 'A/I' ? 'A' : a.type, text: a.text, ...(a.saveBonus ? { saveBonus: a.saveBonus } : {}) }))
  const base = existing ?? { ...createLieutenantTemplate({ now }), groupSize: 1, tags: [...villain.tags] }
  // The wizard only manages vehicle abilities; others the GM gave the template stay.
  const vehicleNames = new Set(villainUpgradesById.get(VILLAINOUS_VEHICLE)?.vehicleAbilities?.map((a) => a.name) ?? [])
  const kept = (existing?.abilities ?? []).filter((a) => !vehicleNames.has(a.name))
  return { ...base, name: vehicleName(villain), die: vehicle.die, abilities: [...built, ...kept], updatedAt: now.toISOString() }
}

/**
 * The wizard's vehicle build from a lieutenant template in the library ("Use a lieutenant from
 * your library"): its name, its die if the upgrade offers it, and the vehicle abilities it has.
 */
export function vehicleFromTemplate(t: Pick<LieutenantTemplate, 'name' | 'die' | 'abilities'>, upgrade: VillainUpgrade): NonNullable<UpgradeChoice['vehicle']> {
  const has = new Set(t.abilities.map((a) => a.name))
  return {
    name: t.name,
    ...(upgrade.lieutenantOptions?.some((o) => o.die === t.die) ? { die: t.die } : {}),
    abilities: (upgrade.vehicleAbilities ?? []).filter((a) => has.has(a.name)).map((a) => ({ source: 'vehicle' as const, name: a.name })),
  }
}

/** A "Comes with" line: "Burglar minions (signature)", "Siege Crawler, d10 lieutenant (vehicle)". */
export function comesWithLabel(role: VillainAttachment['role'], name: string, die: string): string {
  return role === 'signature' ? `${name} minions (signature)` : `${name}, ${die} lieutenant (vehicle)`
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
