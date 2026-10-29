/**
 * Works out a hero's final powers and qualities (and their dice) from the choices in
 * each step, and reports rule problems as warnings.
 *
 * Steps apply in order: background, power source, archetype, personality, retcon.
 * The latest assignment to a trait sets its die. See src/hero/model.ts for the
 * `upgrades` rule: when a step gives a die to a trait the hero already has, the player
 * either upgrades it with the bigger new die (the old die then joins this step's dice to
 * assign elsewhere) or should put the new die on something else.
 *
 * Divided and Modular build on a second archetype, whose powers, qualities, and bonuses
 * the hero takes (see ./layers.ts); their own dice are recorded on that second archetype.
 */
import { describeRef, getCategory, getTrait, refsMatch, traitKey, type TraitRef } from '../rules/catalog'
import {
  archetypesById,
  backgroundsById,
  personalitiesById,
  personalityStep,
  powerSourcesById,
  retconsById,
} from '../rules/data'
import { compareDice, sortDice, stepDie } from '../rules/dice'
import type { Archetype, Bonus, Die, OptionRef, PowerSource, RequiredRef } from '../rules/types'
import type { ArchetypeChoice, Hero, TraitAssignment } from '../hero/model'
import { traitLayer } from './layers'
import { warning, type RuleWarning, type StepId } from './warnings'

export interface HeroTrait {
  trait: TraitRef
  die: Die
  /** The step that last set this trait's die. */
  step: StepId
  /** The player's name for it if they gave one, otherwise the catalog name. */
  name: string
}

export interface TraitDerivation {
  traits: HeroTrait[]
  warnings: RuleWarning[]
}

/** A die freed by upgrading a trait the hero already had, and that trait's name. */
export interface FreedDie {
  die: Die
  from: string
}

export const ROLEPLAYING_QUALITY: TraitRef = { kind: 'quality', id: 'roleplaying-quality' }

/** The display name of a trait for a hero. */
export function traitLabel(hero: Hero, trait: TraitRef): string {
  return hero.traitNames[traitKey(trait)] || getTrait(trait)?.name || trait.id
}

function diceList(dice: readonly Die[]): string {
  return sortDice(dice).reverse().join(', ')
}

/** "a d8, d10, or d12" */
function listOr(dice: readonly Die[]): string {
  const items = [...dice]
  if (items.length <= 2) return `a ${items.join(' or ')}`
  return `a ${items.slice(0, -1).join(', ')}, or ${items.at(-1)}`
}

function dieCountText(count = 1): string {
  return count === 1 ? 'a die' : `${count} dice`
}

/** Whether two lists hold the same dice, ignoring order. */
function sameDice(a: readonly Die[], b: readonly Die[]): boolean {
  const x = sortDice(a)
  const y = sortDice(b)
  return x.length === y.length && x.every((d, i) => d === y[i])
}

/** A required entry as a plain option reference (without dieCount). */
function requiredRef(r: RequiredRef): OptionRef {
  const { dieCount, ...ref } = r
  void dieCount
  return ref as OptionRef
}

class TraitState {
  readonly traits = new Map<string, HeroTrait>()
  readonly warnings: RuleWarning[] = []
  readonly hero: Hero

  constructor(hero: Hero) {
    this.hero = hero
  }

  label(trait: TraitRef): string {
    return traitLabel(this.hero, trait)
  }

  warn(step: StepId, code: string, message: string): void {
    this.warnings.push(warning(step, code, message))
  }

  get(trait: TraitRef): HeroTrait | undefined {
    return this.traits.get(traitKey(trait))
  }

  set(trait: TraitRef, die: Die, step: StepId): void {
    this.traits.set(traitKey(trait), { trait, die, step, name: this.label(trait) })
  }

  snapshot(): ReadonlyMap<string, HeroTrait> {
    return new Map(this.traits)
  }

