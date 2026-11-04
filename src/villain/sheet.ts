/**
 * A villain's sheet, derived from its choices and the rules data (Phase 5; Core Rules
 * p. 208–239, data/rules/villain-creation.md), with warnings for anything that breaks the
 * rules. Like heroes, nothing is blocked: problems are shown at their wizard step, each with
 * the field or section it belongs to (../editor/issue-targets.ts).
 *
 * - Dice: the approach's power and quality dice, assigned to any powers and qualities, plus
 *   a d8 roleplaying quality. Power Upgrade and Quality Upgrade raise every die of their
 *   kind one size; each die already at d12 gives another ability instead, from the
 *   archetype's list (powers) or the approach's (qualities). Those are taken in the upgrade's
 *   own list (`extra`), so they don't count toward that list's choice or its pattern (ruling 57).
 * - Abilities: the approach's and the archetype's choices (with their restrictions, reusing
 *   the hero checks in ../creation/abilities.ts), the archetype's fixed abilities, each
 *   upgrade's abilities, a Villainous Vehicle's abilities, and a major villain's mastery.
 *   Villains can always use all their abilities (no zones).
 * - Health = approach base + archetype modifier + per-hero Health × heroes + upgrade Health, with zone
 *   ranges from the chart (villainHealth, villainZones).
 */
import { abilityField, abilityListField, checkChoiceBlock, checkPickFor } from '../creation/abilities'
import { abilityUseOf, actionsOf, fillTextWith, type AbilityUse } from '../creation/sheet'
import { ROLEPLAYING_QUALITY, traitField } from '../creation/traits'
import type { IssueCode } from '../creation/warnings'
import { getTrait, traitKey, type TraitRef } from '../rules/catalog'
import { compareDice, sortDice, stepDie } from '../rules/dice'
import { parseSlots } from '../rules/slots'
import type { Ability, AbilityChoice, AbilityType, Action, Die, HealthRange, TraitKind } from '../rules/types'
import { villainApproachesById, villainArchetypesById, villainHealthChart, villainMasteries, villainRoleplayingQuality, villainUpgradesById } from '../rules/villain-data'
import type { VillainStatusRule, VillainUpgrade } from '../rules/villain-types'
import { villainDisplayName, type Villain, type VillainAbilityPick, type VillainAbilitySource } from './model'

/** The villain wizard's steps (the villain wizard spec, section 3), which warnings belong to. */
export type VillainStepId = 'concept' | 'approach' | 'archetype' | 'upgrades' | 'mastery' | 'health' | 'details'

export interface VillainWarning {
  step: VillainStepId
  code: IssueCode
  message: string
  /** The one field it's about, as for heroes (../creation/warnings.ts RuleWarning.field). */
  field?: string
}

/** A field in an upgrade's well: "upgrade:power-upgrade:extra". */
export const upgradeField = (id: string, what: string) => `upgrade:${id}:${what}`
/** The vehicle's die choice. */
export const VEHICLE_DIE_FIELD = 'vehicle-die'
/** The list of mastery options. */
export const MASTERY_FIELD = 'mastery'
/** The hero-count stepper. */
export const HERO_COUNT_FIELD = 'hero-count'

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
  /** Added to each damage save's result (a vehicle's Sturdy). */
  saveBonus?: number
  /** The powers and qualities filling its trait slots, each once ("Strength"), for the wizard's preview. */
  traits: string[]
  /** The actions its effects are, for the icons. */
  effects: Action[]
  /** What using it rolls and produces, for the game aid. */
  use: AbilityUse
  /** The upgrade it comes with: upgrade and vehicle abilities, and abilities taken for a d12 an upgrade couldn't raise. */
  upgrade?: string
}

/** One term of a villain's max Health (p. 239); `value` is null while its step isn't chosen. */
export interface HealthTerm {
  kind: 'base' | 'modifier' | 'heroes' | 'upgrade'
  label: string
  value: number | null
}

