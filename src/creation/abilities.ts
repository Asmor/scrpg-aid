/**
 * Checks the abilities a hero took from their power source and archetype: how many,
 * which ones, how their blanks are filled, and the restrictions on which powers and
 * qualities they use (data/README.md, "Ability restrictions").
 *
 * An ability "uses" the trait in its first trait slot, or, if it has no trait slot,
 * the single power or quality its `requires` names (abilities like "Attack using
 * Telepathy"). Following the user's rulings: an ability that uses nothing is exempt from
 * restrictions; and rules about powers ignore abilities that use a quality.
 *
 * `sameUsePattern` only appears in villain data, so it isn't checked here.
 *
 * Divided and Modular build on a second archetype (./layers.ts): the outer archetype's fixed
 * abilities are checked here, then the second archetype's abilities, unless Modular skips
 * them. Divided's own choices are checked in ./divided.ts, and Form-Changer and Minion-Maker
 * forms in ./forms.ts. "[a power gained from your archetype]" means a power from the second
 * archetype, which gives the hero their archetype dice (the user's ruling).
 */
import { describeRef, getCategory, getTrait, refsMatch, traitKey, type TraitRef } from '../rules/catalog'
import { powerSourcesById } from '../rules/data'
import { parseSlots, type TraitSlot } from '../rules/slots'
import type { Ability, AbilityChoice, Archetype, DistinctRule, OptionRef, RequireAtLeast, TraitKind } from '../rules/types'
import type { AbilityPick, AbilitySource, Hero } from '../hero/model'
import type { HeroTrait } from './traits'
import { layers, traitLayer, type ArchetypeLayer } from './layers'
import { findAbility, outPick, recordedPicks } from './lookup'
import { traitLabel } from './traits'
import { warning, type RuleWarning, type StepId } from './warnings'

interface Context {
  hero: Hero
  step: StepId
  /** The hero's traits by traitKey. */
  traits: ReadonlyMap<string, HeroTrait>
  /** Traits given dice in the archetype step, for "[a power gained from your archetype]". */
  archetypeTraits: ReadonlySet<string>
  /**
   * Extra limit on the first trait slot of `kind`, e.g. a Red ability's category: the
   * ability needs one trait from that category to use with it, and other slots are free.
   */
  slotLimit?: { kind: TraitKind; refs: readonly OptionRef[]; what: string }
  warnings: RuleWarning[]
}

const warn = (ctx: Context, code: string, message: string) => ctx.warnings.push(warning(ctx.step, code, message))
const label = (ctx: Context, t: TraitRef) => traitLabel(ctx.hero, t)

/** The trait an ability pick uses for restrictions (see the module doc). */
export function primaryUse(ability: Ability, pick: AbilityPick): TraitRef | undefined {
  if (parseSlots(ability.text).some((s) => s.type === 'trait')) return pick.uses?.[0]
  return namedTrait(ability)
}

/** The hero's traits that can fill a trait slot, for the UI. */
export function slotCandidates(hero: Hero, traits: readonly HeroTrait[], slot: TraitSlot, step: StepId): HeroTrait[] {
  const ctx = contextFor(hero, traits, step, [])
  return traits.filter((t) => slotAccepts(ctx, slot, t.trait))
}

function slotAccepts(ctx: Context, slot: TraitSlot, trait: TraitRef): boolean {
  if (!slot.kinds.includes(trait.kind)) return false
  if (slot.only && !refsMatch(slot.only, trait)) return false
  if (slot.fromStep === 'archetype' && !ctx.archetypeTraits.has(traitKey(trait))) return false
  return true
}

/** The trait a no-slot ability names through `requires`, if it names exactly one. */
function namedTrait(ability: Ability): TraitRef | undefined {
  const req = ability.requires
  if (req && 'power' in req) return { kind: 'power', id: req.power }
  if (req && 'quality' in req) return { kind: 'quality', id: req.quality }
  return undefined
}

function hasMatching(ctx: Context, refs: readonly OptionRef[]): boolean {
  return [...ctx.traits.values()].some((t) => refsMatch(refs, t.trait))
}