  /**
   * Applies one step's main assignments and returns the dice freed by replacements.
   * Warns about unknown traits, traits assigned twice in the step, and traits the hero
   * already had without `upgrades`. A trait `canSwap` allows may take any die in place of
   * its old one, not just a bigger one (an archetype's required trait, ruling 43).
   */
  assign(step: StepId, assignments: readonly TraitAssignment[], canSwap: (trait: TraitRef) => boolean = () => false): FreedDie[] {
    const freed: FreedDie[] = []
    const inStep = new Set<string>()
    for (const a of assignments) {
      const key = traitKey(a.trait)
      if (!getTrait(a.trait)) this.warn(step, 'unknown-trait', `"${a.trait.id}" isn't a known ${a.trait.kind}.`)
      if (inStep.has(key)) {
        this.warn(step, 'assigned-twice', `${this.label(a.trait)} gets more than one die in this step.`)
      }
      inStep.add(key)
      const existing = this.get(a.trait)
      if (existing && existing.step !== step) {
        if (a.upgrades) {
          freed.push({ die: existing.die, from: this.label(a.trait) })
          if (compareDice(a.die, existing.die) <= 0 && !canSwap(a.trait)) {
            this.warn(step, 'not-an-upgrade', `Only a bigger die can upgrade ${this.label(a.trait)}, which is already ${existing.die}.`)
          }
        } else {
          this.warn(
            step,
            'already-have',
            `You already have ${this.label(a.trait)} at ${existing.die}. Either upgrade it with this ${a.die} (and assign the old die elsewhere in this step) or put the ${a.die} on something else.`,
          )
        }
      } else if (!existing && a.upgrades) {
        this.warn(step, 'nothing-to-upgrade', `${this.label(a.trait)} is marked as an upgrade, but you don't have it yet.`)
      }
      this.set(a.trait, a.die, step)
    }
    return freed
  }

  /**
   * Checks that a step's assignments use exactly its dice, plus any dice freed by upgrading a
   * trait the hero had: the old die is used elsewhere in the same step (no die is wasted).
   */
  checkPool(step: StepId, pool: readonly Die[], freed: readonly FreedDie[], assignments: readonly TraitAssignment[]): void {
    const expected = [...pool, ...freed.map((f) => f.die)]
    const assigned = assignments.map((a) => a.die)
    if (!sameDice(expected, assigned)) {
      const got = assigned.length ? `the dice assigned are ${diceList(assigned)}` : 'no dice are assigned yet'
      // Name the swapped-off dice, which aren't among the step's own.
      const plus = freed.length ? `, plus ${freed.map((f) => `the ${f.die} swapped off ${f.from}`).join(' and ')} to use elsewhere in this step` : ''
      this.warn(step, 'dice-mismatch', `This step's dice are ${diceList(pool)}${plus}, but ${got}.`)
    }
  }

  /** Warns about assignments whose trait isn't allowed by `allowed`. */
  checkOnList(step: StepId, assignments: readonly TraitAssignment[], allowed: readonly OptionRef[], what: string): void {
    for (const a of assignments) {
      if (getTrait(a.trait) && !refsMatch(allowed, a.trait)) {
        this.warn(step, 'not-on-list', `${this.label(a.trait)} isn't on the ${what} list.`)
      }
    }
  }
}

/** Context a bonus needs: the lists it may refer to and the traits before it applied. */
interface BonusContext {
  step: StepId
  source: string
  /** The power source's power list, for "listed" bonuses. */
  listed: readonly OptionRef[]
  archetype: Archetype | undefined
  before: ReadonlyMap<string, HeroTrait>
}

