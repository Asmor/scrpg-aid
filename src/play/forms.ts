/**
 * Forms and modes in the game aid (Phase 3). Pure: which Form-Changer forms (p. 90–91),
 * Modular modes (p. 96–98), and Divided forms (p. 94–95) a hero can be in, what they roll
 * in each, and which abilities they can use there.
 *
 * - A form's or mode's own ability works only in it; the hero's other abilities work in all
 *   of them. A Yellow or Red form or mode needs that zone, like an ability.
 * - A form or mode without a power or quality an ability names rolls a d4 for it (data/rulings.md
 *   17 and 52).
 * - A mode's "can't" actions can't be taken, nor abilities that only do those (ruling 53), and
 *   Powerless mode allows only principle abilities, and the Out ability (ruling 54).
 * - The Out ability isn't blocked by a Divided form that lacks its power or quality (ruling 55).
 * - Divided: "You cannot use abilities related to a power or quality you don't have access
 *   to", and Divided Psyche rolls two qualities in civilian form and two powers in heroic form,
 *   whatever the ability names (ruling 56).
 */
import { traitKey, type TraitRef } from '../rules/catalog'
import { takesDividedPsyche, withoutOtherForm } from '../creation/divided'
import type { AbilityUse, HeroSheet, SheetFormAbility } from '../creation/sheet'
import type { HeroTrait } from '../creation/traits'
import type { Hero, PlayState } from '../hero/model'
import type { AbilityType, Action, BasicAction, Die, Zone } from '../rules/types'
import { abilityAvailable, type PlayZone } from './state'

/** A form or mode the hero can be in. */
export interface PlayForm {
  /** Its key in PlayState.form; unset for the base form or default mode. */
  key?: string
  name: string
  zone: Zone
  traits: readonly HeroTrait[]
  ability?: SheetFormAbility
  cannot: readonly BasicAction[]
  immobile: boolean
  /** Powerless mode: only principle abilities can be used. */
  powerless: boolean
}

const byDie = (a: HeroTrait, b: HeroTrait) => Number(b.die.slice(1)) - Number(a.die.slice(1)) || a.name.localeCompare(b.name)

/** The hero's forms and modes, base first; none for a hero without any. */
export function playForms(sheet: Pick<HeroSheet, 'forms' | 'modes' | 'powerlessMode' | 'powers' | 'qualities'>): PlayForm[] {
  const plain = { cannot: [], immobile: false, powerless: false }
  const others: PlayForm[] = [
    ...sheet.forms.map((f, i) => ({ ...plain, key: `form:${i}`, name: f.name, zone: f.zone, traits: f.traits, ...(f.ability ? { ability: f.ability } : {}) })),
    ...sheet.modes.map((m, i) => ({ ...plain, key: `mode:${i}`, name: m.name, zone: m.zone, traits: m.traits, cannot: m.cannot, immobile: m.immobile, ...(m.ability ? { ability: m.ability } : {}) })),
    ...(sheet.powerlessMode ? [{ ...plain, key: 'powerless', name: 'Powerless mode', zone: 'green' as const, traits: sheet.powerlessMode, powerless: true }] : []),
  ]
  if (!others.length) return []
  const modular = sheet.modes.length > 0 || Boolean(sheet.powerlessMode)
  return [{ ...plain, name: modular ? 'Default mode' : 'Base form', zone: 'green', traits: [...sheet.powers, ...sheet.qualities] }, ...others]
}

/**
 * Whether the hero can change to a form or mode in this zone: a Yellow or Red one needs that
 * zone, like an ability. When Out, any (Powerless mode has no zone: ruling 54).
 */
export function formAvailable(form: Pick<PlayForm, 'zone'>, zone: PlayZone | undefined): boolean {
  return form.zone === 'green' || zone === 'out' || abilityAvailable(form.zone, zone)
}

/** Whether the hero's forms are Modular modes (so the page says "mode"). */
export function formNoun(forms: readonly PlayForm[]): 'form' | 'mode' {
  return forms.some((f) => f.key?.startsWith('form:')) || !forms.some((f) => f.key) ? 'form' : 'mode'
}

/** The form or mode in use: the recorded one, or the base one (also when the recorded one is gone). */
export function currentForm(forms: readonly PlayForm[], play: Pick<PlayState, 'form'>): PlayForm | undefined {
  return forms.find((f) => f.key !== undefined && f.key === play.form) ?? forms[0]
}

type Kind = TraitRef['kind']

/** What the hero rolls with right now. */
export interface FormDice {
  powers: HeroTrait[]
  qualities: HeroTrait[]
  statusDice?: Record<Zone, Die>
  /** The kinds of the two traits rolled with the status die: a power and a quality, unless Divided Psyche changes it. */
  slots: readonly [Kind, Kind]
  cannot: readonly BasicAction[]
  /** Every power and quality the hero has in any form, for naming one missing from this form. */
  known: readonly HeroTrait[]
}

/** The Divided form the hero is in, or undefined for a hero who isn't Divided. */
export function dividedForm(sheet: Pick<HeroSheet, 'divided'>, play: Pick<PlayState, 'dividedForm'>): 'civilian' | 'heroic' | undefined {
  return sheet.divided ? (play.dividedForm ?? 'civilian') : undefined
}

