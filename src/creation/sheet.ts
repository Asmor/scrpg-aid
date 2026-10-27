/**
 * Puts the hero sheet together from a hero's choices: characteristics, powers and
 * qualities, abilities by zone (with their blanks filled in), principles, status dice,
 * Health, and every rule warning. This is what the sheet view and editor display.
 */
import type { TraitRef } from '../rules/catalog'
import {
  backgroundsById,
  personalitiesById,
  powerSourcesById,
} from '../rules/data'
import { parseSlots } from '../rules/slots'
import type { Ability, AbilityType, BasicAction, Die, HealthRange, MinionForm, Zone } from '../rules/types'
import type { AbilityPick, AbilitySource, Collection, Hero, PrincipleChoice } from '../hero/model'
import { advancedHero, checkAdvancement, describeChange } from './advancement'
import { checkAbilities, checkAbilityPick, checkAbilityRetcon } from './abilities'
import { computeHealth, statusDice } from './health'
import { findAbility, outPick, recordedPicks, retconnedPick, type PlacedPick } from './lookup'
import { checkPrinciples, heroPrinciples, principleOf } from './principles'
import { checkForms, formAbilityPick, formLabel, formTraits } from './forms'
import { checkDivided, heroicTraits, outTraits, splitNames } from './divided'
import { archetypeName, checkSecondary, dividedChoice, layers, outerLayer, traitLayer } from './layers'
import { checkModular, findMode, modeAbilityPick, modeTraits } from './modular'
import { abilityEffects, effectActions, type Action } from './effects'
import { checkRedAbilities } from './red'
import { checkRetcon } from './retcons'
import { deriveTraits, traitLabel, type HeroTrait } from './traits'
import type { RuleWarning } from './warnings'

export interface SheetAbility {
  zone: Zone
  /** The name to show: the player's name for it, or the ability's own name. */
  name: string
  /** The ability's name in the rules data. */
  baseName: string
  type: AbilityType
  /** The game text with its blanks filled in where the player has chosen. */
  text: string
  source: AbilitySource | 'principle'
  /** The actions its effects are (./effects.ts), for the icons. */
  effects: Action[]
}

/** A form's or mode's own ability. */
export interface SheetFormAbility {
  name: string
  type: AbilityType
  text: string
  effects: Action[]
}

export interface SheetPrinciple {
  name: string
  roleplaying: string
  minorTwist: string
  majorTwist: string
}

/** A Form-Changer form as shown on the auxiliary sheet. */
export interface SheetForm {
  zone: 'green' | 'yellow'
  name: string
  /** The form's powers and qualities, with the Yellow form's upgrades applied. */
  traits: HeroTrait[]
  ability?: SheetFormAbility
}

/** A Modular mode as shown on the auxiliary sheet. */
export interface SheetMode {
  zone: Zone
  name: string
  /** The mode's powers at their mode dice, plus the hero's qualities. */
  traits: HeroTrait[]
  /** Basic actions the hero can't take in this mode. */
  cannot: BasicAction[]
  immobile: boolean
  ability?: SheetFormAbility
}

export interface HeroSheet {
  /** Back issues, collections, and the advancement changes made (p. 142–143). */
  advancement?: { backIssues: number; collections: readonly Collection[]; changes: string[] }
  characteristics: { background?: string; powerSource?: string; archetype?: string; personality?: string }
  powers: HeroTrait[]
  qualities: HeroTrait[]
  statusDice?: Record<Zone, Die>
  /** A Divided hero's heroic-form status dice, when they have a second personality. */
  heroicStatusDice?: Record<Zone, Die>
  maxHealth?: number
  healthRanges?: HealthRange
  principles: SheetPrinciple[]
  abilities: SheetAbility[]
  outAbility?: string
  /** The Out ability's effects' actions. */
  outEffects: Action[]
  /** Divided: the heroic form's personality and traits (when it has its own personality), and Split Form's lists. */
  divided?: {
    heroicPersonality?: string
    heroicTraits?: HeroTrait[]
    split?: { always: string[]; civilian: string[]; heroic: string[] }
  }
  /** Form-Changer forms. */
  forms: SheetForm[]
  /** Minion-Maker's chosen minion forms. */
  minionForms: MinionForm[]
  /** Modular's modes besides the default one (the hero's own dice), and its Powerless mode. */
  modes: SheetMode[]
  powerlessMode?: HeroTrait[]
  warnings: RuleWarning[]
}

/** Replaces bracketed blanks with the player's choices, leaving unfilled ones as they are. */
export function fillText(hero: Hero, text: string, uses: readonly TraitRef[] = [], blanks: AbilityPick['blanks'] = {}): string {
  const slots = parseSlots(text)
  let index = 0
  let traitIndex = 0
  return text.replace(/\[([^\]]+)\]/g, (whole) => {
    const slot = slots[index++]!
    if (slot.type === 'trait') {
      const use = uses[traitIndex++]
      return use ? traitLabel(hero, use) : whole
    }
    const value = blanks[slot.label]
    const filled = Array.isArray(value) ? value.filter((v) => v.trim()).join(' and ') : value?.trim()
    return filled || whole
  })
}

