/**
 * The hero document: what a player chose at each creation step, plus free-form details.
 *
 * A hero stores choices, not results. The sheet (final dice, abilities, Health ranges)
 * is derived from these choices and the rules data, and rule problems are reported as
 * warnings, so a hero may hold choices that break the rules.
 *
 * Deriving final dice: steps are applied in order (background, power source, archetype,
 * personality, retcon). A step's assignments give each trait its die. When a step assigns
 * a trait the hero already has, the assignment says what the player meant:
 * - `upgrades: true`: the new, bigger die upgrades the old one, and the old die joins this
 *   step's pool to be assigned elsewhere in the same step ("Assigning dice", p. 44). An
 *   archetype's required trait that allows swapping takes any die this way (ruling 43).
 * - otherwise it's a duplicate, which is reported as a warning.
 * Bonuses that grant a die follow the same upgrade rule, but don't free the old die.
 *
 * Versioning (see ./serialize.ts): an optional field may be added without a new version
 * only if an older app that ignores it still reads the hero correctly. Anything that
 * changes how existing data is read (e.g. the complex archetypes' extra structure) bumps
 * the version, even if the migration is a no-op, so older open tabs refuse instead of
 * misreading. Until the first public release there are no real saves, so v1 may still
 * change freely.
 */
import { traitKey, type TraitRef } from '../rules/catalog'
import type { RollRecord } from '../rules/rolling'
import type { AbilityEffect, Die, PrincipleCategoryId } from '../rules/types'

export type { RollRecord }

export type CreationMethod = 'guided' | 'constructed'

/** Guided only: whether the app rolls each step's dice, or the player types in their own. */
export type RollMode = 'app' | 'manual'

/**
 * A hero is a draft until the player finishes it (the hero wizard spec, "Drafts"). Heroes
 * saved before drafts existed have no status and count as complete.
 */
export type HeroStatus = 'draft' | 'complete'

/** One die assigned to a power or quality during a step. */
export interface TraitAssignment {
  trait: TraitRef
  die: Die
  /** The hero already has this trait and the player chose to replace its die with this one, a bigger die or a swap (see the module doc). */
  upgrades?: true
}

/** Where an ability came from. Archetype sources are relative to the archetype choice holding them. */
export type AbilitySource =
  | 'powerSource.green'
  | 'powerSource.yellow'
  | 'archetype.fixedGreen'
  | 'archetype.green'
  | 'archetype.fixedYellow'
  | 'archetype.yellow'
  | 'archetype.fixedRed'
  /** Divided's transition method ability. */
  | 'archetype.transition'
  /** A Form-Changer form's ability. */
  | 'archetype.form'
  /** A Modular mode's ability. */
  | 'archetype.mode'
  | 'red'
  | 'retcon'
  /** The personality's Out ability (only used to point the ability-trait retcon at it). */
  | 'out'

/** Identifies one ability the hero took. */
export interface AbilityId {
  source: AbilitySource
  /** The ability's name in the rules data. */
  name: string
}

/** An ability the hero took, with the choices made when taking it. */
export interface AbilityPick extends AbilityId {
  /** The powers/qualities filling the ability's trait slots, in the order they appear in its text. */
  uses?: TraitRef[]
  /**
   * Other bracketed choices, keyed by the bracket text, e.g. { "Boost or Hinder": "Boost" }.
   * A bracket that asks for several choices ("choose two basic actions") holds an array.
   */
  blanks?: Record<string, string | string[]>
  /** The player's own name for the ability. */
  customName?: string
  /**
   * For Red abilities, whose names repeat across categories: the category it was taken
   * from, as "power:athletic" or "quality:mental".
   */
  category?: string
}

export interface PrincipleChoice {
  /** The principle's id in the data, or CUSTOM_PRINCIPLE_ID for one the player made. */
  id: string
  /** Fills a bracketed blank in the principle, e.g. "Fire" for Principle of [Energy/Element]. */
  customization?: string
  /** A principle the player made (p. 141), when `id` is CUSTOM_PRINCIPLE_ID. */
  custom?: CustomPrinciple
}

/** The id a PrincipleChoice has when it holds a custom principle. */
export const CUSTOM_PRINCIPLE_ID = 'custom'

/** A principle the player made, with GM approval (p. 141). Fields may be blank while it's being written. */
export interface CustomPrinciple {
  category: PrincipleCategoryId
  name: string
  roleplaying: string
  minorTwist: string
  majorTwist: string
  /**
   * Its Green ability: an Overcome boost in a specific circumstance. `effects`, once the
   * player sets them, say what using it does in the game aid; until then they're worked
   * out from the text.
   */
  greenAbility: { name: string; text: string; effects?: AbilityEffect[] }
}

export interface BackgroundChoice {
  id: string
  roll?: RollRecord
  qualities: TraitAssignment[]
  principle?: PrincipleChoice
}

export interface PowerSourceChoice {
  id: string
  roll?: RollRecord
  powers: TraitAssignment[]
  abilities: AbilityPick[]
  /** Dice or traits gained from the power source's bonus. */
  bonus: TraitAssignment[]
}