/** Applies a bonus's assignments and checks them against the bonus's rules. */
function applyBonus(state: TraitState, bonus: Bonus, assignments: readonly TraitAssignment[], ctx: BonusContext): void {
  const { step, source } = ctx
  const warn = (code: string, message: string) => state.warn(step, code, message)
  const prior = (t: TraitRef) => ctx.before.get(traitKey(t))
  const expectCount = (n: number) => {
    if (assignments.length === 0) {
      warn('bonus-not-taken', `${source}'s bonus hasn't been taken yet: ${bonus.summary}`)
      return false
    }
    if (assignments.length !== n) warn('bonus-count', `${source}'s bonus changes ${n} trait${n === 1 ? '' : 's'}, not ${assignments.length}.`)
    return true
  }
  const expectDie = (a: TraitAssignment, die: Die) => {
    if (a.die !== die) warn('bonus-die', `${source}'s bonus gives ${state.label(a.trait)} a ${die}, not a ${a.die}.`)
  }
  const expectKind = (a: TraitAssignment, kinds: readonly string[]) => {
    if (!kinds.includes(a.trait.kind)) warn('bonus-kind', `${source}'s bonus applies to a ${kinds.join(' or ')}, not ${state.label(a.trait)}.`)
  }
  /** A granted die may go on a trait the hero has only as an upgrade (the user's ruling). */
  const expectNewOrUpgrade = (a: TraitAssignment) => {
    const old = prior(a.trait)
    if (old && compareDice(a.die, old.die) <= 0) {
      warn('not-an-upgrade', `${source}'s bonus can only upgrade ${state.label(a.trait)}, which is already ${old.die}. Choose something else.`)
    }
  }
  for (const a of assignments) {
    if (!getTrait(a.trait)) warn('unknown-trait', `"${a.trait.id}" isn't a known ${a.trait.kind}.`)
  }

  switch (bonus.kind) {
    case 'gainQuality':
    case 'gainPower': {
      if (!expectCount(1)) break
      const a = assignments[0]!
      expectKind(a, [bonus.kind === 'gainQuality' ? 'quality' : 'power'])
      expectDie(a, bonus.die)
      if (bonus.options && !refsMatch(bonus.options, a.trait)) warn('bonus-not-on-list', `${state.label(a.trait)} isn't one of the choices for ${source}'s bonus.`)
      if (bonus.kind === 'gainPower' && bonus.excludeListed && refsMatch(ctx.listed, a.trait)) {
        warn('bonus-not-on-list', `${source}'s bonus must be a power that isn't on its own list, but ${state.label(a.trait)} is.`)
      }
      if (bonus.kind === 'gainPower' && bonus.mustBeNew && prior(a.trait)) {
        warn('bonus-not-new', `${source}'s bonus must be a power you don't already have, but you have ${state.label(a.trait)}.`)
      } else {
        expectNewOrUpgrade(a)
      }
      break
    }
    case 'extraArchetypeQuality': {
      if (!expectCount(1)) break
      const a = assignments[0]!
      expectKind(a, ['quality'])
      expectDie(a, bonus.die)
      if (ctx.archetype?.qualities && !refsMatch(ctx.archetype.qualities.options, a.trait)) {
        warn('bonus-not-on-list', `${state.label(a.trait)} isn't on ${ctx.archetype.name}'s quality list.`)
      }
      expectNewOrUpgrade(a)
      break
    }
    case 'upgradeDie': {
      if (!expectCount(1)) break
      const a = assignments[0]!
      const old = prior(a.trait)
      if (!old) {
        // "If you have no d6 powers" looks at powers only; the user ruled that a hero with a
        // d6 quality but no d6 powers may take either the upgrade or this fallback.
        const fallback = bonus.fallback
        const noMatchingPowers = ![...ctx.before.values()].some((t) => t.trait.kind === 'power' && (bonus.from ?? []).includes(t.die))
        if (fallback && noMatchingPowers) {
          expectKind(a, ['power'])
          expectDie(a, fallback.die)
          if (fallback.fromListed && !refsMatch(ctx.listed, a.trait)) {
            warn('bonus-not-on-list', `${state.label(a.trait)} isn't on ${source}'s power list.`)
          }
        } else {
          warn('bonus-needs-existing', `${source}'s bonus upgrades a ${bonus.targets.join(' or ')} you already have; you don't have ${state.label(a.trait)}.`)
        }
        break
      }
      expectKind(a, bonus.targets)
      if (bonus.from && !bonus.from.includes(old.die)) {
        warn('bonus-wrong-die', `${source}'s bonus upgrades ${listOr(bonus.from)}, but ${state.label(a.trait)} is ${old.die}.`)
      }
      const max = bonus.max ?? 'd12'
      if (!bonus.to && old.die === max) {
        warn('already-max', `${state.label(a.trait)} is already ${max}, so ${source}'s bonus can't raise it. Choose something else.`)
        break
      }
      expectDie(a, bonus.to ?? stepDie(old.die, bonus.steps ?? 1, { max }))
      break
    }
    case 'shiftDice': {
      if (!expectCount(2)) break
      const changes = assignments.map((a) => ({ a, old: prior(a.trait) }))
      const down = changes.find((c) => c.old && compareDice(c.a.die, c.old.die) < 0)
      const up = changes.find((c) => c.old && compareDice(c.a.die, c.old.die) > 0)
      if (!down || !up || traitKey(down.a.trait) === traitKey(up.a.trait)) {
        warn('bonus-shift', `${source}'s bonus must lower one power you have and raise a different one.`)
        break
      }
      for (const [change, rule, sign, word] of [
        [down, bonus.downgrade, -1, 'lowers'],
        [up, bonus.upgrade, 1, 'raises'],
      ] as const) {
        expectKind(change.a, rule.targets)
        if (!rule.from.includes(change.old!.die)) {
          warn('bonus-wrong-die', `${source}'s bonus ${word} ${listOr(rule.from)}, but ${state.label(change.a.trait)} is ${change.old!.die}.`)
        }
        expectDie(change.a, stepDie(change.old!.die, sign * rule.steps))
      }
      break
    }
  }
  for (const a of assignments) state.set(a.trait, a.die, step)
}

