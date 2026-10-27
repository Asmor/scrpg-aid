/** Typed access to the villain rules data in data/villains/ (Phase 5), like ./data.ts. */
import approachesJson from '../../data/villains/approaches.json'
import archetypesJson from '../../data/villains/archetypes.json'
import healthJson from '../../data/villains/health.json'
import upgradesJson from '../../data/villains/upgrades.json'
import { typed } from './data'
import type { Ability, Die, PageRef } from './types'
import type { VillainApproach, VillainArchetype, VillainHealthChart, VillainUpgrade } from './villain-types'

export const villainApproaches = typed<VillainApproach[]>(approachesJson.approaches)
export const villainRoleplayingQuality = typed<PageRef & { die: Die }>(approachesJson.roleplayingQuality)
export const villainArchetypes = typed<VillainArchetype[]>(archetypesJson.archetypes)
export const villainUpgrades = typed<VillainUpgrade[]>(upgradesJson.upgrades)
export const villainMasteries = typed<PageRef & { summary: string; options: Ability[] }>(upgradesJson.masteries)
export const villainHealth = typed<VillainHealthChart>(healthJson)

const byId = <T extends { id: string }>(items: readonly T[]) => new Map(items.map((i) => [i.id, i]))
export const villainApproachesById = byId(villainApproaches)
export const villainArchetypesById = byId(villainArchetypes)
export const villainUpgradesById = byId(villainUpgrades)
