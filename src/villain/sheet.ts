/**
 * A villain's sheet, derived from its choices and the rules data (Phase 5; Core Rules
 * p. 208–239, data/rules/villain-creation.md), with warnings for anything that breaks the
 * rules. Like heroes, nothing is blocked: problems are shown next to their step.
 *
 * - Dice: the approach's power and quality dice, assigned to any powers and qualities, plus
 *   a d8 roleplaying quality. Power Upgrade and Quality Upgrade raise every die of their
 *   kind one size; each die already at d12 gives another ability instead, from the
 *   archetype's list (powers) or the approach's (qualities), so those lists' counts grow.
 * - Abilities: the approach's and the archetype's choices (with their restrictions, reusing
 *   the hero checks in ../creation/abilities.ts), the archetype's fixed abilities, each
 *   upgrade's abilities, a Villainous Vehicle's abilities, and a major villain's mastery.
 *   Villains can always use all their abilities (no zones).
 * - Health = approach base + archetype modifier + 5 × heroes + upgrade Health, with zone
 *   ranges from the chart.
 */
import { checkChoiceBlock, checkPickFor } from '../creation/abilities'
import { fillTextWith } from '../creation/sheet'
import { ROLEPLAYING_QUALITY } from '../creation/traits'
import { getTrait, traitKey, type TraitRef } from '../rules/catalog'
import { compareDice, sortDice, stepDie } from '../rules/dice'
import { parseSlots } from '../rules/slots'
import type { Ability, AbilityChoice, AbilityType, Die, HealthRange, TraitKind } from '../rules/types'
import { villainApproachesById, villainArchetypesById, villainHealth, villainMasteries, villainRoleplayingQuality, villainUpgradesById } from '../rules/villain-data'
import type { VillainStatusRule, VillainUpgrade } from '../rules/villain-types'
import { villainDisplayName, type Villain, type VillainAbilityPick, type VillainAbilitySource } from './model'

export type VillainStepId = 'approach' | 'archetype' | 'upgrades' | 'health' | 'details'

export interface VillainWarning {
  step: VillainStepId
  code: string
  message: string
}

export interface VillainTrait {
  trait: TraitRef
  die: Die
  name: string
}

export interface VillainSheetAbility {
  source: VillainAbilitySource
  /** The GM's name for it, or the ability's own. */
  name: string
  baseName: string
  type: AbilityType
  /** The game text with its blanks filled in. */
  text: string
  /** The upgrade it comes with, for upgrade and vehicle abilities. */
  upgrade?: string
}

export interface VillainHealthInfo {
  max: number
  heroCount: number
  /** How the max adds up, for the sheet. */
  parts: { label: string; value: number }[]
  /** The zone ranges from the chart, when the max is on it. */
  ranges?: HealthRange
}

export interface VillainSheet {
  name: string
  alias: string
  approach?: string
  archetype?: string
  /** A villain with upgrades is a major villain (p. 235). */
  major: boolean
  powers: VillainTrait[]
  qualities: VillainTrait[]
  abilities: VillainSheetAbility[]
  upgrades: { name: string; summary?: string }[]
  vehicle?: { die?: Die; abilities: VillainSheetAbility[] }
  mastery?: VillainSheetAbility
  health?: VillainHealthInfo
  status?: VillainStatusRule
  warnings: VillainWarning[]
}

const ROLEPLAYING_KEY = traitKey(ROLEPLAYING_QUALITY)

/** A trait's name for this villain: the GM's, or the catalog's. */
export function villainTraitLabel(villain: Villain, trait: TraitRef): string {
  return villain.traitNames[traitKey(trait)]?.trim() || (traitKey(trait) === ROLEPLAYING_KEY ? 'Roleplaying quality' : getTrait(trait)?.name) || trait.id
}

const diceList = (dice: readonly Die[]) => sortDice(dice).reverse().join(', ')
const sameDice = (a: readonly Die[], b: readonly Die[]) => sortDice(a).join() === sortDice(b).join()

/** The upgrades the villain took that exist in the data, each once (repeats are warned about). */
function knownUpgrades(villain: Villain): VillainUpgrade[] {
  const seen = new Set<string>()
  return villain.upgrades.flatMap((u) => {
    const upgrade = villainUpgradesById.get(u.id)
    if (!upgrade || seen.has(u.id)) return []
    seen.add(u.id)
    return [upgrade]
  })
}