/** Checks one ability pick: its blanks are filled, with traits the hero has, and its requirement is met. */
function checkPick(ctx: Context, ability: Ability, pick: AbilityPick): void {
  const name = pick.customName?.trim() || ability.name
  let traitIndex = 0
  let limited = false
  for (const slot of parseSlots(ability.text)) {
    if (slot.type === 'trait') {
      const use = pick.uses?.[traitIndex++]
      if (!use) {
        warn(ctx, 'slot-empty', `Fill in [${slot.label}] for ${name}.`)
      } else if (!ctx.traits.has(traitKey(use))) {
        warn(ctx, 'slot-not-held', `${name} uses ${label(ctx, use)}, which you don't have.`)
      } else if (!slotAccepts(ctx, slot, use)) {
        warn(ctx, 'slot-wrong-trait', `[${slot.label}] for ${name} can't be ${label(ctx, use)}.`)
      } else if (ctx.slotLimit && !limited && slot.kinds.includes(ctx.slotLimit.kind) && !refsMatch(ctx.slotLimit.refs, use)) {
        warn(ctx, 'slot-wrong-trait', `${name} must use ${ctx.slotLimit.what}, not ${label(ctx, use)}.`)
      }
      if (ctx.slotLimit && slot.kinds.includes(ctx.slotLimit.kind)) limited = true
    } else {
      const value = pick.blanks?.[slot.label]
      const values = value === undefined ? [] : Array.isArray(value) ? value : [value]
      const filled = values.filter((v) => v.trim() !== '')
      const count = slot.count ?? 1
      if (filled.length < count) {
        warn(ctx, 'blank-empty', `Fill in [${slot.label}] for ${name}.`)
      } else if (slot.options && filled.some((v) => !slot.options!.includes(v))) {
        warn(ctx, 'blank-invalid', `[${slot.label}] for ${name} must be ${slot.options.join(' or ')}.`)
      } else if (count > 1 && new Set(filled).size < filled.length) {
        warn(ctx, 'blank-invalid', `[${slot.label}] for ${name} needs ${count} different choices.`)
      }
    }
  }
  const named = traitIndex === 0 ? namedTrait(ability) : undefined
  const extra = (pick.uses ?? []).slice(traitIndex)
  // An ability that names its trait may record it; anything else is extra.
  if (extra.length && !(named && extra.length === 1 && traitKey(extra[0]!) === traitKey(named))) {
    const has = named
      ? `always uses ${label(ctx, named)}`
      : traitIndex === 0
        ? "doesn't use a power or quality"
        : `only uses ${traitIndex === 1 ? 'one power or quality' : `${traitIndex} powers or qualities`}`
    warn(ctx, 'slot-extra', `${name} ${has}; remove the extra.`)
  }
  if (ability.requires && !hasMatching(ctx, [ability.requires])) {
    warn(ctx, 'requirement-unmet', `${name} requires ${describe(ability.requires)}, which you don't have.`)
  }
}

function withArticle(text: string): string {
  return /^(a|an|any) /i.test(text) ? text : `${/^[aeiou]/i.test(text) ? 'an' : 'a'} ${text}`
}

/** Names what an option reference allows, e.g. "Animal Control" or "a Mental quality". */
function describe(ref: OptionRef): string {
  const { kind, scope, id } = describeRef(ref)
  if (scope === 'trait') return getTrait({ kind, id })?.name ?? id
  return withArticle(`${getCategory(kind, id)?.name ?? id} ${kind}`)
}

/** Whether every requireAtLeast clause can be met by its own abilities (a small matching search). */
function meetsAtLeast(uses: readonly TraitRef[], clauses: readonly RequireAtLeast[]): boolean {
  const matches = (use: TraitRef, clause: RequireAtLeast) =>
    typeof clause.uses === 'string' ? use.kind === clause.uses : refsMatch(clause.uses, use)
  const need = clauses.map((c) => c.count)
  const search = (i: number): boolean => {
    if (need.every((n) => n <= 0)) return true
    if (i >= uses.length) return false
    for (const [c, clause] of clauses.entries()) {
      if (need[c]! > 0 && matches(uses[i]!, clause)) {
        need[c]!--
        if (search(i + 1)) return true
        need[c]!++
      }
    }
    return search(i + 1)
  }
  return search(0)
}

