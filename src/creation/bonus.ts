/**
 * What a bonus can be applied to, for the UI. The rules checks in ./traits.ts warn about
 * any choice that doesn't fit; these only work out the choices worth offering.
 */
import { expandRefs, refsMatch, traitKey, traitsOfKind, type CatalogTrait } from '../rules/catalog'
import { compareDice, stepDie } from '../rules/dice'
import type { Bonus, Die, OptionRef } from '../rules/types'
import type { TraitAssignment } from '../hero/model'
import type { HeroTrait } from './traits'

type GainBonus = Extract<Bonus, { kind: 'gainQuality' | 'gainPower' }>
type UpgradeBonus = Extract<Bonus, { kind: 'upgradeDie' }>
type ShiftBonus = Extract<Bonus, { kind: 'shiftDice' }>

/** A trait the bonus can change, and the die it would end up with. */
export interface BonusTarget {
  trait: HeroTrait
  die: Die
}

/** The traits a "gain a power/quality" bonus can give. `listed` is the power source's power list. */
export function gainOptions(bonus: GainBonus, listed: readonly OptionRef[]): CatalogTrait[] {
  if (bonus.kind === 'gainQuality') return expandRefs(bonus.options)
  if (bonus.options) return expandRefs(bonus.options)
  return traitsOfKind('power').filter((t) => !(bonus.excludeListed && refsMatch(listed, t)))
}

/** The traits an upgrade bonus can raise, from the traits held before it. */
export function upgradeTargets(bonus: UpgradeBonus, before: readonly HeroTrait[]): BonusTarget[] {
  const max = bonus.max ?? 'd12'
  return before
    .filter((t) => bonus.targets.includes(t.trait.kind) && (!bonus.from || bonus.from.includes(t.die)) && (bonus.to || t.die !== max))
    .map((t) => ({ trait: t, die: bonus.to ?? stepDie(t.die, bonus.steps ?? 1, { max }) }))
}

/** Whether an upgrade bonus falls back to gaining a power, because no power has a die it can raise. */
export function usesFallback(bonus: UpgradeBonus, before: readonly HeroTrait[]): boolean {
  return Boolean(bonus.fallback) && !before.some((t) => t.trait.kind === 'power' && (bonus.from ?? []).includes(t.die))
}

/** The traits a shift bonus can lower and raise. */
export function shiftTargets(bonus: ShiftBonus, before: readonly HeroTrait[]): { down: BonusTarget[]; up: BonusTarget[] } {
  const pick = (rule: ShiftBonus['downgrade'], sign: 1 | -1) =>
    before
      .filter((t) => rule.targets.includes(t.trait.kind) && rule.from.includes(t.die))
      .map((t) => ({ trait: t, die: stepDie(t.die, sign * rule.steps) }))
  return { down: pick(bonus.downgrade, -1), up: pick(bonus.upgrade, 1) }
}

/** The powers an upgrade bonus's fallback can give: from the power source's list, or any. */
export function fallbackOptions(bonus: UpgradeBonus, listed: readonly OptionRef[]): CatalogTrait[] {
  if (!bonus.fallback) return []
  return bonus.fallback.fromListed ? expandRefs(listed).filter((t) => t.kind === 'power') : [...traitsOfKind('power')]
}

/**
 * Splits a shift bonus's assignments into the lowered and the raised one, by comparing each
 * with the trait's die before the bonus. (They're saved as a plain list, in any order.)
 */
export function splitShift(assignments: readonly TraitAssignment[], before: readonly HeroTrait[]): { lowered?: TraitAssignment; raised?: TraitAssignment } {
  const old = (a: TraitAssignment) => before.find((t) => traitKey(t.trait) === traitKey(a.trait))?.die
  const lowered = assignments.find((a) => {
    const die = old(a)
    return die !== undefined && compareDice(a.die, die) < 0
  })
  const raised = assignments.find((a) => a !== lowered && (old(a) === undefined || compareDice(a.die, old(a)!) > 0))
  return { ...(lowered ? { lowered } : {}), ...(raised ? { raised } : {}) }
}
