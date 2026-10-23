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
 *   step's pool to be assigned elsewhere in the same step ("Assigning dice", p. 44).
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
import type { Die } from '../rules/types'

export type { RollRecord }

export type CreationMethod = 'guided' | 'constructed'

/** One die assigned to a power or quality during a step. */
export interface TraitAssignment {
  trait: TraitRef
  die: Die
  /** The hero already has this trait and the player chose to upgrade it with this bigger die (see the module doc). */
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
  | 'red'
  | 'retcon'

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
}

export interface PrincipleChoice {
  id: string
  /** Fills a bracketed blank in the principle, e.g. "Fire" for Principle of [Energy/Element]. */
  customization?: string
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

export interface ArchetypeChoice {
  id: string
  roll?: RollRecord
  /** Powers and qualities, including the archetype's required one. */
  traits: TraitAssignment[]
  abilities: AbilityPick[]
  bonus: TraitAssignment[]
  principle?: PrincipleChoice
}

export interface PersonalityChoice {
  id: string
  roll?: RollRecord
  /** Bracketed choices in the Out ability. */
  outBlanks?: Record<string, string | string[]>
  /** Bonus die changes (Impulsive, for example). */
  bonus: TraitAssignment[]
}

/** The retcon taken, shaped by its kind in data/heroes/retcons.json. */
export type RetconChoice =
  | { id: string; kind: 'swapDice'; traits: [TraitRef, TraitRef] }
  | { id: string; kind: 'changeAbilityTrait'; ability: AbilityId; uses: TraitRef[] }
  | { id: string; kind: 'gainPowerOrQuality'; gained: TraitAssignment }
  | { id: string; kind: 'upgradeStatusDie' }
  | { id: string; kind: 'changePrinciple'; replace: 'background' | 'archetype'; with: PrincipleChoice }
  | { id: string; kind: 'gainRedAbility'; ability: AbilityPick }

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

export interface Hero {
  id: string
  createdAt: string
  updatedAt: string
  method: CreationMethod
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
  /** Current Health on the sheet, tracked during play. */
  currentHealth?: number
  notes?: string
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

/** The name to show for a hero in lists. */
export function heroDisplayName(hero: Hero): string {
  return hero.details.name.trim() || hero.details.alias.trim() || 'Unnamed hero'
}

/** The player's name for a trait, if they've given it one. */
export function traitName(hero: Hero, trait: TraitRef): string | undefined {
  return hero.traitNames[traitKey(trait)]
}