export interface VillainHealthInfo {
  max: number
  heroCount: number
  /** Health each hero adds (p. 239). */
  perHero: number
  /** How the max adds up, for the sheet. */
  parts: (HealthTerm & { value: number })[]
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
  vehicle?: { name?: string; die?: Die; abilities: VillainSheetAbility[] }
  mastery?: VillainSheetAbility
  health?: VillainHealthInfo
  status?: VillainStatusRule
  warnings: VillainWarning[]
}

const ROLEPLAYING_KEY = traitKey(ROLEPLAYING_QUALITY)

/** Health each hero a villain faces adds, from the formula's per-hero term (p. 239). */
export const HEALTH_PER_HERO = (() => {
  const term = villainHealthChart.formula.terms.find((t) => 'perHero' in t)
  if (!term || !('perHero' in term)) throw new Error('data/villains/health.json: the Health formula has no per-hero term')
  return term.perHero
})()

/** A trait's name for this villain: the GM's, or the catalog's. */
export function villainTraitLabel(villain: Villain, trait: TraitRef): string {
  return villain.traitNames[traitKey(trait)]?.trim() || (traitKey(trait) === ROLEPLAYING_KEY ? 'Roleplaying quality' : getTrait(trait)?.name) || trait.id
}

const diceList = (dice: readonly Die[]) => sortDice(dice).reverse().join(', ')
const sameDice = (a: readonly Die[], b: readonly Die[]) => sortDice(a).join() === sortDice(b).join()

/** The upgrades the villain took that exist in the data, each once (repeats are warned about). */
export function knownUpgrades(villain: Villain): VillainUpgrade[] {
  const seen = new Set<string>()
  return villain.upgrades.flatMap((u) => {
    const upgrade = villainUpgradesById.get(u.id)
    if (!upgrade || seen.has(u.id)) return []
    seen.add(u.id)
    return [upgrade]
  })
}

/** A villain with any upgrade is a major villain (p. 235). */
export function isMajorVillain(villain: Villain): boolean {
  return knownUpgrades(villain).length > 0
}

/** What Power Upgrade or Quality Upgrade does to one die: raises it, or (at d12) gives an ability instead. */
export interface DieChange {
  trait: TraitRef
  name: string
  from: Die
  to: Die
  /** It was already d12, so it stays there and the upgrade gives an ability instead. */
  overflow: boolean
}

/** What a dice upgrade did: the dice it changed, and how many abilities it gives from which list. */
export interface DiceUpgrade {
  upgradeId: string
  changes: DieChange[]
  /** The list its extra abilities come from (the upgrade's `overflow`). */
  list: 'approach' | 'archetype'
  /** How many extra abilities it gives: one per die already at d12. */
  extra: number
}