/** Applies a step's bonus assignments, or warns when there's a bonus with nothing taken (or the reverse). */
function applyBonuses(
  state: TraitState,
  bonuses: readonly Bonus[],
  assignments: readonly TraitAssignment[],
  ctx: Omit<BonusContext, 'before'>,
): void {
  if (bonuses.length === 0) {
    if (assignments.length) state.warn(ctx.step, 'unexpected-bonus', `${ctx.source} doesn't give a bonus, but some bonus dice are recorded.`)
    return
  }
  // Every bonus in the data is the only one for its entry; if that changes, assignments need tagging.
  applyBonus(state, bonuses[0]!, assignments, { ...ctx, before: state.snapshot() })
}

function backgroundStep(state: TraitState, hero: Hero): void {
  const choice = hero.background
  if (!choice) return
  const bg = backgroundsById.get(choice.id)
  if (!bg) return state.warn('background', 'unknown-entry', `Unknown background "${choice.id}".`)
  const freed = state.assign('background', choice.qualities)
  const required = (bg.qualities.required ?? []).map(requiredRef)
  for (const a of choice.qualities) {
    if (a.trait.kind !== 'quality') state.warn('background', 'wrong-kind', `${bg.name} gives qualities, but ${state.label(a.trait)} is a power.`)
  }
  state.checkOnList('background', choice.qualities.filter((a) => a.trait.kind === 'quality'), [...bg.qualities.options, ...required], bg.name)
  for (const r of bg.qualities.required ?? []) {
    const n = choice.qualities.filter((a) => refsMatch([requiredRef(r)], a.trait)).length
    if (n < (r.dieCount ?? 1)) {
      state.warn('background', 'missing-required', `${bg.name} needs ${dieCountText(r.dieCount)} on ${describeOption(requiredRef(r))}.`)
    }
  }
  state.checkPool('background', bg.qualities.dice, freed, choice.qualities)
}

function powerSourceStep(state: TraitState, hero: Hero, ps: PowerSource): void {
  const choice = hero.powerSource!
  const freed = state.assign('powerSource', choice.powers)
  const required = (ps.powers.required ?? []).map(requiredRef)
  for (const a of choice.powers) {
    if (a.trait.kind !== 'power') state.warn('powerSource', 'wrong-kind', `${ps.name} gives powers, but ${state.label(a.trait)} is a quality.`)
  }
  state.checkOnList('powerSource', choice.powers.filter((a) => a.trait.kind === 'power'), [...ps.powers.options, ...required], ps.name)
  for (const r of ps.powers.required ?? []) {
    const n = choice.powers.filter((a) => refsMatch([requiredRef(r)], a.trait)).length
    if (n < (r.dieCount ?? 1)) state.warn('powerSource', 'missing-required', `${ps.name} needs ${dieCountText(r.dieCount)} on ${describeOption(requiredRef(r))}.`)
  }
  const bg = hero.background ? backgroundsById.get(hero.background.id) : undefined
  if (bg) state.checkPool('powerSource', bg.powerSourceDice, freed, choice.powers)
}

/** Whether the archetype lets a die be swapped onto this trait, whatever its size: any trait fitting its required list (rulings 43 and 44). */
export function canSwapRequired(ar: Archetype, trait: TraitRef): boolean {
  return Boolean(ar.required?.ifAlreadyHave.includes('swap') && refsMatch(ar.required.options, trait))
}