/** The villain's dice, and how many extra abilities upgraded d12s give each list. */
export function villainTraits(villain: Villain): { traits: VillainTrait[]; extra: Record<'approach' | 'archetype', number>; warnings: VillainWarning[] } {
  const warnings: VillainWarning[] = []
  const warn = (code: string, message: string) => warnings.push({ step: 'approach', code, message })
  const choice = villain.approach
  const approach = choice && villainApproachesById.get(choice.id)
  const traits = new Map<string, VillainTrait>()
  if (choice && approach) {
    for (const a of choice.traits) {
      const key = traitKey(a.trait)
      if (key === ROLEPLAYING_KEY) {
        warn('roleplaying-assigned', 'The roleplaying quality comes with the approach at d8; assign the approach’s dice to other qualities.')
        continue
      }
      if (!getTrait(a.trait)) warn('unknown-trait', `${a.trait.id} isn't a power or quality on the list.`)
      if (traits.has(key)) warn('trait-twice', `${villainTraitLabel(villain, a.trait)} has more than one die.`)
      else traits.set(key, { trait: a.trait, die: a.die, name: villainTraitLabel(villain, a.trait) })
    }
    const dice = (kind: TraitKind) => choice.traits.filter((a) => a.trait.kind === kind && traitKey(a.trait) !== ROLEPLAYING_KEY).map((a) => a.die)
    if (!sameDice(dice('power'), approach.powerDice)) warn('power-dice', `Assign ${approach.name}'s power dice to powers: ${diceList(approach.powerDice)}.`)
    if (!sameDice(dice('quality'), approach.qualityDice)) warn('quality-dice', `Assign ${approach.name}'s quality dice to qualities: ${diceList(approach.qualityDice)}.`)
  }
  if (approach) traits.set(ROLEPLAYING_KEY, { trait: ROLEPLAYING_QUALITY, die: villainRoleplayingQuality.die, name: villainTraitLabel(villain, ROLEPLAYING_QUALITY) })

  // Power Upgrade and Quality Upgrade (p. 236–237).
  const extra = { approach: 0, archetype: 0 }
  for (const upgrade of knownUpgrades(villain)) {
    const effect = upgrade.effect
    if (effect?.kind !== 'upgradeAllDice') continue
    for (const [key, t] of traits) {
      if (!effect.targets.includes(t.trait.kind) || (effect.excludeRoleplayingQuality && key === ROLEPLAYING_KEY)) continue
      if (compareDice(t.die, 'd12') >= 0) extra[effect.overflow === 'gainArchetypeAbility' ? 'archetype' : 'approach']++
      else traits.set(key, { ...t, die: stepDie(t.die, effect.steps, { max: 'd12' }) })
    }
  }
  return { traits: [...traits.values()], extra, warnings }
}

const byDie = (a: VillainTrait, b: VillainTrait) => compareDice(b.die, a.die) || a.name.localeCompare(b.name)

/**
 * Whether the abilities' uses fit a "two share one, the third uses another" pattern: the
 * uses must be of the pattern's kind, and the counts per trait fit into the groups (abilities
 * that use nothing are exempt, so the rest only have to fit; data/README.md). `extra` extra
 * abilities (from Quality Upgrade) may use anything (ruling 57), so up to that many uses are
 * left out of the fit.
 */
export function fitsUsePattern(uses: readonly TraitRef[], pattern: { uses: TraitKind; groups: number[] }, extra = 0): boolean {
  const fits = (rest: readonly TraitRef[]) => {
    if (rest.some((u) => u.kind !== pattern.uses)) return false
    const counts = [...rest.reduce((m, u) => m.set(traitKey(u), (m.get(traitKey(u)) ?? 0) + 1), new Map<string, number>()).values()].sort((a, b) => b - a)
    const groups = [...pattern.groups].sort((a, b) => b - a)
    return counts.length <= groups.length && counts.every((c, i) => c <= groups[i]!)
  }
  // Try leaving out each choice of up to `extra` uses (a handful of abilities, so this is small).
  const search = (from: number, left: number, kept: TraitRef[]): boolean => {
    if (from === uses.length) return fits(kept)
    return search(from + 1, left, [...kept, uses[from]!]) || (left > 0 && search(from + 1, left - 1, kept))
  }
  return search(0, extra, [])
}