/** Fills a principle's [blank] with the player's customization. */
function fillPrinciple(text: string, choice: PrincipleChoice): string {
  const value = choice.customization?.trim()
  return value ? text.replace(/\[[^\]]+\]/g, value) : text
}

/** Sources whose abilities go in a zone on the sheet (the Out ability and form abilities are shown separately). */
type ZoneSource = Exclude<AbilitySource, 'out' | 'archetype.form' | 'archetype.mode'>

const ZONE_OF: Record<ZoneSource, Zone> = {
  'powerSource.green': 'green',
  'powerSource.yellow': 'yellow',
  'archetype.fixedGreen': 'green',
  'archetype.green': 'green',
  'archetype.fixedYellow': 'yellow',
  'archetype.yellow': 'yellow',
  'archetype.fixedRed': 'red',
  'archetype.transition': 'green',
  red: 'red',
  retcon: 'red',
}

function sheetAbility(hero: Hero, ability: Ability, pick: AbilityPick & { source: ZoneSource }): SheetAbility {
  return {
    zone: ZONE_OF[pick.source],
    name: pick.customName?.trim() || ability.name,
    baseName: ability.name,
    type: ability.type,
    text: fillText(hero, ability.text, pick.uses, pick.blanks),
    source: pick.source,
    effects: actionsOf(ability, pick.blanks),
  }
}

/** An ability's effects' actions: from the data, or from its text for a player-written one. */
function actionsOf(ability: Ability, blanks?: AbilityPick['blanks']): Action[] {
  return ability.effects ? effectActions(ability.effects, blanks) : abilityEffects(ability.text)
}

/**
 * The hero's sheet. With advancement changes, it shows the hero as they are now (the changes
 * applied), but the creation checks run on the hero as created, plus the advancement checks
 * (./advancement.ts).
 */
export function buildSheet(hero: Hero): HeroSheet {
  const adv = hero.advancement
  const summary = adv ? { backIssues: adv.backIssues, collections: adv.collections, changes: adv.changes.map((c, i) => describeChange(advancedHero(hero, i), c)) } : undefined
  const created = sheetOf(hero)
  const now = adv?.changes.length ? sheetOf(advancedHero(hero)) : created
  return { ...now, advancement: summary, warnings: [...created.warnings, ...checkAdvancement(hero)] }
}

