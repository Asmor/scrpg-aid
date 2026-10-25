/**
 * Step 5, Red abilities (p. 106–111): choose two, each from a power or quality category the
 * hero can use with it. Categories the hero has a trait in come first; the rest are tucked
 * away, since the checks would flag them. Minion-Maker's extra options are listed too.
 */
import { redAbilityCategories, redAbilityStep } from '../rules/data'
import { formatEntryRef } from '../rules/books'
import type { Ability } from '../rules/types'
import type { AbilityPick, Hero } from '../hero/model'
import { extraRedOptions, redCategoryKey } from '../creation/lookup'
import { categoryName, hasRedCategory, redPickSection } from '../creation/red'
import { deriveTraits } from '../creation/traits'
import { AbilityPicker } from './AbilityPicker'

type Update = (change: (draft: Hero) => void) => void

export function RedAbilitiesStep({ hero, update }: { hero: Hero; update: Update }) {
  const traits = deriveTraits(hero).traits
  const picks = hero.redAbilities
  const inSection = (key: string) => picks.filter((p) => redPickSection(hero, p) === key)
  // Picks are saved with their category, since names repeat across categories.
  const setSection = (key: string, next: AbilityPick[], category?: string) =>
    update((h) => {
      h.redAbilities = [...h.redAbilities.filter((p) => redPickSection(hero, p) !== key), ...next.map((p) => (category ? { ...p, category } : p))]
    })
  const picker = (key: string, legend: string, options: readonly Ability[], category?: string, hint?: string) => (
    <AbilityPicker
      key={key}
      hero={hero}
      traits={traits}
      legend={legend}
      hint={hint}
      options={options}
      source="red"
      step="redAbilities"
      picks={inSection(key)}
      onChange={(next) => setSection(key, next, category)}
    />
  )
  const yours = redAbilityCategories.filter((c) => hasRedCategory(traits, c))
  const others = redAbilityCategories.filter((c) => !hasRedCategory(traits, c))
  const extras = extraRedOptions(hero)
  const categoryPicker = (c: (typeof redAbilityCategories)[number]) => picker(redCategoryKey(c), `${categoryName(c)} Red abilities`, c.abilities, redCategoryKey(c), formatEntryRef(c))

  return (
    <div className="step-form">
      <p className="hint">
        Choose {redAbilityStep.count}; you have {picks.length}. {redAbilityStep.rules} <span className="page-ref">{formatEntryRef(redAbilityStep)}</span>
      </p>
      {inSection('stray').length > 0 && picker('stray', 'Red abilities not on any list', [], undefined, 'Untick these to remove them.')}
      {extras.length > 0 && picker('extra', 'Extra Red abilities from your archetype', extras)}
      {yours.map(categoryPicker)}
      {others.length > 0 && (
        <details className="red-others">
          <summary>Categories you have no power or quality in</summary>
          {others.map(categoryPicker)}
        </details>
      )}
    </div>
  )
}
