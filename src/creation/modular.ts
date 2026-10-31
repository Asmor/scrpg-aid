/**
 * Modular (Core Rules p. 96–98): modes, built on a base archetype (see ./layers.ts).
 *
 * The base archetype gives the hero's powers and qualities, and its bonuses and Health
 * options still apply, but its abilities are skipped. If that leaves fewer than four
 * powers, the hero adds d6 "filler" powers (checked in ./traits.ts). The hero's dice as
 * derived are the default Green mode. On top of that the hero builds one more Green mode,
 * two Yellow modes, and one Red mode, and may take a Powerless mode.
 *
 * Each mode picks some default-mode powers and adjusts their dice (kept the same, down
 * one size, up one or two sizes, or set to a die), and grants one ability. Following the
 * user's rulings:
 * - every mode is different;
 * - in a mode only the powers that mode picks are available (qualities are unchanged);
 * - raising a d12 or lowering a d4 is allowed and simply leaves the die where it is;
 * - the retcon that changes which power an ability uses can target a mode's ability,
 *   and the new power must be one of that mode's powers.
 */
import { traitKey, type TraitRef } from '../rules/catalog'
import { stepDie } from '../rules/dice'
import type { Ability, Die, ModularMode, Zone } from '../rules/types'
import type { AbilityPick, Hero, ModeChoice, TraitAssignment } from '../hero/model'
import { checkAbilityPick } from './abilities'
import { outerLayer } from './layers'
import { traitLabel, type HeroTrait } from './traits'
import { markPart, warning, type IssueCode, type RuleWarning } from './warnings'

/** A mode's entry in the data, and the zone whose list it's on. */
export function findMode(hero: Hero, id: string): { mode: ModularMode; zone: Zone } | undefined {
  const modes = outerLayer(hero)?.archetype.modes
  if (!modes) return undefined
  for (const zone of ['green', 'yellow', 'red'] as const) {
    const mode = modes[zone].options.find((m) => m.id === id)
    if (mode) return { mode, zone }
  }
  return undefined
}