function archetypeStep(state: TraitState, hero: Hero, choice: ArchetypeChoice, ar: Archetype): void {
  const before = state.snapshot()
  const freed = state.assign('archetype', choice.traits, (t) => canSwapRequired(ar, t))
  const ps = hero.powerSource ? powerSourcesById.get(hero.powerSource.id) : undefined
  if (ps) state.checkPool('archetype', ps.archetypeDice, freed, choice.traits)

  // The required trait: assigned now, or (if the archetype allows skipping) already held.
  let rest = [...choice.traits]
  if (ar.required) {
    const index = rest.findIndex((a) => refsMatch(ar.required!.options, a.trait))
    if (index >= 0) {
      rest.splice(index, 1)
    } else {
      const alreadyHave = [...before.values()].some((t) => refsMatch(ar.required!.options, t.trait))
      if (!(alreadyHave && ar.required.ifAlreadyHave.includes('skip'))) {
        const skip = ar.required.ifAlreadyHave.includes('skip') ? ' (or skip this if you already have one)' : ''
        state.warn('archetype', 'missing-required', `${ar.name} needs a die on ${ar.required.options.map(describeOption).join(' or ')}${skip}.`)
      }
    }
  }

  const powerList = ar.powers?.options ?? []
  const extraPowerList = ar.qualities?.powerOptions ?? []
  const qualityList = ar.qualities?.options ?? []
  const powers = rest.filter((a) => a.trait.kind === 'power')
  const qualities = rest.filter((a) => a.trait.kind === 'quality')
  state.checkOnList('archetype', powers, [...powerList, ...extraPowerList], `${ar.name} power`)
  state.checkOnList('archetype', qualities, qualityList, `${ar.name} quality`)

  const listedPowers = powers.filter((a) => refsMatch(powerList, a.trait)).length
  const minimum = { one: 1, oneOrMore: 1, atLeastTwo: 2, any: 0, remaining: 0 }[ar.powers?.count ?? 'any']
  if (listedPowers < minimum || (ar.powers?.count === 'one' && listedPowers > 1)) {
    const wanted = ar.powers?.count === 'one' ? 'exactly one die' : `at least ${minimum} dice`
    state.warn('archetype', 'power-count', `${ar.name} puts ${wanted} on powers from its list; you have ${listedPowers}.`)
  }
}

/** Where Modular's filler powers may come from: the base archetype's and the power source's lists (the user's ruling). */
export function fillerLists(base: Archetype | undefined, ps: PowerSource | undefined): OptionRef[] {
  return [
    ...(base?.powers?.options ?? []),
    ...(base?.qualities?.powerOptions ?? []),
    ...(base?.required?.options ?? []),
    ...(ps?.powers.options ?? []),
    ...(ps?.powers.required ?? []).map(requiredRef),
  ]
}

/**
 * Modular's filler powers (p. 96): if the base archetype leaves the hero with fewer than
 * four powers, they add d6 powers until they have four. They're recorded on Modular's own
 * choice, and the user ruled they come from the base archetype's or the power source's lists.
 */
function modularFillers(state: TraitState, hero: Hero, outer: Archetype, base: Archetype | undefined, ps: PowerSource | undefined): void {
  const spec = outer.secondaryArchetype!
  const fillers = hero.archetype!.traits
  const minimum = spec.minimumPowers!
  const have = [...state.traits.values()].filter((t) => t.trait.kind === 'power').length
  const wanted = Math.max(0, minimum - have)
  const seen = new Set<string>()
  for (const a of fillers) {
    if (!getTrait(a.trait)) state.warn('archetype', 'unknown-trait', `"${a.trait.id}" isn't a known ${a.trait.kind}.`)
    if (a.trait.kind !== 'power') state.warn('archetype', 'wrong-kind', `${outer.name} adds powers, but ${state.label(a.trait)} is a quality.`)
    else if (state.get(a.trait) || seen.has(traitKey(a.trait))) state.warn('archetype', 'already-have', `You already have ${state.label(a.trait)}; add a different power.`)
    seen.add(traitKey(a.trait))
    if (spec.fillerPowerDie && a.die !== spec.fillerPowerDie) {
      state.warn('archetype', 'filler-die', `${outer.name} adds powers at ${spec.fillerPowerDie}, not ${a.die}.`)
    }
  }
  if (fillers.length !== wanted) {
    const die = spec.fillerPowerDie ?? ''
    state.warn(
      'archetype',
      'filler-count',
      wanted
        ? `${outer.name} needs ${minimum} powers: add ${wanted} ${die} power${wanted === 1 ? '' : 's'}; you've added ${fillers.length}.`
        : `You already have ${have} powers, so ${outer.name} doesn't add any.`,
    )
  }
  const lists = fillerLists(base, ps)
  const names = [base?.name, ps?.name].filter(Boolean).join(' or ')
  state.checkOnList('archetype', fillers.filter((a) => a.trait.kind === 'power'), lists, `${names} power`)
  for (const a of fillers) if (a.trait.kind === 'power') state.set(a.trait, a.die, 'archetype')
}

