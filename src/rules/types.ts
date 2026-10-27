/**
 * Types for the rules data in data/. They mirror the JSON structures described in
 * data/README.md; scripts/validate_data.py checks the data against those conventions.
 */

export type Die = 'd4' | 'd6' | 'd8' | 'd10' | 'd12'
export type Zone = 'green' | 'yellow' | 'red'
export type AbilityType = 'A' | 'R' | 'I' | 'A/I'
export type TraitKind = 'power' | 'quality'
export type PrincipleCategoryId = 'esoteric' | 'expertise' | 'ideals' | 'identity' | 'responsibility'
export type BasicAction = 'attack' | 'defend' | 'boost' | 'hinder' | 'overcome'

/** Where something is in a book. `pages` lists every page when an entry spans several. */
export interface PageRef {
  book: string
  page?: number
  pages?: number[]
}

/** A catalog entry: always has its first page, plus `pages` when it spans several. */
export interface EntryRef extends PageRef {
  page: number
}

/** Exactly one key: a specific power or quality, or a whole category of them. */
export type OptionRef =
  | { power: string }
  | { quality: string }
  | { powerCategory: string }
  | { qualityCategory: string }

/** A basic action an ability's effect can be (Recover only comes from abilities). */
export type Action = 'attack' | 'defend' | 'boost' | 'hinder' | 'overcome' | 'recover'

/**
 * Which roll sets an effect: one result of the sorted pool (or a sum of them), the single die
 * a `pool.single` ability rolls, the damage the hero took, or a value the text describes.
 */
export type EffectUse = 'max' | 'mid' | 'min' | 'max+mid' | 'max+min' | 'mid+min' | 'max+mid+min' | 'single' | 'damage' | 'other'

/** One effect an ability produces (data/README.md, "Ability effects"). */
export interface AbilityEffect {
  /** More than one: the player picks one when using the ability. */
  actions: Action[]
  /** A list: the player picks which. */
  use: EffectUse | EffectUse[]
  optional?: true
  /** Only when the roll has doubles. */
  when?: 'doubles'
  /** What the effect uses instead when the roll has doubles. */
  doublesUse?: EffectUse
  /** The actions come from this [blank], so the player's choice there narrows them. */
  fromBlank?: string
}

/** An ability that rolls one die instead of the usual power, quality, and status dice. */
export interface AbilityPool {
  single: 'trait' | 'status' | 'redStatus'
}

export interface Ability {
  name: string
  type: AbilityType
  text: string
  /** The hero must have this power/quality (or one in this category) to take the ability. */
  requires?: OptionRef
  /** Every ability in data/ has these; a player-written ability (a custom principle's) may not. */
  effects?: AbilityEffect[]
  pool?: AbilityPool
}

/** A power or quality that must receive some of a step's dice. */
export type RequiredRef = OptionRef & { dieCount?: number }

export type ChoiceCount = number | 'one' | 'oneOrMore' | 'any' | 'atLeastTwo' | 'remaining'
export type DistinctRule = 'differentPowers' | 'differentQualities' | 'differentPowersOrQualities'
export type UsesFrom = 'archetypeLists' | 'archetypePowerList' | OptionRef[]

export interface RequireAtLeast {
  count: number
  uses: TraitKind | OptionRef[]
}

/** Machine-readable restrictions on which power or quality abilities in a block use (data/README.md). */
export interface AbilityRestrictions {
  constraint?: string
  rule?: DistinctRule
  usesFrom?: UsesFrom
  requireAtLeast?: RequireAtLeast[]
  minDifferentPowers?: number
  differentFromGreen?: true
  sameUsePattern?: { uses: TraitKind; groups: number[] }
}

/** Pick `count` abilities from `options`, or (fromGreenList) one of the Green options. */
export interface AbilityChoice extends AbilityRestrictions {
  count: number
  options?: Ability[]
  fromGreenList?: true
}

/** Assign dice to powers or qualities chosen from `options`. */
interface DiceAssignmentBase {
  options: OptionRef[]
  required?: RequiredRef[]
  note?: string
}

/** Background qualities: these exact dice. */
export interface FixedDiceAssignment extends DiceAssignmentBase {
  dice: Die[]
}

/** Power source powers: the same die sizes the background gave for this step. */
export interface CarriedDiceAssignment extends DiceAssignmentBase {
  dice: 'fromBackground'
}

/** Archetype powers/qualities: how many of the step's dice go here. */
export interface CountedDiceAssignment extends DiceAssignmentBase {
  count: Exclude<ChoiceCount, number>
  /** Psychic: remaining dice may also go to these power options. */
  powerOptions?: OptionRef[]
}

export type IfAlreadyHave = 'skip' | 'swap' | 'addDifferentFromCategory'

/** An archetype's required power or quality, and what to do if the hero already has it. */
export interface RequiredTrait {
  options: OptionRef[]
  ifAlreadyHave: IfAlreadyHave[]
}

// ---- Bonuses granted by power sources, archetypes, and personalities ----

export type Bonus =
  | { kind: 'extraArchetypeQuality'; die: Die; summary: string }
  | { kind: 'gainQuality'; die: Die; options: OptionRef[]; summary: string }
  | {
      kind: 'gainPower'
      die: Die
      options?: OptionRef[]
      excludeListed?: boolean
      mustBeNew?: boolean
      summary: string
    }
  | {
      kind: 'upgradeDie'
      targets: TraitKind[]
      from?: Die[]
      to?: Die
      steps?: number
      max?: Die
      fallback?: { kind: 'gainPower'; die: Die; fromListed: boolean }
      summary: string
    }
  | {
      kind: 'shiftDice'
      downgrade: { from: Die[]; targets: TraitKind[]; steps: number }
      upgrade: { from: Die[]; targets: TraitKind[]; steps: number }
      summary: string
    }