function checkDistinct(ctx: Context, rule: DistinctRule, uses: readonly TraitRef[], source: string): void {
  const relevant = uses.filter((u) =>
    rule === 'differentPowers' ? u.kind === 'power' : rule === 'differentQualities' ? u.kind === 'quality' : true,
  )
  if (new Set(relevant.map(traitKey)).size < relevant.length) {
    const what = { differentPowers: 'power', differentQualities: 'quality', differentPowersOrQualities: 'power or quality' }[rule]
    warn(ctx, 'not-different', `Each of your ${source} must use a different ${what}.`)
  }
}

/** Lists the archetype's power, quality, and required references, for usesFrom. */
function archetypeLists(ar: Archetype, powersOnly: boolean): OptionRef[] {
  const required = ar.required?.options ?? []
  const powers = [...(ar.powers?.options ?? []), ...required.filter((r) => 'power' in r || 'powerCategory' in r)]
  if (powersOnly) return powers
  return [...powers, ...required, ...(ar.qualities?.options ?? []), ...(ar.qualities?.powerOptions ?? [])]
}

/** A pick together with the ability it names. */
interface Taken {
  pick: AbilityPick
  ability: Ability
}

/**
 * Checks the picks for one choice block: count, names, duplicates, each pick, and the
 * block's restrictions. `available` lists the abilities that may be picked.
 */
function checkBlock(
  ctx: Context,
  block: AbilityChoice,
  available: readonly Ability[],
  picks: readonly AbilityPick[],
  source: string,
  archetype: Archetype | undefined,
  greenUses: readonly TraitRef[] = [],
): Taken[] {
  const taken: Taken[] = []
  const seen = new Set<string>()
  for (const pick of picks) {
    const ability = available.find((a) => a.name === pick.name)
    if (!ability) {
      warn(ctx, 'unknown-ability', `${pick.name} isn't one of the ${source} you can choose.`)
      continue
    }
    if (seen.has(pick.name)) warn(ctx, 'ability-twice', `You took ${pick.name} more than once.`)
    seen.add(pick.name)
    checkPick(ctx, ability, pick)
    taken.push({ pick, ability })
  }
  if (picks.length !== block.count) {
    warn(ctx, 'ability-count', `Choose ${block.count} of the ${source}; you have ${picks.length}.`)
  }

  const uses = taken.flatMap(({ ability, pick }) => primaryUse(ability, pick) ?? [])
  if (block.rule) checkDistinct(ctx, block.rule, uses, source)
  if (block.usesFrom) {
    const list =
      typeof block.usesFrom !== 'string'
        ? block.usesFrom
        : archetype
          ? archetypeLists(archetype, block.usesFrom === 'archetypePowerList')
          : undefined
    const what =
      typeof block.usesFrom !== 'string'
        ? block.usesFrom.map(describe).join(' or ')
        : `a ${block.usesFrom === 'archetypePowerList' ? 'power' : 'power or quality'} from the ${archetype?.name} lists`
    for (const use of uses) {
      if (list && !refsMatch(list, use)) warn(ctx, 'uses-not-from-list', `Your ${source} must use ${what}; ${label(ctx, use)} isn't one.`)
    }
  }
  if (block.requireAtLeast && !meetsAtLeast(uses, block.requireAtLeast)) {
    const parts = block.requireAtLeast.map(
      (c) => `${c.count} using ${typeof c.uses === 'string' ? `a ${c.uses}` : c.uses.map(describe).join(' or ')}`,
    )
    warn(ctx, 'uses-at-least', `Your ${source} need ${parts.join(' and ')}.`)
  }
  if (block.minDifferentPowers) {
    const powerUses = uses.filter((u) => u.kind === 'power')
    const needed = Math.min(block.minDifferentPowers, powerUses.length)
    const powers = new Set(powerUses.map(traitKey))
    if (powers.size < needed) warn(ctx, 'too-few-powers', `Your ${source} must use at least ${needed} different powers.`)
  }
  if (block.differentFromGreen) {
    const green = new Set(greenUses.map(traitKey))
    for (const use of uses) {
      if (green.has(traitKey(use))) warn(ctx, 'same-as-green', `Your ${source} must use something none of your Green abilities use, not ${label(ctx, use)}.`)
    }
  }
  return taken
}

function picksFrom(picks: readonly AbilityPick[], source: AbilitySource): AbilityPick[] {
  return picks.filter((p) => p.source === source)
}