/** The villain's dice, and what each dice upgrade did. */
export function villainTraits(villain: Villain): { traits: VillainTrait[]; upgrades: DiceUpgrade[]; warnings: VillainWarning[] } {
  const warnings: VillainWarning[] = []
  const warn = (code: IssueCode, message: string, field?: string) => warnings.push({ step: 'approach', code, message, ...(field ? { field } : {}) })
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
      if (!getTrait(a.trait)) warn('unknown-trait', `${a.trait.id} isn't a power or quality on the list.`, traitField(a.trait))
      if (traits.has(key)) warn('assigned-twice', `${villainTraitLabel(villain, a.trait)} is already assigned.`, traitField(a.trait))
      else traits.set(key, { trait: a.trait, die: a.die, name: villainTraitLabel(villain, a.trait) })
    }
    const dice = (kind: TraitKind) => choice.traits.filter((a) => a.trait.kind === kind && traitKey(a.trait) !== ROLEPLAYING_KEY).map((a) => a.die)
    if (!sameDice(dice('power'), approach.powerDice)) warn('dice-mismatch', `Assign ${approach.name}'s power dice to powers: ${diceList(approach.powerDice)}.`)
    if (!sameDice(dice('quality'), approach.qualityDice)) warn('dice-mismatch', `Assign ${approach.name}'s quality dice to qualities: ${diceList(approach.qualityDice)}.`)
  }
  if (approach) traits.set(ROLEPLAYING_KEY, { trait: ROLEPLAYING_QUALITY, die: villainRoleplayingQuality.die, name: villainTraitLabel(villain, ROLEPLAYING_QUALITY) })

  // Power Upgrade and Quality Upgrade (p. 236–237).
  const upgrades: DiceUpgrade[] = []
  for (const upgrade of knownUpgrades(villain)) {
    const effect = upgrade.effect
    if (effect?.kind !== 'upgradeAllDice') continue
    const changes: DieChange[] = []
    for (const [key, t] of traits) {
      if (!effect.targets.includes(t.trait.kind) || (effect.excludeRoleplayingQuality && key === ROLEPLAYING_KEY)) continue
      const overflow = compareDice(t.die, 'd12') >= 0
      const to = overflow ? t.die : stepDie(t.die, effect.steps, { max: 'd12' })
      changes.push({ trait: t.trait, name: t.name, from: t.die, to, overflow })
      traits.set(key, { ...t, die: to })
    }
    const list = effect.overflow === 'gainArchetypeAbility' ? 'archetype' : 'approach'
    upgrades.push({ upgradeId: upgrade.id, changes, list, extra: changes.filter((c) => c.overflow).length })
  }
  return { traits: [...traits.values()], upgrades, warnings }
}

const byDie = (a: VillainTrait, b: VillainTrait) => compareDice(b.die, a.die) || a.name.localeCompare(b.name)

/**
 * Whether the abilities' uses fit a "two share one, the third uses another" pattern: the
 * uses must be of the pattern's kind, and the counts per trait fit into the groups (abilities
 * that use nothing are exempt, so the rest only have to fit; data/README.md).
 */
export function fitsUsePattern(uses: readonly TraitRef[], pattern: { uses: TraitKind; groups: number[] }): boolean {
  if (uses.some((u) => u.kind !== pattern.uses)) return false
  const counts = [...uses.reduce((m, u) => m.set(traitKey(u), (m.get(traitKey(u)) ?? 0) + 1), new Map<string, number>()).values()].sort((a, b) => b - a)
  const groups = [...pattern.groups].sort((a, b) => b - a)
  return counts.length <= groups.length && counts.every((c, i) => c <= groups[i]!)
}

/** Whether every trait slot of the picks taken from `options` is filled (a pattern can only be judged then). */
function slotsFilled(options: readonly Ability[], picks: readonly VillainAbilityPick[]): boolean {
  return picks.every((pick) => {
    const ability = options.find((a) => a.name === pick.name)
    if (!ability) return true
    const slots = parseSlots(ability.text).filter((s) => s.type === 'trait').length
    return (pick.uses ?? []).filter(Boolean).length >= slots
  })
}

/** Every ability the villain has from its choices, as data entries (for `makesMinions` and the like). */
function takenAbilities(villain: Villain): Ability[] {
  const approach = villain.approach && villainApproachesById.get(villain.approach.id)
  const archetype = villain.archetype && villainArchetypesById.get(villain.archetype.id)
  const from = (options: readonly Ability[] | undefined, picks: readonly VillainAbilityPick[]) => picks.flatMap((p) => options?.find((a) => a.name === p.name) ?? [])
  const upgrades = villain.upgrades.flatMap((u) => {
    const upgrade = villainUpgradesById.get(u.id)
    if (!upgrade) return []
    return [
      ...(upgrade.abilities ?? []),
      ...from(approach?.abilities.options, (u.extra ?? []).filter((p) => p.source === 'approach')),
      ...from(archetype?.abilities.options, (u.extra ?? []).filter((p) => p.source === 'archetype')),
      ...from(upgrade.vehicleAbilities, u.vehicle?.abilities ?? []),
    ]
  })
  return [
    ...from(approach?.abilities.options, villain.approach?.abilities ?? []),
    ...(archetype?.fixedAbilities ?? []),
    ...from(archetype?.abilities.options, villain.archetype?.abilities ?? []),
    ...upgrades,
  ]
}