/** A Form-Changer form, recorded on the auxiliary sheet. */
export interface FormChoice {
  zone: 'green' | 'yellow'
  /** The player's name for the form. */
  name?: string
  /** The form's power dice: the hero's power dice rearranged across powers. */
  powers: TraitAssignment[]
  /** Yellow form only: the two different powers or qualities raised one size. */
  upgrades?: TraitRef[]
  /** The form's ability (source 'archetype.form'). */
  ability?: AbilityPick
}

/** Minion-Maker's minion forms. */
export interface MinionFormsChoice {
  /** The quality whose max value sets how many forms to choose. */
  quality?: TraitRef
  /** Names of the chosen forms. */
  forms: string[]
}

/** Divided's own choices (Core Rules p. 94–95). */
export interface DividedChoice {
  /** The transition method's id. */
  transitionMethod?: string
  /** The transition method's ability (source 'archetype.transition'). */
  transitionAbility?: AbilityPick
  /** An optional second personality for the heroic form; Hero.personality is then the civilian form's. */
  heroicPersonality?: PersonalityChoice
  /** With two personalities, whose Out ability the hero uses (the user's ruling: player's choice). */
  outFrom?: 'civilian' | 'heroic'
  /** Split Form: which traits are always available, and which belong to each form. */
  split?: { always: TraitRef[]; civilian: TraitRef[]; heroic: TraitRef[] }
}

/** A Modular mode (Core Rules p. 96–98), recorded on the auxiliary sheet. Its zone comes from the mode's list. */
export interface ModeChoice {
  /** The mode's id in the data, e.g. "debilitator". */
  id: string
  /** The player's name for the mode. */
  name?: string
  /** The default-mode powers the mode uses, at their adjusted dice. */
  powers: TraitAssignment[]
  /** The mode's ability (source 'archetype.mode'). */
  ability?: AbilityPick
}

/** Modular's own choices. The default Green mode is the hero's dice as derived. */
export interface ModularChoice {
  modes: ModeChoice[]
  /** The optional Powerless mode: two default-mode powers at its dice (d6 and d10). */
  powerless?: TraitAssignment[]
}

export interface ArchetypeChoice {
  id: string
  roll?: RollRecord
  /**
   * Powers and qualities, including the archetype's required one. On Modular itself, the d6
   * powers added to bring the hero up to four powers.
   */
  traits: TraitAssignment[]
  abilities: AbilityPick[]
  bonus: TraitAssignment[]
  principle?: PrincipleChoice
  /** Form-Changer's forms. */
  forms?: FormChoice[]
  /** Minion-Maker's minion forms. */
  minionForms?: MinionFormsChoice
  /**
   * Divided and Modular: the second archetype they build on. Its powers, qualities,
   * bonuses, and (for Divided) abilities are recorded here, not on the outer choice.
   */
  secondary?: ArchetypeChoice
  /** Divided's own choices. */
  divided?: DividedChoice
  /** Modular's modes. */
  modular?: ModularChoice
}

export interface PersonalityChoice {
  id: string
  roll?: RollRecord
  /** The powers/qualities filling the Out ability's trait slots, in order. */
  outUses?: TraitRef[]
  /** Other bracketed choices in the Out ability. */
  outBlanks?: Record<string, string | string[]>
  /** Bonus die changes (Impulsive, for example). */
  bonus: TraitAssignment[]
}

/** The retcon taken, shaped by its kind in data/heroes/retcons.json. */
export type RetconChoice =
  | { id: string; kind: 'swapDice'; traits: [TraitRef, TraitRef] }
  | { id: string; kind: 'changeAbilityTrait'; ability: AbilityId; uses: TraitRef[] }
  | { id: string; kind: 'gainPowerOrQuality'; gained: TraitAssignment }
  /** `form`: for a Divided hero with two personalities, whose status die goes up (the player picks; the user's ruling). */
  | { id: string; kind: 'upgradeStatusDie'; form?: 'civilian' | 'heroic' }
  | { id: string; kind: 'changePrinciple'; replace: 'background' | 'archetype'; with: PrincipleChoice }
  | { id: string; kind: 'gainRedAbility'; ability: AbilityPick }

/**
 * A change made between collections (p. 142–143). Changes apply in order, on top of the
 * creation choices, which stay as they were made.
 */
export type AdvancementChange =
  /** Swap a power (or quality) for another at the same die size; abilities that used it use the new one. */
  | { kind: 'swapPower' | 'swapQuality'; from: TraitRef; to: TraitRef }
  /** Swap one principle for another. */
  | { kind: 'swapPrinciple'; replace: 'background' | 'archetype'; with: PrincipleChoice }
  /** Swap an ability for another of the same color from the same entry, using the same power or quality. */
  | { kind: 'swapAbility'; from: AbilityId; to: AbilityPick }

export interface Collection {
  name: string
  notes?: string
}

/** Hero advancement (p. 142–143): back issues, collections, and the changes made between them. */
export interface Advancement {
  /** Sessions played since the last collection; six make a collection. */
  backIssues: number
  collections: Collection[]
  changes: AdvancementChange[]
}