/** The hero's powers and qualities in a mode: that mode's powers at their mode dice, plus every quality. */
export function modeTraits(hero: Hero, traits: readonly HeroTrait[], powers: ModeChoice['powers']): HeroTrait[] {
  return [...powers.map((a) => ({ trait: a.trait, die: a.die, step: 'archetype' as const, name: traitLabel(hero, a.trait) })), ...traits.filter((t) => t.trait.kind === 'quality')]
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The modes of one zone the editor shows: one slot per mode the zone asks for, plus any
 * extra ones recorded there. Each slot has the mode (if recorded) and its index in `modes`.
 * Modes with an unknown id fill no slot (see `strayModes`).
 */
export function modeSlots(hero: Hero, modes: readonly ModeChoice[], zone: Zone, count: number): { mode?: ModeChoice; index?: number }[] {
  const recorded = modes.flatMap((mode, index) => (findMode(hero, mode.id)?.zone === zone ? [{ mode, index }] : []))
  return Array.from({ length: Math.max(count, recorded.length) }, (_, i) => recorded[i] ?? {})
}

/** Recorded modes whose id isn't a mode, with their index in `modes`, so they can be removed. */
export function strayModes(hero: Hero, modes: readonly ModeChoice[]): { mode: ModeChoice; index: number }[] {
  return modes.flatMap((mode, index) => (findMode(hero, mode.id) ? [] : [{ mode, index }]))
}

/** Sets the mode in `slot`, adding it if it isn't recorded yet, or removes it with `next` undefined. */
export function setModeSlot(modes: readonly ModeChoice[], slot: { index?: number }, next: ModeChoice | undefined): ModeChoice[] {
  if (slot.index === undefined) return next ? [...modes, next] : [...modes]
  return next ? modes.map((m, i) => (i === slot.index ? next : m)) : modes.filter((_, i) => i !== slot.index)
}

/** "keeps 1 the same, lowers 1 one size, and raises 2 one size" */
export function describeAdjustment(mode: ModularMode): string {
  const parts = [
    mode.same && `keeps ${mode.same} the same`,
    mode.down && `lowers ${mode.down} one size`,
    mode.upCount && `raises ${mode.upCount} one size`,
    mode.upTwoSteps && `raises ${mode.upTwoSteps} two sizes`,
    mode.setTo && `sets ${mode.setTo.count} to ${mode.setTo.die}`,
  ].filter((p): p is string => Boolean(p))
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}` : (parts[0] ?? '')
  return `${mode.name} uses ${plural(mode.pickPowers, 'default-mode power')}: it ${list}.`
}

/** One change in a mode's recipe: raise a power one or two sizes, lower it one, keep it, or set it to a die. */
export type ModeChange = { kind: 'up'; steps: 1 | 2 } | { kind: 'down' } | { kind: 'same' } | { kind: 'set'; die: Die }

/**
 * A mode's recipe as rows, one per power it changes, in the order the editor lists them
 * (the hero wizard spec, "Modular mode recipes"): raises, lowers, same sizes, then set dice.
 */
export function modeRecipe(mode: ModularMode): ModeChange[] {
  const rows: ModeChange[] = []
  const add = (count: number | undefined, change: ModeChange) => {
    for (let i = 0; i < (count ?? 0); i++) rows.push(change)
  }
  add(mode.upTwoSteps, { kind: 'up', steps: 2 })
  add(mode.upCount, { kind: 'up', steps: 1 })
  add(mode.down, { kind: 'down' })
  add(mode.same, { kind: 'same' })
  if (mode.setTo) add(mode.setTo.count, { kind: 'set', die: mode.setTo.die })
  return rows
}

/** "Raise 1 size", "Lower 1 size", "Same size", "Set to d12". */
export function changeLabel(change: ModeChange): string {
  switch (change.kind) {
    case 'up':
      return `Raise ${change.steps} ${change.steps === 1 ? 'size' : 'sizes'}`
    case 'down':
      return 'Lower 1 size'
    case 'same':
      return 'Same size'
    case 'set':
      return `Set to ${change.die}`
  }
}

/** The die a power at `from` has after `change`. Past d12 or d4 it stays where it is (ruling 40). */
export function changeDie(change: ModeChange, from: Die): Die {
  switch (change.kind) {
    case 'up':
      return stepDie(from, change.steps)
    case 'down':
      return stepDie(from, -1)
    case 'same':
      return from
    case 'set':
      return change.die
  }
}

/** Why a change leaves a die where it is, for the option text: a d12 raised, a d4 lowered (ruling 40). */
export function changeNote(change: ModeChange, from: Die): string | undefined {
  if (change.kind === 'up' && from === 'd12') return 'already the largest'
  if (change.kind === 'down' && from === 'd4') return 'already the smallest'
  return undefined
}

/** "Choose a power to raise one size." for an empty row. */
function emptyRowText(change: ModeChange): string {
  switch (change.kind) {
    case 'up':
      return `Choose a power to raise ${change.steps === 1 ? 'one size' : 'two sizes'}.`
    case 'down':
      return 'Choose a power to lower one size.'
    case 'same':
      return 'Choose a power to keep at the same size.'
    case 'set':
      return `Choose a power to set to ${change.die}.`
  }
}

/** One row of a mode: its change, the power in it (if any), and whether that power's die is what the change gives. */
export interface ModeRow {
  change: ModeChange
  power?: TraitAssignment
  fits: boolean
}

/**
 * Reads a mode's recorded powers as its recipe rows. Each power goes in a row its die fits
 * (as many as can, earliest rows first); a power that fits none, as a mode saved by the old
 * editor might have, takes the first empty row, unfitting; any left over are `extra`. The
 * saved format stays a list of powers at their mode dice; the rows are only a view of it.
 * `defaults` is the default mode's powers' dice, by traitKey.
 */
export function modeRows(mode: ModularMode, powers: readonly TraitAssignment[], defaults: ReadonlyMap<string, Die>): { rows: ModeRow[]; extra: TraitAssignment[] } {
  const recipe = modeRecipe(mode)
  const fits = (change: ModeChange, a: TraitAssignment) => {
    const from = defaults.get(traitKey(a.trait))
    return from !== undefined && changeDie(change, from) === a.die
  }
  // A maximum matching of powers to rows that fit them (augmenting paths). A d12 fits a Raise
  // row too (ruling 40), so each power tries the rows that really change its die first.
  const rowOf = new Array<number | undefined>(recipe.length).fill(undefined)
  const order = (a: TraitAssignment) => {
    const from = defaults.get(traitKey(a.trait))
    const real = (r: number) => !from || !changeNote(recipe[r]!, from)
    return recipe.map((_, r) => r).sort((x, y) => Number(!real(x)) - Number(!real(y)))
  }
  // A free row is taken before moving another power, so powers saved in row order read back the same.
  const place = (p: number, seen: Set<number>): boolean => {
    const free = order(powers[p]!).find((r) => rowOf[r] === undefined && !seen.has(r) && fits(recipe[r]!, powers[p]!))
    if (free !== undefined) {
      rowOf[free] = p
      return true
    }
    for (const r of order(powers[p]!)) {
      if (seen.has(r) || !fits(recipe[r]!, powers[p]!)) continue
      seen.add(r)
      if (rowOf[r] === undefined || place(rowOf[r]!, seen)) {
        rowOf[r] = p
        return true
      }
    }
    return false
  }
  powers.forEach((_, p) => place(p, new Set()))
  const unplaced = powers.filter((_, p) => !rowOf.includes(p))
  const rows: ModeRow[] = recipe.map((change, r) => (rowOf[r] === undefined ? { change, fits: false } : { change, power: powers[rowOf[r]!]!, fits: true }))
  for (const row of rows) {
    if (!row.power && unplaced.length) row.power = unplaced.shift()!
  }
  return { rows, extra: unplaced }
}

/**
 * Puts `trait` (a default-mode power) in row `index` at the die that row's change gives it, or
 * empties the row; returns the mode's new powers. The saved list can't record an empty row, so
 * rows with the same change are interchangeable: a power picked in the second of two empty
 * "Raise 1 size" rows reads back in the first.
 */
export function setModeRow(mode: ModularMode, powers: readonly TraitAssignment[], defaults: ReadonlyMap<string, Die>, index: number, trait: TraitRef | undefined): TraitAssignment[] {
  const { rows, extra } = modeRows(mode, powers, defaults)
  const row = rows[index]
  if (!row) return [...powers]
  const from = trait && defaults.get(traitKey(trait))
  if (trait && from) row.power = { trait, die: changeDie(row.change, from) }
  else delete row.power
  return [...rows.flatMap((r) => (r.power ? [r.power] : [])), ...extra]
}

/** The default mode's powers' dice, by traitKey: what modes change. */
export function defaultModeDice(traits: readonly HeroTrait[]): Map<string, Die> {
  return new Map(traits.filter((t) => t.trait.kind === 'power').map((t) => [traitKey(t.trait), t.die]))
}

/** The field a mode row's problem is about (RuleWarning.field). */
export const modeRowField = (modeId: string, index: number) => `mode-row:${modeId}:${index}`

/** A mode's ability pick with the ability retcon applied, if it targets this mode's ability. */
export function modeAbilityPick(hero: Hero, mode: ModeChoice): AbilityPick | undefined {
  const retcon = hero.retcon
  if (mode.ability && retcon?.kind === 'changeAbilityTrait' && retcon.ability.source === 'archetype.mode' && retcon.ability.name === mode.ability.name) {
    return { ...mode.ability, uses: retcon.uses }
  }
  return mode.ability
}

/** Checks Modular's modes, its Powerless mode, and the ability retcon on a mode ability. */
export function checkModular(hero: Hero, traits: readonly HeroTrait[]): RuleWarning[] {
  const warnings: RuleWarning[] = []
  const warn = (code: IssueCode, message: string, field?: string) => warnings.push(warning('archetype', code, message, field))
  const outer = outerLayer(hero)
  const spec = outer?.archetype.modes
  const choice = hero.archetype?.modular
  const retcon = hero.retcon?.kind === 'changeAbilityTrait' && hero.retcon.ability.source === 'archetype.mode' ? hero.retcon : undefined
  if (hero.archetype?.secondary?.modular) warn('unexpected-modular', "Record Modular's modes on Modular, not on the archetype it builds on.")
  if (!outer || !spec) {
    if (choice) warn('unexpected-modular', `${outer?.archetype.name ?? 'This archetype'} doesn't have modes.`)
    if (retcon) warnings.push(warning('retcon', 'retcon-ability-missing', `This retcon changes ${retcon.ability.name}, which none of your modes has.`))
    return warnings
  }

  // Modular's only abilities are its fixed ones (checked in ./abilities.ts) and its modes'.
  const fixedSources: readonly string[] = ['archetype.fixedGreen', 'archetype.fixedYellow', 'archetype.fixedRed']
  const ownFrom = warnings.length
  for (const p of hero.archetype!.abilities) {
    if (!fixedSources.includes(p.source)) {
      warn('unknown-ability', `${p.name} isn't one of ${outer.archetype.name}'s abilities; mode abilities go with their modes.`)
    }
  }

  markPart(warnings, ownFrom, 'own')

  const powers = new Map(traits.filter((t) => t.trait.kind === 'power').map((t) => [traitKey(t.trait), t]))
  const defaults = defaultModeDice(traits)
  const modes = choice?.modes ?? []
  const placed = modes.map((m) => ({ choice: m, found: findMode(hero, m.id) }))

  // How many of each zone, all different (the user's ruling).
  for (const zone of ['green', 'yellow', 'red'] as const) {
    const n = placed.filter((p) => p.found?.zone === zone).length
    const wanted = spec[zone].count
    const label = `${zone[0]!.toUpperCase()}${zone.slice(1)}`
    const from = warnings.length
    if (n !== wanted) warn('mode-count', `Choose ${plural(wanted, `${label} mode`)} besides your default mode; you have ${n}.`)
    // A missing mode goes with the first one of its color still to choose.
    markPart(warnings, from, `mode:${zone}:${Math.min(n, wanted - 1)}`)
  }
  const seen = new Set<string>()
  for (const { choice: m, found } of placed) {
    if (!found) {
      warn('unknown-entry', `Unknown mode "${m.id}".`)
      continue
    }
    const modeFrom = warnings.length
    checkMode(m, found)
    markPart(warnings, modeFrom, `mode:${found.zone}:${placed.filter((p) => p.found?.zone === found.zone).findIndex((p) => p.choice === m)}`)
  }

  function checkMode(m: ModeChoice, found: NonNullable<ReturnType<typeof findMode>>): void {
    const { mode } = found
    if (seen.has(mode.id)) warn('mode-twice', `Each mode must be different; you took ${mode.name} more than once.`)
    seen.add(mode.id)

    // Its powers: default-mode powers, each once, one per change in the mode's recipe.
    const keys = new Set<string>()
    for (const a of m.powers) {
      const key = traitKey(a.trait)
      if (keys.has(key)) warn('assigned-twice', `${mode.name} uses ${traitLabel(hero, a.trait)} more than once.`)
      keys.add(key)
    }
    const { rows, extra } = modeRows(mode, m.powers, defaults)
    rows.forEach((row, i) => {
      const field = modeRowField(m.id, i)
      if (!row.power) return warn('mode-row-empty', emptyRowText(row.change), field)
      if (row.fits) return
      const name = traitLabel(hero, row.power.trait)
      const from = defaults.get(traitKey(row.power.trait))
      if (!from) warn('mode-not-held', `${mode.name} can only use your default-mode powers; ${name} isn't one.`, field)
      else warn('mode-row-misfit', `${name} is ${row.power.die} in ${mode.name}, but ${changeLabel(row.change).toLowerCase()} makes it ${changeDie(row.change, from)}. Choose it again, or another power.`, field)
    })
    if (extra.length) {
      const names = extra.map((a) => traitLabel(hero, a.trait))
      warn('mode-dice', `${mode.name} changes ${plural(mode.pickPowers, 'power')}; remove ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}.`)
    }

    // Its ability, using that mode's powers.
    const inMode = modeTraits(hero, traits, m.powers)
    if (!m.ability) {
      warn('mode-ability-missing', `Fill in ${mode.ability.name}, ${mode.name}'s ability.`)
    } else if (m.ability.name !== mode.ability.name) {
      warn('unknown-ability', `${m.ability.name} isn't ${mode.name}'s ability; that's ${mode.ability.name}.`)
    } else {
      if (m.ability.source !== 'archetype.mode') warn('mode-ability-source', `${mode.ability.name} should be recorded as a mode ability.`)
      warnings.push(...checkAbilityPick(hero, inMode, mode.ability, m.ability, 'archetype'))
    }
  }

  // The optional Powerless mode: two default-mode powers at the given dice.
  const powerless = choice?.powerless
  const powerlessFrom = warnings.length
  if (powerless) {
    const keys = new Set(powerless.map((a) => traitKey(a.trait)))
    const dice = powerless
      .map((a) => a.die)
      .sort()
      .join()
    const wanted = [...spec.powerless.dice].sort().join()
    if (keys.size !== powerless.length || dice !== wanted) {
      warn('powerless-dice', `Powerless mode puts ${spec.powerless.dice.join(' and ')} on two different default-mode powers.`)
    }
    for (const a of powerless) {
      if (!powers.has(traitKey(a.trait))) warn('mode-not-held', `Powerless mode can only use your default-mode powers; ${traitLabel(hero, a.trait)} isn't one.`)
    }
  }

  markPart(warnings, powerlessFrom, 'powerless')

  if (retcon) checkModeRetcon(hero, traits, modes, retcon.ability.name, retcon.uses, warnings)
  return warnings
}

function checkModeRetcon(hero: Hero, traits: readonly HeroTrait[], modes: readonly ModeChoice[], name: string, uses: AbilityPick['uses'], warnings: RuleWarning[]): void {
  const m = modes.find((x) => x.ability?.name === name)
  const ability: Ability | undefined = m && findMode(hero, m.id)?.mode.ability
  if (!m?.ability || !ability || ability.name !== name) {
    warnings.push(warning('retcon', 'retcon-ability-missing', `This retcon changes ${name}, which none of your modes has.`))
    return
  }
  warnings.push(...checkAbilityPick(hero, modeTraits(hero, traits, m.powers), ability, { ...m.ability, uses }, 'retcon'))
  if ((m.ability.uses ?? []).map(traitKey).join() === (uses ?? []).map(traitKey).join()) {
    warnings.push(warning('retcon', 'retcon-no-change', `This retcon should change what ${ability.name} uses; it's the same as before.`))
  }
}
