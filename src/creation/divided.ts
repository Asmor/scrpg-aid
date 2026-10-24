/**
 * Divided (Core Rules p. 94–95): a civilian form and a heroic form, built on a second
 * archetype (see ./layers.ts). On top of that archetype, the hero chooses a transition
 * method and its ability, a Divided ability (Divided Psyche or Split Form), and takes a
 * Responsibility principle instead of the second archetype's (checked in ./principles.ts).
 *
 * The hero may take a second personality for the heroic form. The user ruled that:
 * - each personality's bonus applies only to its own form, so a power or quality a bonus
 *   creates exists only in that form, and Split Form doesn't place it;
 * - the player chooses whose Out ability they use, and it must use powers and qualities
 *   that form has;
 * - Health may add a power or quality from either form, and uses the larger Red status die
 *   (./health.ts);
 * - the retcon that raises a status die raises one form's die, which the player picks.
 */
import { traitKey, type TraitRef } from '../rules/catalog'
import { archetypesById, personalitiesById } from '../rules/data'
import type { Hero } from '../hero/model'
import { checkAbilityBlock, checkAbilityPick } from './abilities'
import { dividedChoice, outerLayer } from './layers'
import { compareDice } from '../rules/dice'
import { deriveTraits, ROLEPLAYING_QUALITY, traitLabel, type HeroTrait } from './traits'
import { warning, type RuleWarning } from './warnings'

const SPLIT_FORM = 'Split Form'

/** The hero as they are in the heroic form: the same choices, with the heroic personality. */
function heroicHero(hero: Hero): Hero | undefined {
  const heroic = dividedChoice(hero)?.heroicPersonality
  return heroic ? { ...hero, personality: heroic } : undefined
}

/**
 * A Divided hero's traits in the heroic form, when they have a second personality (its
 * bonus applies only to that form). Undefined otherwise: both forms share the same traits.
 */
export function heroicTraits(hero: Hero): HeroTrait[] | undefined {
  const heroic = heroicHero(hero)
  return heroic && deriveTraits(heroic).traits
}

const ROLEPLAYING_KEY = traitKey(ROLEPLAYING_QUALITY)

/** Whether the hero took Split Form as their Divided ability. */
function hasSplitForm(hero: Hero): boolean {
  return Boolean(dividedChoice(hero) && hero.archetype!.abilities.some((p) => p.source === 'archetype.green' && p.name === SPLIT_FORM))
}

/**
 * The powers and qualities a Divided hero has in one form: that form's personality bonus
 * applied, and, with Split Form, without the ones placed only in the other form. For any
 * other hero, just `traits`.
 */
export function traitsInForm(hero: Hero, traits: readonly HeroTrait[], form: 'civilian' | 'heroic'): readonly HeroTrait[] {
  const divided = dividedChoice(hero)
  if (!divided) return traits
  const base = form === 'heroic' ? (heroicTraits(hero) ?? traits) : traits
  const split = hasSplitForm(hero) ? divided.split : undefined
  if (!split) return base
  const elsewhere = new Set((form === 'heroic' ? split.civilian : split.heroic).map(traitKey))
  return base.filter((t) => !elsewhere.has(traitKey(t.trait)))
}

/**
 * Every power and quality the hero has in either form, at its largest die: what Health may
 * use (the user's ruling). For a hero with one set of traits, just `traits`.
 */
export function traitsInAnyForm(hero: Hero, traits: readonly HeroTrait[]): HeroTrait[] {
  const all = new Map(traits.map((t) => [traitKey(t.trait), t]))
  for (const t of heroicTraits(hero) ?? []) {
    const known = all.get(traitKey(t.trait))
    if (!known || compareDice(t.die, known.die) > 0) all.set(traitKey(t.trait), t)
  }
  return [...all.values()]
}

/** The powers and qualities the hero's Out ability may use: those of the form whose personality gives it. */
export function outTraits(hero: Hero, traits: readonly HeroTrait[]): readonly HeroTrait[] {
  const divided = dividedChoice(hero)
  if (!divided?.heroicPersonality) return traits
  return traitsInForm(hero, traits, divided.outFrom === 'heroic' ? 'heroic' : 'civilian')
}

function checkSplit(hero: Hero, traits: readonly HeroTrait[], warnings: RuleWarning[]): void {
  const split = hero.archetype!.divided?.split
  const warn = (code: string, message: string) => warnings.push(warning('archetype', code, message))
  if (!split) {
    warn('split-missing', 'Split Form: choose two powers and two qualities you always have, and divide the rest between your forms.')
    return
  }
  // What gets split: the powers and qualities both forms have. One a personality bonus
  // creates exists only in that personality's form (the user's ruling), and the roleplaying
  // quality is available in both forms anyway (p. 94–95).
  const heroic = heroicTraits(hero)
  const heroicKeys = heroic && new Set(heroic.map((t) => traitKey(t.trait)))
  const shared = traits.filter((t) => traitKey(t.trait) !== ROLEPLAYING_KEY && (!heroicKeys || heroicKeys.has(traitKey(t.trait))))
  const held = new Map(shared.map((t) => [traitKey(t.trait), t]))
  const inSomeForm = new Set([...traits, ...(heroic ?? [])].map((t) => traitKey(t.trait)))

  const always = split.always.filter((t) => held.has(traitKey(t)))
  const powers = always.filter((t) => t.kind === 'power').length
  const qualities = always.filter((t) => t.kind === 'quality').length
  if (split.always.length !== 4 || powers !== 2 || qualities !== 2) {
    warn('split-always', 'Split Form: choose exactly two powers and two qualities you always have access to.')
  }
  const placed = new Map<string, number>()
  for (const t of [...split.always, ...split.civilian, ...split.heroic]) {
    const key = traitKey(t)
    placed.set(key, (placed.get(key) ?? 0) + 1)
    if (key === ROLEPLAYING_KEY) {
      warn('split-roleplaying', 'Split Form: your roleplaying quality is available in both forms, so leave it out of the split.')
    } else if (held.has(key)) {
      continue
    } else if (inSomeForm.has(key)) {
      warn('split-form-only', `Split Form: ${traitLabel(hero, t)} comes from one personality's bonus, so it's only in that form; leave it out of the split.`)
    } else {
      warn('slot-not-held', `Split Form lists ${traitLabel(hero, t)}, which you don't have.`)
    }
  }
  for (const [key, count] of placed) {
    if (count > 1) warn('split-twice', `Split Form puts ${held.get(key)?.name ?? key} in more than one place.`)
  }
  for (const t of shared) {
    if (!placed.has(traitKey(t.trait))) {
      warn('split-unplaced', `Split Form: put ${t.name} in your civilian form, your heroic form, or the ones you always have.`)
    }
  }
}

