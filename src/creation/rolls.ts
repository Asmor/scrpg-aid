/**
 * Where a table step's Guided roll is kept. A roll made before choosing is saved in
 * hero.pendingRolls, so it survives leaving the step; once an entry is chosen the roll
 * lives on the choice. Divided and Modular's second archetype has a roll of its own,
 * kept on hero.archetype.secondary (rulings 45–47).
 *
 * A Guided choice its own roll doesn't reach (after a reroll, say) stays, and is flagged.
 */
import type { Hero, RollRecord, RollSlot } from '../hero/model'
import { archetypes, archetypesById, backgrounds, backgroundsById, backgroundStep, personalities, powerSources, powerSourcesById } from '../rules/data'
import { rolledOn, tableOptions } from '../rules/rolling'
import type { Die } from '../rules/types'
import { outerLayer } from './layers'
import { warning, type RuleWarning } from './warnings'

function choiceFor(hero: Hero, slot: RollSlot): { roll?: RollRecord } | null | undefined {
  return slot === 'secondaryArchetype' ? hero.archetype?.secondary : hero[slot]
}

/** The step's current roll: the choice's, or a pending one if nothing is chosen yet. */
export function stepRoll(hero: Hero, slot: RollSlot): RollRecord | undefined {
  return choiceFor(hero, slot)?.roll ?? hero.pendingRolls?.[slot]
}

/** Records a roll (or reroll) for the step, on the choice if there is one. Changes `hero` in place. */
export function setStepRoll(hero: Hero, slot: RollSlot, roll: RollRecord): void {
  const choice = choiceFor(hero, slot)
  if (choice) choice.roll = roll
  else hero.pendingRolls = { ...hero.pendingRolls, [slot]: roll }
}

/**
 * Takes the step's pending roll for a new choice, removing it from hero.pendingRolls.
 * Changes `hero` in place.
 */
export function takePendingRoll(hero: Hero, slot: RollSlot): RollRecord | undefined {
  const roll = hero.pendingRolls?.[slot]
  if (!hero.pendingRolls || !roll) return undefined
  delete hero.pendingRolls[slot]
  if (Object.keys(hero.pendingRolls).length === 0) delete hero.pendingRolls
  return roll
}

const listAnd = (xs: readonly number[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : String(xs[0] ?? ''))

/**
 * Guided choices that the step's roll doesn't reach. Only a roll made on the step's current
 * dice counts (a roll on other dice is rolled again), and a choice with no roll of its own
 * isn't flagged, so switching a hero to Guided later doesn't flag its choices.
 */
export function checkRolls(hero: Hero): RuleWarning[] {
  if (hero.method !== 'guided') return []
  const ps = hero.powerSource ? powerSourcesById.get(hero.powerSource.id) : undefined
  const bg = hero.background ? backgroundsById.get(hero.background.id) : undefined
  const outer = hero.archetype ? archetypesById.get(hero.archetype.id) : undefined
  const exclude = outer?.secondaryArchetype?.exclude ?? []
  const steps: { step: RuleWarning['step']; choice: { id: string; roll?: RollRecord } | null | undefined; dice: readonly Die[] | undefined; table: readonly { id: string; roll: number; name: string }[]; what: string }[] = [
    { step: 'background', choice: hero.background, dice: backgroundStep.startingDice, table: backgrounds, what: 'background' },
    { step: 'powerSource', choice: hero.powerSource, dice: bg?.powerSourceDice, table: powerSources, what: 'power source' },
    { step: 'archetype', choice: hero.archetype, dice: ps?.archetypeDice, table: archetypes, what: 'archetype' },
    { step: 'archetype', choice: hero.archetype?.secondary, dice: ps?.archetypeDice, table: archetypes.filter((a) => !exclude.includes(a.id)), what: 'second archetype' },
    { step: 'personality', choice: hero.personality, dice: outerLayer(hero)?.archetype.personalityDice, table: personalities, what: 'personality' },
  ]
  return steps.flatMap(({ step, choice, dice, table, what }) => {
    const roll = choice?.roll
    if (!choice || !roll || !dice || !rolledOn(roll, dice)) return []
    if (tableOptions(table, roll.results).some((o) => o.entry.id === choice.id)) return []
    const name = table.find((t) => t.id === choice.id)?.name ?? choice.id
    return [warning(step, 'not-rolled', `Your ${what} roll (${listAnd(roll.results)}) doesn't reach ${name}. Choose one it reaches, or keep it if your table allows.`)]
  })
}