/** Fixed abilities come with the entry; those with blanks need a pick that fills them in. */
function checkFixed(ctx: Context, fixed: readonly Ability[], picks: readonly AbilityPick[], source: AbilitySource): Taken[] {
  const taken: Taken[] = []
  for (const ability of fixed) {
    const matching = picks.filter((p) => p.source === source && p.name === ability.name)
    if (matching.length > 1) warn(ctx, 'ability-twice', `${ability.name} is recorded more than once.`)
    const pick = matching[0]
    if (pick) {
      checkPick(ctx, ability, pick)
      taken.push({ pick, ability })
    } else if (parseSlots(ability.text).length > 0) {
      warn(ctx, 'fixed-unfilled', `Fill in the blanks for ${ability.name}.`)
    }
  }
  for (const pick of picks.filter((p) => p.source === source)) {
    if (!fixed.some((a) => a.name === pick.name)) warn(ctx, 'unknown-ability', `${pick.name} isn't one of your fixed abilities.`)
  }
  return taken
}

function checkPowerSource(ctx: Context): void {
  const choice = ctx.hero.powerSource
  const ps = choice && powerSourcesById.get(choice.id)
  if (!choice || !ps) return
  if (ps.greenAbilities) {
    checkBlock(ctx, ps.greenAbilities, ps.greenAbilities.options ?? [], picksFrom(choice.abilities, 'powerSource.green'), `${ps.name} Green abilities`, undefined)
  } else if (picksFrom(choice.abilities, 'powerSource.green').length) {
    warn(ctx, 'unknown-ability', `${ps.name} has no Green abilities to choose.`)
  }
  checkBlock(ctx, ps.yellowAbilities, ps.yellowAbilities.options ?? [], picksFrom(choice.abilities, 'powerSource.yellow'), `${ps.name} Yellow abilities`, undefined)
  for (const pick of choice.abilities) {
    if (pick.source !== 'powerSource.green' && pick.source !== 'powerSource.yellow') {
      warn(ctx, 'unknown-ability', `${pick.name} isn't a power source ability.`)
    }
  }
}

/**
 * Checks one archetype layer's abilities. For Divided and Modular, this runs on both the
 * outer archetype (its fixed abilities) and the second one (Divided only; Modular skips
 * the second archetype's abilities). Their own special choices are checked in
 * ./divided.ts and ./modular.ts.
 */
function checkArchetype(ctx: Context, layer: ArchetypeLayer): void {
  const { choice, archetype: ar } = layer
  const picks = choice.abilities
  const fixedGreen = checkFixed(ctx, ar.fixedGreenAbilities ?? [], picks, 'archetype.fixedGreen')
  if (ar.fixedGreenRule) {
    checkDistinct(ctx, ar.fixedGreenRule, fixedGreen.flatMap(({ ability, pick }) => primaryUse(ability, pick) ?? []), `${ar.name} fixed Green abilities`)
  }
  checkFixed(ctx, ar.fixedYellowAbilities ?? [], picks, 'archetype.fixedYellow')
  checkFixed(ctx, ar.fixedRedAbilities ?? [], picks, 'archetype.fixedRed')
  if (ar.complex) return

  // Picks left from another archetype (e.g. Yellow picks on an archetype with no Yellow choices).
  for (const [source, block, zone] of [['archetype.green', ar.greenAbilities, 'Green'], ['archetype.yellow', ar.yellowAbilities, 'Yellow']] as const) {
    if (!block && picksFrom(picks, source).length) warn(ctx, 'unknown-ability', `${ar.name} has no ${zone} abilities to choose.`)
  }
  const green = ar.greenAbilities
    ? checkBlock(ctx, ar.greenAbilities, ar.greenAbilities.options ?? [], picksFrom(picks, 'archetype.green'), `${ar.name} Green abilities`, ar)
    : []
  const greenUses = green.flatMap(({ ability, pick }) => primaryUse(ability, pick) ?? [])
  const yellow = ar.yellowAbilities
  if (yellow) {
    const yellowPicks = picksFrom(picks, 'archetype.yellow')
    const options = yellow.fromGreenList ? (ar.greenAbilities?.options ?? []) : (yellow.options ?? [])
    checkBlock(ctx, yellow, options, yellowPicks, `${ar.name} Yellow abilities`, ar, greenUses)
    if (yellow.fromGreenList) {
      for (const pick of yellowPicks) {
        if (green.some((g) => g.pick.name === pick.name)) {
          warn(ctx, 'ability-twice', `${pick.name} is already one of your Green abilities; take a different one as your Yellow ability.`)
        }
      }
    }
  }
}

