/**
 * Reads the bracketed blanks in an ability's text, such as "[power]" or "[Boost or Hinder]".
 * Each blank is either a trait slot (filled with one of the hero's powers or qualities) or
 * a choice (filled with words). Players fill both when they take the ability
 * (data/rules/hero-creation.md, "Defining abilities").
 *
 * The bracket wording comes from the ability text in data/. Every bracket in the data must
 * be recognized here; slots.test.ts fails if a new one appears, so it can be added.
 */
import type { BasicAction, OptionRef, TraitKind } from './types'

/** What a trait slot accepts. */
export interface TraitSlot {
  type: 'trait'
  /** The bracket text, e.g. "power/quality". */
  label: string
  kinds: TraitKind[]
  /** Only traits matching one of these references; omitted means any trait of the allowed kinds. */
  only?: OptionRef[]
  /** Only traits the hero gained in this step. */
  fromStep?: 'archetype'
}

/** A blank filled with words. */
export interface ChoiceSlot {
  type: 'choice'
  label: string
  /** Fixed options to choose from; omitted means free text (e.g. an element or energy). */
  options?: readonly string[]
  /** How many options to choose (default 1). */
  count?: number
}

export type Slot = TraitSlot | ChoiceSlot

export const BASIC_ACTIONS: readonly BasicAction[] = ['attack', 'defend', 'boost', 'hinder', 'overcome']
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Bracket text (lowercased) → slot. */
const KNOWN: Record<string, Omit<TraitSlot, 'label'> | Omit<ChoiceSlot, 'label'>> = {
  power: { type: 'trait', kinds: ['power'] },
  quality: { type: 'trait', kinds: ['quality'] },
  'power/quality': { type: 'trait', kinds: ['power', 'quality'] },
  'self control power': { type: 'trait', kinds: ['power'], only: [{ powerCategory: 'self-control' }] },
  'psychic power': { type: 'trait', kinds: ['power'], only: [{ powerCategory: 'psychic' }] },
  'mental quality': { type: 'trait', kinds: ['quality'], only: [{ qualityCategory: 'mental' }] },
  'any physical or mental quality': {
    type: 'trait',
    kinds: ['quality'],
    only: [{ qualityCategory: 'physical' }, { qualityCategory: 'mental' }],
  },
  'signature vehicle': { type: 'trait', kinds: ['power'], only: [{ power: 'signature-vehicle' }] },
  'signature weaponry': { type: 'trait', kinds: ['power'], only: [{ power: 'signature-weaponry' }] },
  'a power gained from your archetype': { type: 'trait', kinds: ['power'], fromStep: 'archetype' },
  'a quality gained from your archetype': { type: 'trait', kinds: ['quality'], fromStep: 'archetype' },
  // The user ruled that this counts as using the related Elemental/Energy power.
  'element/energy you have a related power for': {
    type: 'trait',
    kinds: ['power'],
    only: [{ powerCategory: 'elemental-energy' }],
  },
  'element/energy': { type: 'choice' },
  'energy/element': { type: 'choice' },
  'elemental/energy': { type: 'choice' },
  'boost or hinder': { type: 'choice', options: ['Boost', 'Hinder'] },
  'physical or energy': { type: 'choice', options: ['Physical', 'Energy'] },
  'choose two basic actions': { type: 'choice', options: BASIC_ACTIONS.map(capitalize), count: 2 },
  'basic action': { type: 'choice', options: BASIC_ACTIONS.map(capitalize) },
}

/** Whether a bracket's text is one this module knows how to read. */
export function isKnownBracket(label: string): boolean {
  return label.toLowerCase() in KNOWN
}

/**
 * The slots in an ability's text, in order. Unrecognized brackets are read as free-text
 * choices so the ability can still be filled in.
 */
export function parseSlots(text: string): Slot[] {
  return [...text.matchAll(/\[([^\]]+)\]/g)].map(([, label]) => {
    const known = KNOWN[label!.toLowerCase()]
    return { ...(known ?? { type: 'choice' }), label: label! } as Slot
  })
}

export function traitSlots(text: string): TraitSlot[] {
  return parseSlots(text).filter((s): s is TraitSlot => s.type === 'trait')
}

export function choiceSlots(text: string): ChoiceSlot[] {
  return parseSlots(text).filter((s): s is ChoiceSlot => s.type === 'choice')
}
