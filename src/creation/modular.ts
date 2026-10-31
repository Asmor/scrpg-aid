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
import { traitKey } from '../rules/catalog'
import { sortDice, stepDie } from '../rules/dice'
import type { Ability, Die, ModularMode, Zone } from '../rules/types'
import type { AbilityPick, Hero, ModeChoice } from '../hero/model'
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
  return [
    ...powers.map((a) => ({ trait: a.trait, die: a.die, step: 'archetype' as const, name: traitLabel(hero, a.trait) })),
    ...traits.filter((t) => t.trait.kind === 'quality'),
  ]
}

/** How a mode changes its powers, as a list of slots each picked power fills. */
function slotsOf(mode: ModularMode): ((from: Die, to: Die) => boolean)[] {
  const slots: ((from: Die, to: Die) => boolean)[] = []
  const add = (count: number | undefined, fits: (from: Die, to: Die) => boolean) => {
    for (let i = 0; i < (count ?? 0); i++) slots.push(fits)
  }
  // Steps past d4 or d12 leave the die where it is (the user's ruling).
  add(mode.same, (from, to) => to === from)
  add(mode.down, (from, to) => to === stepDie(from, -1))
  add(mode.upCount, (from, to) => to === stepDie(from, 1))
  add(mode.upTwoSteps, (from, to) => to === stepDie(from, 2))
  add(mode.setTo?.count, (_from, to) => to === mode.setTo!.die)
  return slots
}

/** Whether each picked power can fill a different slot (a small bipartite matching). */
function fitsSlots(changes: readonly { from: Die; to: Die }[], slots: readonly ((from: Die, to: Die) => boolean)[]): boolean {
  if (changes.length !== slots.length) return false
  const used = new Array<boolean>(slots.length).fill(false)
  const place = (i: number): boolean => {
    if (i === changes.length) return true
    for (let s = 0; s < slots.length; s++) {
      if (!used[s] && slots[s]!(changes[i]!.from, changes[i]!.to)) {
        used[s] = true
        if (place(i + 1)) return true
        used[s] = false
      }
    }
    return false
  }
  return place(0)
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The dice a mode may give a default-mode power at `from`, largest first, for the UI. */
export function modeDieOptions(mode: ModularMode, from: Die): Die[] {
  const dice = [
    mode.upTwoSteps && stepDie(from, 2),
    mode.upCount && stepDie(from, 1),
    mode.setTo?.die,
    mode.same && from,
    mode.down && stepDie(from, -1),
  ].filter((d): d is Die => Boolean(d))
  return sortDice([...new Set(dice)]).reverse()
}

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
  const warn = (code: IssueCode, message: string) => warnings.push(warning('archetype', code, message))
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

    // Its powers: default-mode powers, each once, adjusted as the mode says.
    const keys = new Set<string>()
    for (const a of m.powers) {
      const key = traitKey(a.trait)
      if (keys.has(key)) warn('assigned-twice', `${mode.name} uses ${traitLabel(hero, a.trait)} more than once.`)
      keys.add(key)
      if (!powers.has(key)) warn('mode-not-held', `${mode.name} can only use your default-mode powers; ${traitLabel(hero, a.trait)} isn't one.`)
    }
    const changes = m.powers.flatMap((a) => {
      const from = powers.get(traitKey(a.trait))?.die
      return from ? [{ from, to: a.die }] : []
    })
    if (m.powers.length !== mode.pickPowers || keys.size !== m.powers.length || !fitsSlots(changes, slotsOf(mode))) {
      warn('mode-dice', describeAdjustment(mode))
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
    const dice = powerless.map((a) => a.die).sort().join()
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