/** Whether the villain has an ability that makes minions (ruling 66): what Legion needs. */
export function villainMakesMinions(villain: Villain): boolean {
  return takenAbilities(villain).some((a) => a.makesMinions)
}

/**
 * A villain's max Health for `heroCount` heroes (p. 239), with each term of the formula:
 * the approach's base, the archetype's modifier, so much per hero, and each upgrade's Health
 * (including upgrades that add none). Until the approach and archetype are chosen their terms
 * are null and there's no total.
 */
export function villainHealth(villain: Villain, heroCount: number = villain.heroCount): { total?: number; terms: HealthTerm[] } {
  const approach = villain.approach && villainApproachesById.get(villain.approach.id)
  const archetype = villain.archetype && villainArchetypesById.get(villain.archetype.id)
  const terms: HealthTerm[] = [
    approach ? { kind: 'base', label: `${approach.name} base`, value: approach.baseHealth } : { kind: 'base', label: 'Approach base', value: null },
    archetype ? { kind: 'modifier', label: `${archetype.name} modifier`, value: archetype.healthModifier } : { kind: 'modifier', label: 'Archetype modifier', value: null },
    { kind: 'heroes', label: `${HEALTH_PER_HERO} × ${heroCount} ${heroCount === 1 ? 'hero' : 'heroes'}`, value: HEALTH_PER_HERO * heroCount },
    ...knownUpgrades(villain).map((u): HealthTerm => ({ kind: 'upgrade', label: u.name, value: u.health })),
  ]
  if (terms.some((t) => t.value === null)) return { terms }
  return { total: terms.reduce((sum, t) => sum + (t.value ?? 0), 0), terms }
}

/**
 * The Health zones for a villain's max Health, from the chart (p. 239): the row for that total,
 * or for 100 or more the top row, with Green running from the total down to that row's floor.
 * Undefined for a total not on the chart.
 */
export function villainZones(total: number): HealthRange | undefined {
  const row = villainHealthChart.ranges.find((r) => r.max === total || (r.orMore && total >= r.max))
  return row ? { max: total, green: [total, row.green[1]], yellow: row.yellow, red: row.red } : undefined
}