/** Checks Divided's own choices. */
export function checkDivided(hero: Hero, traits: readonly HeroTrait[]): RuleWarning[] {
  const warnings: RuleWarning[] = []
  const outer = outerLayer(hero)
  const divided = hero.archetype?.divided
  if (!outer) return warnings
  const ar = outer.archetype
  const warn = (code: string, message: string) => warnings.push(warning('archetype', code, message))
  const second = hero.archetype?.secondary
  if (second?.divided) warn('unexpected-divided', `Record Divided's choices on Divided, not on ${archetypesById.get(second.id)?.name ?? 'the archetype it builds on'}.`)
  if (!ar.transitionMethods) {
    if (divided) warn('unexpected-divided', `${ar.name} doesn't have Divided's choices.`)
    return warnings
  }

  // Transition method and its ability.
  const method = ar.transitionMethods.find((m) => m.id === divided?.transitionMethod)
  if (!divided?.transitionMethod) warn('transition-missing', 'Choose how you change between your civilian and heroic forms.')
  else if (!method) warn('unknown-entry', `Unknown transition method "${divided.transitionMethod}".`)
  const pick = divided?.transitionAbility
  if (method) {
    const ability = pick && (method.greenAbilities.options ?? []).find((a) => a.name === pick.name)
    if (!pick) warn('transition-ability-missing', `Choose your ${method.name} ability.`)
    else if (!ability) warn('unknown-ability', `${pick.name} isn't a ${method.name} ability.`)
    else {
      if (pick.source !== 'archetype.transition') warn('transition-ability-source', `${pick.name} should be recorded as your transition ability.`)
      warnings.push(...checkAbilityPick(hero, traits, ability, pick, 'archetype'))
    }
  }

  // The Divided ability (Divided Psyche or Split Form).
  const dividedPicks = outer.choice.abilities.filter((p) => p.source === 'archetype.green')
  const fixed = [
    ...(ar.fixedGreenAbilities ?? []).map((a) => `archetype.fixedGreen:${a.name}`),
    ...(ar.fixedYellowAbilities ?? []).map((a) => `archetype.fixedYellow:${a.name}`),
    ...(ar.fixedRedAbilities ?? []).map((a) => `archetype.fixedRed:${a.name}`),
  ]
  for (const p of outer.choice.abilities) {
    if (p.source !== 'archetype.green' && !fixed.includes(`${p.source}:${p.name}`)) {
      warn('unknown-ability', `${p.name} isn't one of ${ar.name}'s abilities; record your second archetype's abilities on that archetype.`)
    }
  }
  if (ar.greenAbilities) {
    warnings.push(...checkAbilityBlock(hero, traits, ar.greenAbilities, dividedPicks, `${ar.name} abilities`, ar))
  }
  if (dividedPicks.some((p) => p.name === SPLIT_FORM)) checkSplit(hero, traits, warnings)
  else if (divided?.split) warn('unexpected-split', 'Only Split Form divides your powers and qualities between forms.')

  // A second personality for the heroic form.
  const heroic = divided?.heroicPersonality
  if (heroic) {
    if (!personalitiesById.has(heroic.id)) warn('unknown-entry', `Unknown personality "${heroic.id}".`)
    else if (heroic.id === hero.personality?.id) warn('same-personality', 'Your heroic form needs a different personality from your civilian form.')
    else {
      if (!divided.outFrom) warn('out-from-missing', 'With two personalities, choose which one gives you your Out ability.')
      // Its bonus applies to the heroic form; check it there.
      const asHeroic = heroicHero(hero)!
      for (const w of deriveTraits(asHeroic).warnings) {
        if (w.step === 'personality' && w.code !== 'name-roleplaying-quality') warnings.push({ ...w, message: `Heroic form: ${w.message}` })
      }
    }
  } else if (divided?.outFrom === 'heroic') {
    warn('out-from-missing', 'Your Out ability is set to come from a heroic-form personality, but you have only one personality.')
  }
  return warnings
}

/** Re-exported for the sheet: the traits list a Split Form hero assigned to each form. */
export function splitNames(hero: Hero): { always: string[]; civilian: string[]; heroic: string[] } | undefined {
  const split = hero.archetype?.divided?.split
  if (!split) return undefined
  const names = (list: TraitRef[]) => list.map((t) => traitLabel(hero, t))
  return { always: names(split.always), civilian: names(split.civilian), heroic: names(split.heroic) }
}