/** Powers or qualities that may stand in for the usual Health trait. */
export interface HealthOptions {
  extraOptions?: OptionRef[]
  anyPowerOrQuality?: boolean
  summary: string
}

// ---- Powers and qualities ----

export interface Trait {
  id: string
  name: string
  summary: string
  /** The player names this trait themselves (e.g. a Signature Weaponry or roleplaying quality). */
  rename?: boolean
  requiresGmPermission?: boolean
  book?: string
  page?: number
}

export interface TraitCategory {
  id: string
  name: string
  book: string
  page: number
  usedForHealth?: boolean
  requiresCustomization?: boolean
}

export interface PowerCategory extends TraitCategory {
  powers: Trait[]
}

export interface QualityCategory extends TraitCategory {
  qualities: Trait[]
}

// ---- Creation steps ----

export interface Background extends EntryRef {
  id: string
  roll: number
  name: string
  qualities: FixedDiceAssignment
  principleCategory: PrincipleCategoryId
  powerSourceDice: Die[]
}

export interface PowerSource extends EntryRef {
  id: string
  roll: number
  name: string
  powers: CarriedDiceAssignment
  greenAbilities?: AbilityChoice
  yellowAbilities: AbilityChoice
  bonuses?: Bonus[]
  archetypeDice: Die[]
}

export interface MinionSize {
  min?: number
  max?: number
  die: Die
  form: string
}

export interface MinionForm {
  name: string
  minBonus: number
  effect: string
}

export interface TransitionMethod {
  id: string
  name: string
  summary: string
  greenAbilities: AbilityChoice
}

export interface ModularMode {
  id: string
  name: string
  pickPowers: number
  same?: number
  down?: number
  upCount?: number
  upTwoSteps?: number
  setTo?: { count: number; die: Die }
  cannot: BasicAction[]
  immobile?: boolean
  ability: Ability
  book?: string
  page?: number
}

export interface Archetype extends EntryRef {
  id: string
  roll: number
  name: string
  summary?: string
  /** Divided and Modular build on a second archetype. */
  complex?: boolean
  required?: RequiredTrait
  powers?: CountedDiceAssignment
  qualities?: CountedDiceAssignment
  bonuses?: Bonus[]
  fixedGreenAbilities?: Ability[]
  fixedGreenConstraint?: string
  fixedGreenRule?: DistinctRule
  greenAbilities?: AbilityChoice
  fixedYellowAbilities?: Ability[]
  yellowAbilities?: AbilityChoice
  fixedRedAbilities?: Ability[]
  extraRedAbilityOptions?: Ability[]
  healthOptions?: HealthOptions
  principleCategory: PrincipleCategoryId | 'fromSecondaryArchetype'
  personalityDice: Die[]
  personalityNote?: string
  secondaryArchetype?: {
    reroll: 'required' | 'optional'
    exclude: string[]
    skipAbilities?: boolean
    minimumPowers?: number
    fillerPowerDie?: Die
  }
  transitionMethods?: TransitionMethod[]
  minionRules?: PageRef & { summary: string; sizeByResult: MinionSize[] }
  minionForms?: PageRef & { selection: string; usage: string; forms: MinionForm[] }
  forms?: {
    summary: string
    greenFormCount: number
    greenFormAbilities: Ability[]
    yellowFormCount: number
    yellowFormUpgrades: number
    yellowFormAbilities: Ability[]
  }
  modes?: {
    summary: string
    default: { zone: Zone; summary: string }
    powerless: { optional: boolean; summary: string; dice: Die[] }
    green: { count: number; options: ModularMode[] }
    yellow: { count: number; options: ModularMode[] }
    red: { count: number; options: ModularMode[] }
    modeAdjustmentKey: string
  }
}

export interface Personality extends EntryRef {
  id: string
  roll: number
  name: string
  statusDice: Record<Zone, Die>
  outAbility: string
  outEffects: AbilityEffect[]
  outPool?: AbilityPool
  bonuses?: Bonus[]
  healthOptions?: HealthOptions
}

export interface RedAbilityCategory extends EntryRef {
  powerCategory?: string
  qualityCategory?: string
  abilities: Ability[]
}

export type Retcon =
  | { id: string; kind: 'swapDice'; targets: TraitKind[]; summary: string }
  | { id: string; kind: 'changeAbilityTrait'; summary: string }
  | { id: string; kind: 'gainPowerOrQuality'; die: Die; summary: string }
  | { id: string; kind: 'upgradeStatusDie'; zone: Zone; steps: number; max: Die; summary: string }
  | { id: string; kind: 'changePrinciple'; summary: string }
  | { id: string; kind: 'gainRedAbility'; count: number; summary: string }

export interface HealthRange {
  max: number
  green: [number, number]
  yellow: [number, number]
  red: [number, number]
}

export interface HealthFormula {
  base: number
  addMaxOf: (
    | { statusDie: Zone }
    | { pickOne: boolean; bestOf: OptionRef[]; fallbackDie: Die }
  )[]
  addRoll: { die: Die; orFixed: number; chooseBeforeRolling: boolean }
  summary: string
}

export interface PrincipleCategory {
  id: PrincipleCategoryId
  name: string
  book: string
  pages: number[]
}

export interface Principle extends EntryRef {
  id: string
  name: string
  category: PrincipleCategoryId
  roleplaying: string
  minorTwist: string
  majorTwist: string
  greenAbility: Ability
  /** Set when the principle has a bracketed blank the player fills in, e.g. "Energy/Element". */
  customization?: string
}
