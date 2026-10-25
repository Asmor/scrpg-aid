/**
 * Step 5, Red abilities (p. 106–111): choose two, each from a power or quality category the
 * hero can use with it. Categories the hero has a trait in come first; the rest are tucked
 * away, since the checks would flag them. Minion-Maker's extra options are listed too.
 * The lists are shared with the retcon that gains a Red ability.
 */
import { redAbilityCategories, redAbilityStep } from '../rules/data'
import { formatEntryRef } from '../rules/books'
import type { Ability } from '../rules/types'
import type { AbilityPick, AbilitySource, Hero } from '../hero/model'
import type { SlotLimit } from '../creation/abilities'
import { extraRedOptions, redCategoryKey } from '../creation/lookup'
import { categoryName, hasRedCategory, redPickSection, redSlotLimit } from '../creation/red'
import { deriveTraits } from '../creation/traits'
import type { StepId } from '../creation/warnings'
import { AbilityPicker } from './AbilityPicker'

type Update = (change: (draft: Hero) => void) => void

interface RedAbilityListsProps {
  hero: Hero
  picks: readonly AbilityPick[]
  source: Extract<AbilitySource, 'red' | 'retcon'>
  step: StepId
  onChange: (picks: AbilityPick[]) => void
}

/** Red abilities grouped by category, with Minion-Maker's extras and picks that match nothing. */
export function RedAbilityLists({ hero, picks, source, step, onChange }: RedAbilityListsProps) {
  const traits = deriveTraits(hero).traits
  const inSection = (key: string) => picks.filter((p) => redPickSection(hero, p) === key)
  // Picks are saved with their category, since names repeat across categories.
  const setSection = (key: string, next: AbilityPick[], category?: string) =>
    onChange([...picks.filter((p) => redPickSection(hero, p) !== key), ...next.map((p) => (category ? { ...p, category } : p))])
  const picker = (key: string, legend: string, options: readonly Ability[], category?: string, hint?: string, slotLimit?: SlotLimit) => (
    <AbilityPicker
      key={key}
      hero={hero}
      traits={traits}
      legend={legend}
      hint={hint}
      options={options}
      source={source}
      step={step}
      picks={inSection(key)}
      slotLimit={slotLimit}
      onChange={(next) => setSection(key, next, category)}
    />
  )
  const yours = redAbilityCategories.filter((c) => hasRedCategory(traits, c))
  const others = redAbilityCategories.filter((c) => !hasRedCategory(traits, c))
  const extras = extraRedOptions(hero)
  const categoryPicker = (c: (typeof redAbilityCategories)[number]) => picker(redCategoryKey(c), `${categoryName(c)} Red abilities`, c.abilities, redCategoryKey(c), formatEntryRef(c), redSlotLimit(c))
  return (
    <>
      {inSection('stray').length > 0 && picker('stray', 'Red abilities not on any list', [], undefined, 'Untick these to remove them.')}
      {extras.length > 0 && picker('extra', 'Extra Red abilities from your archetype', extras)}
      {yours.map(categoryPicker)}
      {others.length > 0 && (
        <details className="red-others">
          <summary>Categories you have no power or quality in</summary>
          {others.map(categoryPicker)}
        </details>
      )}
    </>
  )
}

export function RedAbilitiesStep({ hero, update }: { hero: Hero; update: Update }) {
  return (
    <div className="step-form">
      <p className="hint">
        Choose {redAbilityStep.count}; you have {hero.redAbilities.length}. {redAbilityStep.rules} <span className="page-ref">{formatEntryRef(redAbilityStep)}</span>
      </p>
      <RedAbilityLists
        hero={hero}
        picks={hero.redAbilities}
        source="red"
        step="redAbilities"
        onChange={(picks) =>
          update((h) => {
            h.redAbilities = picks
          })
        }
      />
    </div>
  )
}