/** Names what an option reference allows, e.g. "Speed" or "an Elemental/Energy power". */
function describeOption(ref: OptionRef): string {
  const { kind, scope, id } = describeRef(ref)
  if (scope === 'trait') return getTrait({ kind, id })?.name ?? id
  const name = getCategory(kind, id)?.name ?? id
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name} ${kind}`
}

function personalityStepTraits(state: TraitState, hero: Hero): void {
  const choice = hero.personality
  if (!choice) return
  const personality = personalitiesById.get(choice.id)
  if (!personality) return state.warn('personality', 'unknown-entry', `Unknown personality "${choice.id}".`)
  if (!state.get(ROLEPLAYING_QUALITY)) state.set(ROLEPLAYING_QUALITY, personalityStep.roleplayingQuality.die, 'personality')
  if (!hero.traitNames[traitKey(ROLEPLAYING_QUALITY)]?.trim()) {
    state.warn('personality', 'name-roleplaying-quality', 'Name your roleplaying quality: a few words that sum up your hero.')
  }
  applyBonuses(state, personality.bonuses ?? [], choice.bonus, {
    step: 'personality',
    source: personality.name,
    listed: [],
    archetype: undefined,
  })
}

function retconStepTraits(state: TraitState, hero: Hero): void {
  const choice = hero.retcon
  if (!choice) return
  const retcon = retconsById.get(choice.id)
  if (!retcon) return state.warn('retcon', 'unknown-entry', `Unknown retcon "${choice.id}".`)
  if (retcon.kind !== choice.kind) return state.warn('retcon', 'wrong-retcon-kind', `The retcon "${retcon.summary}" was recorded incorrectly; choose it again.`)
  if (choice.kind === 'swapDice' && retcon.kind === 'swapDice') {
    const [a, b] = choice.traits.map((t) => state.get(t))
    if (!a || !b || traitKey(a.trait) === traitKey(b.trait)) {
      return state.warn('retcon', 'swap-needs-two', 'Choose two different traits you have to swap dice between.')
    }
    if (!retcon.targets.includes(a.trait.kind) || !retcon.targets.includes(b.trait.kind)) {
      return state.warn('retcon', 'wrong-kind', `This retcon swaps ${retcon.targets.join(' or ')} dice only.`)
    }
    const [dieA, dieB] = [a.die, b.die]
    state.set(a.trait, dieB, 'retcon')
    state.set(b.trait, dieA, 'retcon')
  } else if (choice.kind === 'gainPowerOrQuality' && retcon.kind === 'gainPowerOrQuality') {
    if (!getTrait(choice.gained.trait)) state.warn('retcon', 'unknown-trait', `"${choice.gained.trait.id}" isn't a known ${choice.gained.trait.kind}.`)
    if (choice.gained.die !== retcon.die) state.warn('retcon', 'bonus-die', `This retcon adds a trait at ${retcon.die}, not ${choice.gained.die}.`)
    if (state.get(choice.gained.trait)) state.warn('retcon', 'already-have', `You already have ${state.label(choice.gained.trait)}.`)
    state.set(choice.gained.trait, choice.gained.die, 'retcon')
  }
}