export function buildVillainSheet(villain: Villain): VillainSheet {
  const { traits, upgrades: diceUpgrades, warnings } = villainTraits(villain)
  const label = (t: TraitRef) => villainTraitLabel(villain, t)
  const warnAt = (step: VillainStepId, code: IssueCode, message: string, field?: string) => warnings.push({ step, code, message, ...(field ? { field } : {}) })
  const toSheet = (ability: Ability, pick: VillainAbilityPick | undefined, source: VillainAbilitySource, upgrade?: string): VillainSheetAbility => ({
    source,
    name: pick?.customName?.trim() || ability.name,
    baseName: ability.name,
    type: ability.type,
    text: fillTextWith(label, ability.text, pick?.uses, pick?.blanks),
    ...(ability.saveBonus ? { saveBonus: ability.saveBonus } : {}),
    traits: [...new Set((pick?.uses ?? []).filter((u): u is TraitRef => Boolean(u)).map(label))],
    effects: actionsOf(ability, pick?.blanks),
    use: abilityUseOf(ability, pick),
    ...(upgrade ? { upgrade } : {}),
  })
  const abilities: VillainSheetAbility[] = []

  /** A list to choose from: checks the picks, and returns them for the sheet. `list` names the list's box for its issues. */
  const chooseFrom = (step: VillainStepId, block: AbilityChoice & { options: Ability[] }, picks: readonly VillainAbilityPick[], source: VillainAbilitySource, what: string, list: string, upgrade?: string) => {
    const result = checkChoiceBlock({ step, traits, label, block, available: block.options, picks, source: what, list })
    warnings.push(...result.warnings)
    if (block.sameUsePattern && slotsFilled(block.options, picks) && !fitsUsePattern(result.uses, block.sameUsePattern)) {
      warnAt(step, 'use-pattern', `${what}: ${block.constraint ?? 'they don’t follow the pattern of powers or qualities they must use.'}`, abilityListField(list))
    }
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
      if (matching.length > 1) warnAt(step, 'ability-twice', `${ability.name} is recorded more than once.`, abilityField(ability.name))
      const pick = matching[0]
      if (pick) warnings.push(...checkPickFor({ step, traits, label, ability, pick }))
      else if (parseSlots(ability.text).length) warnAt(step, 'fixed-unfilled', `Fill in the blanks for ${ability.name}.`, abilityField(ability.name))
      abilities.push(toSheet(ability, pick, source, upgrade))
    }
    for (const pick of picks.filter((p) => p.source === source && !list.some((a) => a.name === p.name))) warnAt(step, 'unknown-ability', `${pick.name} doesn't come with this.`, abilityField(pick.name))
  }

  /** Picks recorded in the wrong place (from another list) don't count; say so. */
  const strays = (step: VillainStepId, picks: readonly VillainAbilityPick[], sources: readonly VillainAbilitySource[]) => {
    for (const pick of picks.filter((p) => !sources.includes(p.source))) warnAt(step, 'misplaced-ability', `${pick.name} is recorded in the wrong place; take it again from its list.`, abilityField(pick.name))
  }

  // The approach.
  const approachChoice = villain.approach
  const approach = approachChoice && villainApproachesById.get(approachChoice.id)
  if (!approachChoice) warnAt('approach', 'approach-missing', 'Choose an approach.')
  else if (!approach) warnAt('approach', 'unknown-entry', `${approachChoice.id} isn't an approach.`)
  else {
    const picks = approachChoice.abilities.filter((p) => p.source === 'approach')
    strays('approach', approachChoice.abilities, ['approach'])
    abilities.push(...chooseFrom('approach', approach.abilities, picks, 'approach', `${approach.name} abilities`, 'approach'))
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
    abilities.push(...chooseFrom('archetype', archetype.abilities, picks, 'archetype', `${archetype.name} abilities`, 'archetype'))
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

    // A die already at d12 gives an ability from the archetype's or approach's list instead.
    const dice = diceUpgrades.find((d) => d.upgradeId === choice.id)
    const extra = choice.extra ?? []
    if (dice) {
      const main = dice.list === 'approach' ? approach : archetype
      const mainPicks = (dice.list === 'approach' ? approachChoice : archetypeChoice)?.abilities ?? []
      strays('upgrades', extra, [dice.list])
      const picks = extra.filter((p) => p.source === dice.list)
      if (main) {
        for (const pick of picks.filter((p) => mainPicks.some((m) => m.name === p.name))) {
          warnAt('upgrades', 'ability-twice', `${pick.name} is already one of your ${main.name} abilities.`, abilityField(pick.name))
        }
        const block = { count: dice.extra, options: main.abilities.options }
        abilities.push(...chooseFrom('upgrades', block, picks, dice.list, `${upgrade.name} extra ${main.name} abilities`, upgradeField(choice.id, 'extra'), upgrade.name))
      } else if (picks.length) {
        warnAt('upgrades', 'overflow-count', `Choose the ${dice.list} first; ${upgrade.name}'s extra abilities come from its list.`, upgradeField(choice.id, 'extra'))
      }
    } else if (extra.length) {
      warnAt('upgrades', 'overflow-count', `${upgrade.name} doesn't give extra abilities; remove them.`, upgradeField(choice.id, 'extra'))
    }

    if (upgrade.lieutenantOptions && upgrade.vehicleAbilities) {
      const option = upgrade.lieutenantOptions.find((o) => o.die === choice.vehicle?.die)
      if (!option) warnAt('upgrades', 'vehicle-die', `Choose the die for your ${upgrade.name} (${upgrade.lieutenantOptions.map((o) => o.die).join(', ')}).`, VEHICLE_DIE_FIELD)
      const picks = (choice.vehicle?.abilities ?? []).filter((p) => p.source === 'vehicle')
      const block = { count: option?.abilityCount ?? 0, options: upgrade.vehicleAbilities }
      const taken = option ? chooseFrom('upgrades', block, picks, 'vehicle', `${upgrade.name} abilities`, 'vehicle', upgrade.name) : []
      const name = choice.vehicle?.name?.trim()
      vehicle = { ...(name ? { name } : {}), ...(choice.vehicle?.die ? { die: choice.vehicle.die } : {}), abilities: taken }
    } else if (choice.vehicle) {
      warnAt('upgrades', 'not-a-vehicle', `${upgrade.name} doesn't come with a vehicle.`)
    }
  }
  const upgrades = knownUpgrades(villain)

  // A major villain's mastery (p. 238).
  let mastery: VillainSheetAbility | undefined
  const masteryPick = villain.mastery
  const masteryAbility = masteryPick && villainMasteries.options.find((m) => m.name === masteryPick.name)
  if (masteryPick && !masteryAbility) warnAt('mastery', 'unknown-entry', `${masteryPick.name} isn't a villainous mastery.`, MASTERY_FIELD)
  if (masteryAbility) mastery = toSheet(masteryAbility, masteryPick, 'mastery')
  if (upgrades.length && !masteryPick) warnAt('mastery', 'mastery-missing', 'Choose a mastery (a major villain has one).', MASTERY_FIELD)
  if (!upgrades.length && masteryPick) warnAt('mastery', 'mastery-minor', 'Only a major villain (one with upgrades) takes a mastery.', MASTERY_FIELD)

  // Health (p. 239).
  let health: VillainHealthInfo | undefined
  if (!Number.isInteger(villain.heroCount) || villain.heroCount < 1) warnAt('health', 'hero-count', 'The villain needs to face at least one hero.', HERO_COUNT_FIELD)
  else {
    const { total, terms } = villainHealth(villain)
    if (total !== undefined) {
      const ranges = villainZones(total)
      const parts = terms.flatMap((t) => (t.value === null ? [] : [{ ...t, value: t.value }]))
      health = { max: total, heroCount: villain.heroCount, perHero: HEALTH_PER_HERO, parts, ...(ranges ? { ranges } : {}) }
    }
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

/** "Major villain · Bully · Overlord": whichever are chosen. */
export function villainIdentity(sheet: Pick<VillainSheet, 'major' | 'approach' | 'archetype'>): string {
  return [sheet.major ? 'Major villain' : 'Minor villain', sheet.approach, sheet.archetype].filter(Boolean).join(' · ')
}

/** "Built for 4 heroes: Bully 25, Overlord +15, 5 per hero." Upgrades that add no Health are left out. */
export function healthBreakdown(sheet: VillainSheet): string | undefined {
  const h = sheet.health
  if (!h) return undefined
  const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)
  const of = (kind: HealthTerm['kind']) => h.parts.filter((p) => p.kind === kind)
  const pieces = [
    ...of('base').map((p) => `${sheet.approach} ${p.value}`),
    ...of('modifier').map((p) => `${sheet.archetype} ${signed(p.value)}`),
    ...of('upgrade')
      .filter((p) => p.value !== 0)
      .map((p) => `${p.label} ${signed(p.value)}`),
    `${h.perHero} per hero`,
  ]
  return `Built for ${h.heroCount} ${h.heroCount === 1 ? 'hero' : 'heroes'}: ${pieces.join(', ')}.`
}