export function formDice(hero: Hero, sheet: HeroSheet, play: PlayState): FormDice {
  const forms = playForms(sheet)
  const form = currentForm(forms, play)
  const divided = dividedForm(sheet, play)
  let traits: readonly HeroTrait[] = form?.traits ?? [...sheet.powers, ...sheet.qualities]
  if (divided) {
    // The heroic personality's traits replace the hero's own, unless a form or mode sets them.
    if (!form?.key && divided === 'heroic') traits = sheet.divided?.heroicTraits ?? traits
    traits = withoutOtherForm(hero, traits, divided)
  }
  const sorted = [...traits].sort(byDie)
  const psyche = divided && takesDividedPsyche(hero)
  const statusDice = divided === 'heroic' ? (sheet.heroicStatusDice ?? sheet.statusDice) : sheet.statusDice
  return {
    powers: sorted.filter((t) => t.trait.kind === 'power'),
    qualities: sorted.filter((t) => t.trait.kind === 'quality'),
    ...(statusDice ? { statusDice } : {}),
    slots: psyche ? (divided === 'heroic' ? ['power', 'power'] : ['quality', 'quality']) : ['power', 'quality'],
    cannot: form?.cannot ?? [],
    known: [...sheet.powers, ...sheet.qualities, ...(sheet.divided?.heroicTraits ?? []), ...forms.flatMap((f) => f.traits)],
  }
}

const has = (list: readonly HeroTrait[], ref: TraitRef) => list.some((t) => traitKey(t.trait) === traitKey(ref))
const nameOf = (dice: Pick<FormDice, 'known'>, ref: TraitRef) => dice.known.find((t) => traitKey(t.trait) === traitKey(ref))?.name ?? ref.id

/**
 * The traits a roll can choose from: this form's, plus a d4 for each power or quality the
 * ability names that the form doesn't have (rulings 17 and 52).
 */
export function traitChoices(dice: FormDice, use: AbilityUse | undefined): Record<Kind, HeroTrait[]> {
  const add = (kind: Kind, list: HeroTrait[]) => [
    ...list,
    ...(use?.traits ?? []).filter((r) => r.kind === kind && !has(list, r)).map((r) => ({ trait: r, die: 'd4' as const, step: 'archetype' as const, name: `${nameOf(dice, r)} (not in this form)` })),
  ]
  return { power: add('power', dice.powers), quality: add('quality', dice.qualities) }
}

/** A slot's trait, and whether it's fixed: the power or quality chosen for the ability, which must be used. */
export interface Slot {
  trait?: HeroTrait
  fixed: boolean
}

/**
 * Each slot's starting trait: the ability's own power or quality where its kind fits (fixed),
 * then the largest die not already picked; none when every trait of that kind is taken.
 */
export function defaultSlots(choices: Record<Kind, readonly HeroTrait[]>, slots: readonly Kind[], use: AbilityUse | undefined): Slot[] {
  const picked: HeroTrait[] = []
  return slots.map((kind) => {
    const free = choices[kind].filter((t) => !picked.includes(t))
    const named = free.find((t) => use?.traits.some((r) => traitKey(r) === traitKey(t.trait)))
    const trait = named ?? free[0]
    if (trait) picked.push(trait)
    return { ...(trait ? { trait } : {}), fixed: Boolean(named) }
  })
}

/** An ability as the Play page lists it. */
export interface PlayAbility {
  key: string
  name: string
  type: AbilityType
  text: string
  effects: Action[]
  use: AbilityUse
  from: PlayZone
  /** Why it can't be used now, when it can't. */
  blocked?: string
}

const ZONE_HINT: Record<PlayZone, string> = { green: 'Not while Out', yellow: 'Yellow or Red zone', red: 'Red zone only', out: 'When Out' }
const ACTION_NAME: Record<BasicAction, string> = { attack: 'Attack', defend: 'Defend', boost: 'Boost', hinder: 'Hinder', overcome: 'Overcome' }

/** Every ability the hero can use in play, with why each can't be used now. */
export function playAbilities(hero: Hero, sheet: HeroSheet, play: PlayState, zone: PlayZone | undefined): PlayAbility[] {
  const forms = playForms(sheet)
  const form = currentForm(forms, play)
  const divided = dividedForm(sheet, play)
  const dice = formDice(hero, sheet, play)
  type Entry = Omit<PlayAbility, 'blocked'> & { principle?: boolean; only?: PlayForm }
  const list: Entry[] = [
    ...sheet.abilities.map((a) => ({ key: `${a.source}:${a.baseName}`, name: a.name, type: a.type, text: a.text, effects: a.effects, use: a.use, from: a.zone, principle: a.source === 'principle' })),
    ...forms.flatMap((f) => (f.ability && f.key ? [{ key: f.key, ...f.ability, from: f.zone, only: f }] : [])),
    ...(sheet.outAbility && sheet.outUse ? [{ key: 'out', name: 'Out ability', type: 'A' as const, text: sheet.outAbility, effects: sheet.outEffects, use: sheet.outUse, from: 'out' as const }] : []),
  ]
  return list.map(({ principle, only, ...a }) => {
    const missing = a.use.traits.filter((r) => !has([...dice.powers, ...dice.qualities], r))
    const forbidden = a.use.effects.length > 0 && a.use.effects.every((e) => e.actions.every((x) => x !== 'recover' && dice.cannot.includes(x)))
    const blocked = !abilityAvailable(a.from, zone)
      ? ZONE_HINT[a.from]
      : a.type === 'R' && play.reactionUsed
        ? 'Reaction used this round'
        : only && only !== form
          ? `Only in ${only.name}`
          : form?.powerless && !principle && a.from !== 'out'
            ? 'Only principle abilities in Powerless mode'
            : forbidden
              ? `Can't ${[...new Set(a.use.effects.flatMap((e) => e.actions))].map((x) => ACTION_NAME[x as BasicAction]).join(' or ')} in ${form!.name}`
              : divided && a.from !== 'out' && missing.length
                ? `Needs ${missing.map((r) => nameOf(dice, r)).join(' and ')}, not in your ${divided} form`
                : undefined
    return blocked ? { ...a, blocked } : a
  })
}