export interface HealthChoice {
  /** The power or quality whose max value is added; omit to use the fallback die. */
  trait?: TraitRef
  /** A d8 roll, or the flat value chosen instead. */
  mode: 'roll' | 'fixed'
  rollResult?: number
  /** True when the player typed in their own roll. */
  manual?: boolean
}

export interface HeroDetails {
  name: string
  alias: string
  player: string
  gender: string
  age: string
  height: string
  eyes: string
  hair: string
  skin: string
  build: string
  costume: string
}

export const DETAIL_FIELDS: readonly (keyof HeroDetails)[] = [
  'name',
  'alias',
  'player',
  'gender',
  'age',
  'height',
  'eyes',
  'hair',
  'skin',
  'build',
  'costume',
]

/** The steps whose entry is chosen from a rolled table. */
export type TableStep = 'background' | 'powerSource' | 'archetype' | 'personality'

/** Where a Guided roll can be pending: a table step, or Divided and Modular's second archetype. */
export type RollSlot = TableStep | 'secondaryArchetype'

export interface Hero {
  id: string
  createdAt: string
  updatedAt: string
  method: CreationMethod
  /** Who rolls in Guided creation; unset means the app does. */
  rollMode?: RollMode
  /** Unset means complete. */
  status?: HeroStatus
  /** A draft's furthest wizard step reached: 0 for Start, 1–8 for the numbered steps. */
  furthestStep?: number
  details: HeroDetails
  /**
   * The player's names for traits that need one (Signature Weaponry, the roleplaying
   * quality, ...), keyed by traitKey, e.g. "quality:roleplaying-quality".
   */
  traitNames: Record<string, string>
  background: BackgroundChoice | null
  powerSource: PowerSourceChoice | null
  archetype: ArchetypeChoice | null
  personality: PersonalityChoice | null
  redAbilities: AbilityPick[]
  retcon: RetconChoice | null
  health: HealthChoice | null
  /**
   * Guided rolls made before the step's entry was chosen. Saving them keeps leaving the step
   * or reloading from giving a fresh roll (each step gets one reroll); choosing an entry
   * moves the roll onto the choice.
   */
  pendingRolls?: Partial<Record<RollSlot, RollRecord>>
  /** Advancement after creation; creation choices are left as they were made. */
  advancement?: Advancement
  /** Current Health on the sheet, tracked during play. */
  currentHealth?: number
  notes?: string
  /** The game aid's state (Phase 3), saved with the hero; sheet exports leave it out. */
  play?: PlayState
}

/** A bonus (positive) or penalty (negative) on the hero (p. 26–27). */
export interface PlayMod {
  id: string
  label: string
  /** e.g. +2 or -3; never 0. */
  value: number
  persistent?: true
  exclusive?: true
}

export interface PlayTwist {
  id: string
  kind: 'minor' | 'major'
  text: string
}

/** One line of the game's history, with the details under it (e.g. a roll's dice). */
export interface PlayHistoryEntry {
  id: string
  /** When it happened (ISO 8601). */
  at: string
  text: string
  details?: string[]
}

/** What the game aid tracks for a hero during play. */
export interface PlayState {
  /** Current Health; until set, the hero is at their max. */
  health?: number
  /** The scene tracker's zone, when it's past Green (p. 14). */
  sceneZone?: 'yellow' | 'red'
  /** The Form-Changer form or Modular mode in use ("form:0", "mode:2", "powerless"); unset for the base form or default mode. */
  form?: string
  /** A Divided hero in their heroic form; unset in their civilian form. */
  dividedForm?: 'heroic'
  heroPoints: number
  reactionUsed: boolean
  mods: PlayMod[]
  twists: PlayTwist[]
  /** Newest last. */
  history: PlayHistoryEntry[]
}

export function emptyDetails(): HeroDetails {
  return Object.fromEntries(DETAIL_FIELDS.map((f) => [f, ''])) as unknown as HeroDetails
}

/** A random id. crypto.randomUUID needs a secure context, so plain http (e.g. a phone on the LAN) gets a fallback. */
export function newId(cryptoApi: Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>> = crypto): string {
  if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Creates a blank hero. `now` and `id` are injectable for tests. */
export function createHero(method: CreationMethod, options: { id?: string; now?: Date } = {}): Hero {
  const timestamp = (options.now ?? new Date()).toISOString()
  return {
    id: options.id ?? newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    method,
    details: emptyDetails(),
    traitNames: {},
    background: null,
    powerSource: null,
    archetype: null,
    personality: null,
    redAbilities: [],
    retcon: null,
    health: null,
  }
}

/** Whether the hero is still a draft: not finished, so it can't be played. */
export function isDraft(hero: Pick<Hero, 'status'>): boolean {
  return hero.status === 'draft'
}

/** The name to show for a hero in lists. */
export function heroDisplayName(hero: Hero): string {
  return hero.details.name.trim() || hero.details.alias.trim() || 'Unnamed hero'
}

/** The player's name for a trait, if they've given it one. */
export function traitName(hero: Hero, trait: TraitRef): string | undefined {
  return hero.traitNames[traitKey(trait)]
}