/** Checks a choice block outside the usual power source/archetype flow (e.g. Divided's own Green ability). */
export function checkAbilityBlock(
  hero: Hero,
  traits: readonly HeroTrait[],
  block: AbilityChoice,
  picks: readonly AbilityPick[],
  source: string,
  archetype: Archetype | undefined,
): RuleWarning[] {
  const warnings: RuleWarning[] = []
  checkBlock(contextFor(hero, traits, 'archetype', warnings), block, block.options ?? [], picks, source, archetype)
  return warnings
}

/**
 * Checks one ability pick on its own: used for Red abilities and retcons, and by the UI
 * while a player fills in an ability. `slotLimit` limits the first trait slot of its kind.
 */
export function checkAbilityPick(
  hero: Hero,
  traits: readonly HeroTrait[],
  ability: Ability,
  pick: AbilityPick,
  step: StepId,
  slotLimit?: Context['slotLimit'],
): RuleWarning[] {
  const warnings: RuleWarning[] = []
  checkPick({ ...contextFor(hero, traits, step, warnings), slotLimit }, ability, pick)
  return warnings
}

function contextFor(hero: Hero, traits: readonly HeroTrait[], step: StepId, warnings: RuleWarning[]): Context {
  // "Gained from your archetype" means the archetype that gave the hero their dice: for
  // Divided, the second archetype (the user's ruling).
  const layer = traitLayer(hero)?.choice
  const archetypeTraits = new Set((layer?.traits ?? []).concat(layer?.bonus ?? []).map((a) => traitKey(a.trait)))
  return { hero, step, traits: new Map(traits.map((t) => [traitKey(t.trait), t])), archetypeTraits, warnings }
}

/** Checks the power source and archetype abilities against the hero's traits. */
export function checkAbilities(hero: Hero, traits: readonly HeroTrait[]): RuleWarning[] {
  const warnings: RuleWarning[] = []
  checkPowerSource(contextFor(hero, traits, 'powerSource', warnings))
  const ctx = contextFor(hero, traits, 'archetype', warnings)
  const [outer, second] = layers(hero)
  if (outer) checkArchetype(ctx, outer)
  if (second) {
    if (outer!.archetype.secondaryArchetype?.skipAbilities) {
      if (second.choice.abilities.length) {
        warn(ctx, 'skipped-abilities', `${outer!.archetype.name} skips ${second.archetype.name}'s abilities; remove them.`)
      }
    } else {
      checkArchetype(ctx, second)
    }
  }
  return warnings
}

/**
 * Checks the "change which power or quality one of your abilities uses" retcon: it must
 * point at an ability the hero took, and the new traits must fit that ability's slots.
 * The user ruled that the ability's Red category and block restrictions no longer apply,
 * and that the Out ability and Form-Changer form abilities can be its target.
 */
export function checkAbilityRetcon(hero: Hero, traits: readonly HeroTrait[], outTraits: readonly HeroTrait[] = traits): RuleWarning[] {
  const retcon = hero.retcon
  // A form or mode ability's retcon is checked against that form's or mode's dice, in ./forms.ts and ./modular.ts.
  if (retcon?.kind !== 'changeAbilityTrait' || retcon.ability.source === 'archetype.form' || retcon.ability.source === 'archetype.mode') return []
  const out = outPick(hero)
  const placed = [...recordedPicks(hero), ...(out ? [{ pick: out }] : [])]
  const found = placed.find(({ pick: p }) => p.source === retcon.ability.source && p.name === retcon.ability.name)
  const pick = found?.pick
  const ability = found && findAbility(hero, found.pick, found.archetype)
  if (!pick || !ability) {
    return [warning('retcon', 'retcon-ability-missing', `This retcon changes ${retcon.ability.name}, which you haven't taken.`)]
  }
  const same = (pick.uses ?? []).map(traitKey).join() === retcon.uses.map(traitKey).join()
  return [
    ...checkAbilityPick(hero, pick.source === 'out' ? outTraits : traits, ability, { ...pick, uses: retcon.uses }, 'retcon'),
    ...(same ? [warning('retcon', 'retcon-no-change', `This retcon should change what ${ability.name} uses; it's the same as before.`)] : []),
  ]
}