/** The hero's final powers and qualities, with warnings for anything that breaks the rules. */
export function deriveTraits(hero: Hero): TraitDerivation {
  const state = new TraitState(hero)
  backgroundStep(state, hero)

  const ps = hero.powerSource ? powerSourcesById.get(hero.powerSource.id) : undefined
  if (hero.powerSource && !ps) state.warn('powerSource', 'unknown-entry', `Unknown power source "${hero.powerSource.id}".`)
  const outer = hero.archetype ? archetypesById.get(hero.archetype.id) : undefined
  if (hero.archetype && !outer) state.warn('archetype', 'unknown-entry', `Unknown archetype "${hero.archetype.id}".`)
  // Divided and Modular take their dice from the second archetype they build on.
  const layer = traitLayer(hero)
  const ar = layer?.archetype
  // (Modular records its filler powers in its own `traits`.)
  const fillsPowers = outer?.secondaryArchetype?.minimumPowers !== undefined
  if (outer?.complex && ((hero.archetype!.traits.length && !fillsPowers) || hero.archetype!.bonus.length)) {
    state.warn('archetype', 'complex-traits', `${outer.name}'s powers and qualities come from the archetype it builds on; record them there.`)
  }

  // A power source bonus applies after its powers, except Training's extra archetype quality,
  // which is taken during the archetype step.
  const psBonuses = ps?.bonuses ?? []
  const deferred = psBonuses.some((b) => b.kind === 'extraArchetypeQuality')
  if (ps) {
    powerSourceStep(state, hero, ps)
    if (!deferred) {
      applyBonuses(state, psBonuses, hero.powerSource!.bonus, { step: 'powerSource', source: ps.name, listed: ps.powers.options, archetype: ar })
    }
  }
  if (layer && ar) {
    archetypeStep(state, hero, layer.choice, ar)
    applyBonuses(state, ar.bonuses ?? [], layer.choice.bonus, { step: 'archetype', source: ar.name, listed: [], archetype: ar })
  }
  if (ps && deferred && ar) {
    applyBonuses(state, psBonuses, hero.powerSource!.bonus, { step: 'archetype', source: ps.name, listed: ps.powers.options, archetype: ar })
  }
  if (outer && fillsPowers && layer) modularFillers(state, hero, outer, ar, ps)
  personalityStepTraits(state, hero)
  retconStepTraits(state, hero)

  return { traits: [...state.traits.values()], warnings: state.warnings }
}

/**
 * A point in creation: before the power source step, after its powers but before its
 * bonus, before the archetype step, before the archetype's bonus, before a power source
 * bonus that's taken in the archetype step (Training's extra quality), or before the
 * personality's bonus (after the roleplaying quality).
 */
export type TraitPoint = 'powerSource' | 'powerSourceBonus' | 'archetype' | 'archetypeBonus' | 'deferredBonus' | 'personalityBonus'

/** Whether the power source's bonus is taken during the archetype step (Training's extra quality). */
export function defersBonus(hero: Hero): boolean {
  const ps = hero.powerSource ? powerSourcesById.get(hero.powerSource.id) : undefined
  return (ps?.bonuses ?? []).some((b) => b.kind === 'extraArchetypeQuality')
}

/** The archetype choice without Modular's filler powers, which apply after every bonus. */
function withoutFillers(choice: ArchetypeChoice): ArchetypeChoice {
  return archetypesById.get(choice.id)?.secondaryArchetype?.minimumPowers !== undefined ? { ...choice, traits: [] } : choice
}

/** The archetype choice without its bonus (on the second archetype, for Divided and Modular) or Modular's fillers. */
function withoutArchetypeBonus(choice: ArchetypeChoice): ArchetypeChoice {
  const rest = withoutFillers(choice)
  if (archetypesById.get(choice.id)?.complex) return choice.secondary ? { ...rest, secondary: { ...choice.secondary, bonus: [] } } : rest
  return { ...rest, bonus: [] }
}

/**
 * The hero's powers and qualities as they stood at `point`, e.g. to offer upgrades of
 * traits from earlier steps, or the traits a bonus may change.
 */
export function traitsBefore(hero: Hero, point: TraitPoint): HeroTrait[] {
  if (point === 'personalityBonus') {
    const p = hero.personality
    return deriveTraits({ ...hero, personality: p ? { ...p, bonus: [] } : null, redAbilities: [], retcon: null }).traits
  }
  const ps = hero.powerSource
  const inPowerSource = point === 'powerSource' || point === 'powerSourceBonus'
  // The power source's bonus is left out before it applies: in the power source step, or
  // in the archetype step for a bonus taken there.
  const dropBonus = point === 'powerSourceBonus' || (!inPowerSource && defersBonus(hero))
  const earlier: Hero = {
    ...hero,
    powerSource: point === 'powerSource' || !ps ? null : dropBonus ? { ...ps, bonus: [] } : ps,
    archetype: inPowerSource || point === 'archetype' || !hero.archetype ? null : point === 'archetypeBonus' ? withoutArchetypeBonus(hero.archetype) : withoutFillers(hero.archetype),
    personality: null,
    redAbilities: [],
    retcon: null,
  }
  return deriveTraits(earlier).traits
}