export function buildVillainSheet(villain: Villain): VillainSheet {
  const { traits, extra, warnings } = villainTraits(villain)
  const label = (t: TraitRef) => villainTraitLabel(villain, t)
  const warnAt = (step: VillainStepId, code: string, message: string) => warnings.push({ step, code, message })
  const toSheet = (ability: Ability, pick: VillainAbilityPick | undefined, source: VillainAbilitySource, upgrade?: string): VillainSheetAbility => ({
    source,
    name: pick?.customName?.trim() || ability.name,
    baseName: ability.name,
    type: ability.type,
    text: fillTextWith(label, ability.text, pick?.uses, pick?.blanks),
    ...(upgrade ? { upgrade } : {}),
  })
  const abilities: VillainSheetAbility[] = []

  /** A list to choose from: checks the picks, and adds them to the sheet. */
  const chooseFrom = (step: VillainStepId, block: AbilityChoice & { options: Ability[] }, count: number, picks: readonly VillainAbilityPick[], source: VillainAbilitySource, what: string, upgrade?: string) => {
    const result = checkChoiceBlock({ step, traits, label, block: { ...block, count }, available: block.options, picks, source: what })
    warnings.push(...result.warnings)
    if (block.sameUsePattern && !fitsUsePattern(result.uses, block.sameUsePattern, Math.max(0, count - block.count))) warnAt(step, 'use-pattern', `${what}: ${block.constraint ?? 'they don’t follow the pattern of powers or qualities they must use.'}`)
    const taken: VillainSheetAbility[] = []
    for (const pick of picks) {
      const ability = block.options.find((a) => a.name === pick.name)
      if (ability) taken.push(toSheet(ability, pick, source, upgrade))
    }
    return taken
  }

  /** Abilities that come with something: each is on the sheet; one with blanks needs a pick filling them. */
  const fixed = (step: VillainStepId, list: readonly Ability[], picks: readonly VillainAbilityPick[], source: VillainAbilitySource, upgrade?: string) => {
    for (const ability of list) {
      const matching = picks.filter((p) => p.source === source && p.name === ability.name)
      if (matching.length > 1) warnAt(step, 'ability-twice', `${ability.name} is recorded more than once.`)
      const pick = matching[0]
      if (pick) warnings.push(...checkPickFor({ step, traits, label, ability, pick }))
      else if (parseSlots(ability.text).length) warnAt(step, 'fixed-unfilled', `Fill in the blanks for ${ability.name}.`)
      abilities.push(toSheet(ability, pick, source, upgrade))
    }
    for (const pick of picks.filter((p) => p.source === source && !list.some((a) => a.name === p.name))) warnAt(step, 'unknown-ability', `${pick.name} doesn't come with this.`)
  }

  /** Picks recorded in the wrong place (from another list) don't count; say so. */
  const strays = (step: VillainStepId, picks: readonly VillainAbilityPick[], sources: readonly VillainAbilitySource[]) => {
    for (const pick of picks.filter((p) => !sources.includes(p.source))) warnAt(step, 'misplaced-ability', `${pick.name} is recorded in the wrong place; take it again from its list.`)
  }

  // The approach.
  const approachChoice = villain.approach
  const approach = approachChoice && villainApproachesById.get(approachChoice.id)
  if (!approachChoice) warnAt('approach', 'approach-missing', 'Choose an approach.')
  else if (!approach) warnAt('approach', 'unknown-entry', `${approachChoice.id} isn't an approach.`)
  else {
    const picks = approachChoice.abilities.filter((p) => p.source === 'approach')
    strays('approach', approachChoice.abilities, ['approach'])
    abilities.push(...chooseFrom('approach', approach.abilities, approach.abilities.count + extra.approach, picks, 'approach', `${approach.name} abilities`))
  }

  // The archetype.
  const archetypeChoice = villain.archetype
  const archetype = archetypeChoice && villainArchetypesById.get(archetypeChoice.id)
  if (!archetypeChoice) warnAt('archetype', 'archetype-missing', 'Choose an archetype.')
  else if (!archetype) warnAt('archetype', 'unknown-entry', `${archetypeChoice.id} isn't a villain archetype.`)
  else {
    fixed('archetype', archetype.fixedAbilities ?? [], archetypeChoice.abilities, 'archetype.fixed')
    const picks = archetypeChoice.abilities.filter((p) => p.source === 'archetype')
    strays('archetype', archetypeChoice.abilities, ['archetype', 'archetype.fixed'])
    abilities.push(...chooseFrom('archetype', archetype.abilities, archetype.abilities.count + extra.archetype, picks, 'archetype', `${archetype.name} abilities`))
  }

  // Upgrades (p. 235–238).
  const seen = new Set<string>()
  let vehicle: VillainSheet['vehicle']
  for (const choice of villain.upgrades) {
    const upgrade = villainUpgradesById.get(choice.id)
    if (!upgrade) {
      warnAt('upgrades', 'unknown-entry', `${choice.id} isn't an upgrade.`)
      continue
    }
    if (seen.has(choice.id)) {
      warnAt('upgrades', 'upgrade-twice', `You took ${upgrade.name} more than once.`)
      continue
    }
    seen.add(choice.id)
    fixed('upgrades', upgrade.abilities ?? [], choice.abilities, 'upgrade', upgrade.name)
    strays('upgrades', choice.abilities, ['upgrade'])
    strays('upgrades', choice.vehicle?.abilities ?? [], ['vehicle'])
    if (upgrade.lieutenantOptions && upgrade.vehicleAbilities) {
      const option = upgrade.lieutenantOptions.find((o) => o.die === choice.vehicle?.die)
      if (!option) warnAt('upgrades', 'vehicle-die', `Choose the die for your ${upgrade.name} (${upgrade.lieutenantOptions.map((o) => o.die).join(', ')}).`)
      const picks = (choice.vehicle?.abilities ?? []).filter((p) => p.source === 'vehicle')
      const block = { count: option?.abilityCount ?? 0, options: upgrade.vehicleAbilities }
      const taken = option ? chooseFrom('upgrades', block, option.abilityCount, picks, 'vehicle', `${upgrade.name} abilities`, upgrade.name) : []
      vehicle = { ...(choice.vehicle?.die ? { die: choice.vehicle.die } : {}), abilities: taken }
    } else if (choice.vehicle) {
      warnAt('upgrades', 'not-a-vehicle', `${upgrade.name} doesn't come with a vehicle.`)
    }
  }
  const upgrades = knownUpgrades(villain)

  // A major villain's mastery (p. 238).
  let mastery: VillainSheetAbility | undefined
  const masteryPick = villain.mastery
  const masteryAbility = masteryPick && villainMasteries.options.find((m) => m.name === masteryPick.name)
  if (masteryPick && !masteryAbility) warnAt('upgrades', 'unknown-entry', `${masteryPick.name} isn't a villainous mastery.`)
  if (masteryAbility) mastery = toSheet(masteryAbility, masteryPick, 'mastery')
  if (upgrades.length && !masteryPick) warnAt('upgrades', 'mastery-missing', 'A villain with upgrades takes one villainous mastery.')
  if (!upgrades.length && masteryPick) warnAt('upgrades', 'mastery-minor', 'Only a villain with upgrades takes a villainous mastery.')

  // Health (p. 239).
  let health: VillainHealthInfo | undefined
  if (!Number.isInteger(villain.heroCount) || villain.heroCount < 1) warnAt('health', 'hero-count', 'The villain needs to face at least one hero.')
  else if (approach && archetype) {
    const parts = [
      { label: `${approach.name} base`, value: approach.baseHealth },
      { label: `${archetype.name} modifier`, value: archetype.healthModifier },
      { label: `${villain.heroCount} ${villain.heroCount === 1 ? 'hero' : 'heroes'} × 5`, value: 5 * villain.heroCount },
      ...upgrades.filter((u) => u.health).map((u) => ({ label: u.name, value: u.health })),
    ]
    const max = parts.reduce((sum, p) => sum + p.value, 0)
    const ranges = villainHealth.ranges.find((r) => r.max === max || (r.orMore && max >= r.max))
    health = { max, heroCount: villain.heroCount, parts, ...(ranges ? { ranges: { max, green: [max, ranges.green[1]], yellow: ranges.yellow, red: ranges.red } } : {}) }
    if (!ranges) warnAt('health', 'off-chart', `Health ${max} isn't on the villain Health chart, so it has no zone ranges.`)
  }

  return {
    name: villainDisplayName(villain),
    alias: villain.details.alias.trim(),
    ...(approach ? { approach: approach.name } : {}),
    ...(archetype ? { archetype: archetype.name } : {}),
    major: upgrades.length > 0,
    powers: traits.filter((t) => t.trait.kind === 'power').sort(byDie),
    qualities: traits.filter((t) => t.trait.kind === 'quality').sort(byDie),
    abilities,
    upgrades: upgrades.map((u) => ({ name: u.name, ...(u.summary ? { summary: u.summary } : {}) })),
    ...(vehicle ? { vehicle } : {}),
    ...(mastery ? { mastery } : {}),
    ...(health ? { health } : {}),
    ...(archetype ? { status: archetype.status } : {}),
    warnings,
  }
}