function sheetOf(hero: Hero): HeroSheet {
  const derived = deriveTraits(hero)
  const traits = derived.traits
  // The Out ability uses the powers and qualities of the form whose personality gives it.
  const forOut = outTraits(hero, traits)
  const warnings: RuleWarning[] = [
    ...derived.warnings,
    ...checkAbilities(hero, traits),
    ...checkRedAbilities(hero, traits),
    ...checkAbilityRetcon(hero, traits, forOut),
    ...checkPrinciples(hero),
    ...checkRetcon(hero),
    ...checkForms(hero, traits),
    ...checkSecondary(hero),
    ...checkDivided(hero, traits),
    ...checkModular(hero, traits),
  ]

  // Ability picks, with the ability retcon's new traits applied.
  const placed: PlacedPick[] = [
    ...recordedPicks(hero),
    ...(hero.retcon?.kind === 'gainRedAbility' ? [{ pick: { ...hero.retcon.ability, source: 'retcon' as const } }] : []),
  ].map(({ pick, archetype }) => ({ archetype, pick: retconnedPick(hero, pick) }))

  const abilities: SheetAbility[] = []
  const inZone = (p: AbilityPick): p is AbilityPick & { source: ZoneSource } =>
    p.source !== 'out' && p.source !== 'archetype.form' && p.source !== 'archetype.mode'
  for (const { pick, archetype } of placed) {
    if (!inZone(pick)) continue
    const ability = findAbility(hero, pick, archetype)
    if (ability) abilities.push(sheetAbility(hero, ability, pick))
  }
  // Fixed abilities come with each archetype layer even if no pick was recorded (Modular
  // skips its base archetype's); unfilled blanks stay in brackets.
  const [outer, ...rest] = layers(hero)
  const withAbilities = outer?.archetype.secondaryArchetype?.skipAbilities ? [outer] : [outer, ...rest]
  for (const layer of withAbilities) {
    if (!layer) continue
    const ar = layer.archetype
    const fixed: [Ability[] | undefined, ZoneSource][] = [
      [ar.fixedGreenAbilities, 'archetype.fixedGreen'],
      [ar.fixedYellowAbilities, 'archetype.fixedYellow'],
      [ar.fixedRedAbilities, 'archetype.fixedRed'],
    ]
    for (const [list, source] of fixed) {
      for (const ability of list ?? []) {
        if (!placed.some((p) => p.archetype === ar && p.pick.source === source && p.pick.name === ability.name)) {
          abilities.push(sheetAbility(hero, ability, { source, name: ability.name }))
        }
      }
    }
  }

  // Principles: their roleplaying text and twists, and their Green abilities.
  const principles: SheetPrinciple[] = []
  for (const choice of Object.values(heroPrinciples(hero))) {
    const principle = choice && principleOf(choice)
    if (!choice || !principle) continue
    principles.push({
      name: fillPrinciple(principle.name, choice),
      roleplaying: fillPrinciple(principle.roleplaying, choice),
      minorTwist: principle.minorTwist,
      majorTwist: principle.majorTwist,
    })
    abilities.push({
      zone: 'green',
      name: fillPrinciple(principle.greenAbility.name, choice),
      baseName: principle.greenAbility.name,
      type: principle.greenAbility.type,
      text: fillPrinciple(principle.greenAbility.text, choice),
      source: 'principle',
      effects: actionsOf(principle.greenAbility),
    })
  }

  // The Out ability, checked like any ability with blanks (the ability retcon may change it).
  const personality = hero.personality && personalitiesById.get(hero.personality.id)
  let out: string | undefined
  let outEffects: Action[] = []
  const recorded = outPick(hero)
  const outEntry = recorded && findAbility(hero, recorded)
  if (recorded && outEntry) {
    const ability = outEntry
    warnings.push(...checkAbilityPick(hero, forOut, ability, recorded, 'personality'))
    const pick = retconnedPick(hero, recorded)
    out = fillText(hero, ability.text, pick.uses, pick.blanks)
    outEffects = actionsOf(ability, pick.blanks)
  }

  // Form-Changer forms and Minion-Maker minion forms.
  const formLayer = traitLayer(hero)
  const formSpec = formLayer?.archetype.forms
  const recordedForms = formLayer?.choice.forms ?? []
  const forms: SheetForm[] = recordedForms.map((form) => {
    const pick = formAbilityPick(hero, form)
    const entry = pick && [...(formSpec?.greenFormAbilities ?? []), ...(formSpec?.yellowFormAbilities ?? [])].find((a) => a.name === pick.name)
    const inForm = formTraits(hero, traits, form)
    return {
      zone: form.zone,
      name: formLabel(recordedForms, form),
      traits: inForm,
      ability: pick && entry && {
        name: pick.customName?.trim() || entry.name,
        type: entry.type,
        text: fillText(hero, entry.text, pick.uses, pick.blanks),
        effects: actionsOf(entry, pick.blanks),
      },
    }
  })
  const minionForms = (formLayer?.choice.minionForms?.forms ?? []).flatMap((name) => formLayer?.archetype.minionForms?.forms.find((f) => f.name === name) ?? [])

  // Modular's modes.
  const modularChoice = hero.archetype?.modular
  const modes: SheetMode[] = (modularChoice?.modes ?? []).flatMap((m) => {
    const found = findMode(hero, m.id)
    if (!found) return []
    const pick = modeAbilityPick(hero, m)
    const { mode, zone } = found
    return [
      {
        zone,
        name: m.name?.trim() || mode.name,
        traits: modeTraits(hero, traits, m.powers),
        cannot: mode.cannot,
        immobile: Boolean(mode.immobile),
        ability: pick && pick.name === mode.ability.name
          ? { name: pick.customName?.trim() || mode.ability.name, type: mode.ability.type, text: fillText(hero, mode.ability.text, pick.uses, pick.blanks), effects: actionsOf(mode.ability, pick.blanks) }
          : undefined,
      },
    ]
  })
  // Only a Modular hero has modes (choices left on another archetype are warned about, not shown).
  const powerlessMode = outerLayer(hero)?.archetype.modes && modularChoice?.powerless ? modeTraits(hero, traits, modularChoice.powerless) : undefined

  const divided = dividedChoice(hero)
  const health = computeHealth(hero, traits)
  warnings.push(...health.warnings)

  const bg = hero.background && backgroundsById.get(hero.background.id)
  const ps = hero.powerSource && powerSourcesById.get(hero.powerSource.id)
  const byDie = (a: HeroTrait, b: HeroTrait) => Number(b.die.slice(1)) - Number(a.die.slice(1)) || a.name.localeCompare(b.name)
  return {
    characteristics: { background: bg?.name, powerSource: ps?.name, archetype: archetypeName(hero), personality: personality?.name },
    powers: traits.filter((t) => t.trait.kind === 'power').sort(byDie),
    qualities: traits.filter((t) => t.trait.kind === 'quality').sort(byDie),
    statusDice: statusDice(hero),
    heroicStatusDice: statusDice(hero, 'heroic'),
    maxHealth: health.max,
    healthRanges: health.ranges,
    principles,
    abilities,
    outAbility: out,
    outEffects,
    divided: divided && {
      heroicPersonality: divided.heroicPersonality && personalitiesById.get(divided.heroicPersonality.id)?.name,
      heroicTraits: heroicTraits(hero),
      split: splitNames(hero),
    },
    forms,
    minionForms,
    modes,
    powerlessMode,
    warnings,
  }
}
