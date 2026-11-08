/**
 * Reference sheets (scrpg-aid-designs/reference-sheets/spec.md): printable files for running
 * things at the table without the app. Heroes and villains print as their own sheets, a page
 * each ("full pages"); minions, lieutenants, challenges and environments print as cards in
 * columns, in an order the GM can arrange. Everything here is pure.
 */
import type { Appearance } from '../colors/palette'
import type { Hero } from '../hero/model'
import type { BasicAction, Die, Zone } from '../rules/types'
import type { TrackerCounts } from '../rules/trackers'
import type { EnvironmentAspect, TemplateAbility } from '../template/model'
import type { Villain } from '../villain/model'

/**
 * What a reference sheet item is. A library export names templates by their kind; a scene
 * export names the game's own groups as `group` (the cards come from the table), and an
 * environment's attached template by its kind and template id.
 */
export type SheetKind = 'hero' | 'villain' | 'minion' | 'lieutenant' | 'challenge' | 'environment' | 'group'

export interface SheetItemRef {
  kind: SheetKind
  id: string
}

export const sheetRefKey = (ref: SheetItemRef) => `${ref.kind}:${ref.id}`
export const sameSheetRef = (a: SheetItemRef, b: SheetItemRef) => a.kind === b.kind && a.id === b.id

/** The GM's order: full pages, then cards with any column or page break before them, and what's left out. */
export interface SheetArrangement {
  /** Full-page items, in print order. */
  pages: SheetItemRef[]
  cards: { ref: SheetItemRef; breakBefore?: 'column' | 'page' }[]
  omitted: SheetItemRef[]
}

export type SheetFormat = 'pdf' | 'markdown'

export interface SheetOptions {
  format: SheetFormat
  paper: 'letter' | 'a4'
  columns: 2 | 3
  /** The card pages before the full pages. Library exports only: a scene's cards always come first. */
  cardsFirst: boolean
  /** Blank lines and boxes for tracking at the table (section 6). */
  writeIns: boolean
  /** Adds the templates a selected environment brings, as cards. */
  bringAttached: boolean
  /** Scene exports only: each hero in the game as a full page. */
  includeHeroes: boolean
  /** Scene exports only: the GM's scene notes on the scene page. */
  includeNotes: boolean
}

export const DEFAULT_SHEET_OPTIONS: SheetOptions = {
  format: 'pdf',
  paper: 'letter',
  columns: 2,
  cardsFirst: false,
  writeIns: true,
  bringAttached: true,
  includeHeroes: false,
  includeNotes: true,
}

/** A hero or villain, printed as its own sheet. */
export type PageItem = {
  ref: SheetItemRef
  name: string
  draft: boolean
  hidden?: HiddenMark
} & ({ kind: 'hero'; hero: Hero } | { kind: 'villain'; villain: Villain })

/** "Starts hidden" on a planned scene's item, "Hidden" on one on the table now. */
export type HiddenMark = 'starts' | 'now'

export type CardType = 'environment' | 'challenge' | 'lieutenant' | 'minion'

/** The card types in their default order (section 4). */
export const CARD_TYPES: readonly CardType[] = ['environment', 'challenge', 'lieutenant', 'minion']

export const CARD_TYPE_NAME: Record<CardType, string> = {
  environment: 'Environment',
  challenge: 'Challenge',
  lieutenant: 'Lieutenant',
  minion: 'Minion',
}
export const CARD_TYPE_PLURAL: Record<CardType, string> = {
  environment: 'Environments',
  challenge: 'Challenges',
  lieutenant: 'Lieutenants',
  minion: 'Minions',
}

interface CardBase {
  ref: SheetItemRef
  name: string
  appearance: Appearance
  /** The environment it came with: an attached template, or a group or challenge the environment owns. */
  from?: string
  /** Added by "Add what environments bring": an environment's attached template, not one selected or on the table. */
  brought?: true
  hidden?: HiddenMark
}

/** One die box: a member of a group at its die, or crossed out when it's out. */
export interface MemberBox {
  die: Die
  out: boolean
}

export interface NpcCard extends CardBase {
  type: 'minion' | 'lieutenant'
  /** The die it starts with; unset for a group on the table with no one left. */
  die?: Die
  actions: 'any' | BasicAction[]
  notes: string
  abilities: TemplateAbility[]
  /** One per member: a template's group size at its die, or a group's members as they are. */
  members: MemberBox[]
}

export interface ChallengeCard extends CardBase {
  type: 'challenge'
  description: string
  steps: { label: string; done: boolean }[]
  whenDone: string
}

export interface CardTwist {
  zone: Zone
  kind: 'minor' | 'major'
  name?: string
  text: string
  used: boolean
}

export interface EnvironmentCard extends CardBase {
  type: 'environment'
  description: string
  aspects: EnvironmentAspect[]
  /** Green, Yellow, Red; minor before major. */
  twists: CardTwist[]
  /** The names of what it brings along. */
  brings: string[]
}

export type SheetCard = NpcCard | ChallengeCard | EnvironmentCard

/** A scene export's first block (section 5). */
export interface ScenePage {
  gameName: string
  /** "Issue 2 · Scene 3", or "Scene 3" before any issue. */
  where: string
  name: string
  tracker: {
    counts: TrackerCounts
    /** "Standard". */
    name: string
    zones: Zone[]
    /** How many boxes are filled: up to the position for the current scene, none for a planned one. */
    filled: number
    /** "Yellow 2", for the current scene. */
    now?: string
  }
  notes: string
  /** For the file name and footer: "Scene 3". */
  number: number
}

/** What a reference sheet holds, before arranging. */
export interface SheetContents {
  /** Heroes, then villains, each by name. */
  pages: PageItem[]
  cards: SheetCard[]
  /** What "Add what environments bring" adds (or would): names, for its hint. Empty hides the checkbox. */
  bringable: string[]
  scene?: ScenePage
}

/** "A", "A and B", "A, B and C". */
export function joinAnd(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
