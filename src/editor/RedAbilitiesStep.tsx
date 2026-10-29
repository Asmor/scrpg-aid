/**
 * Step 5, Red abilities (p. 106–111): choose two, each from a power or quality category the
 * hero can use with it. The lists are long, so a line says how many are chosen of how many
 * allowed, each category is a collapsible group showing how many it has chosen, and "Only ones I can take" (on by default) hides
 * the categories the hero has no trait in, since the checks would flag them. Minion-Maker's
 * extra options are listed too. The lists are shared with the retcon that gains a Red ability.
 */
import { useId, useState } from 'react'
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
import { DiceText } from '../components/icons'

type Update = (change: (draft: Hero) => void) => void

interface RedAbilityListsProps {
  hero: Hero
  picks: readonly AbilityPick[]
  /** How many may be chosen in all, for the "chosen of allowed" line. */
  allowed: number
  source: Extract<AbilitySource, 'red' | 'retcon'>
  step: StepId
  onChange: (picks: AbilityPick[]) => void
}

/** Red abilities grouped by category, with Minion-Maker's extras and picks that match nothing. */
export function RedAbilityLists({ hero, picks, allowed, source, step, onChange }: RedAbilityListsProps) {
  const filterId = useId()
  const [onlyMine, setOnlyMine] = useState(true)
  const traits = deriveTraits(hero).traits
  const inSection = (key: string) => picks.filter((p) => redPickSection(hero, p) === key)
  // Groups with a pick start open; after that, the player's opening and closing sticks.
  const [open, setOpen] = useState(() => new Set(picks.map((p) => redPickSection(hero, p))))
  // Picks are saved with their category, since names repeat across categories.
  const setSection = (key: string, next: AbilityPick[], category?: string) =>
    onChange([...picks.filter((p) => redPickSection(hero, p) !== key), ...next.map((p) => (category ? { ...p, category } : p))])
  const picker = (key: string, legend: string, options: readonly Ability[], category?: string, hint?: string, slotLimit?: SlotLimit) => {
    const chosen = inSection(key).length
    return (
      <details
        key={key}
        className="ability-group"
        open={open.has(key)}
        onToggle={(e) => {
          const isOpen = e.currentTarget.open
          setOpen((was) => {
            if (was.has(key) === isOpen) return was
            const next = new Set(was)
            if (isOpen) next.add(key)
            else next.delete(key)
            return next
          })
        }}
      >
        <summary>
          <span className="ability-group__name">{legend}</span>
          <span className="ability-group__count">{chosen} chosen</span>
        </summary>
        <AbilityPicker
          hero={hero}
          traits={traits}
          legend={legend}
          hideLegend
          hint={hint}
          options={options}
          source={source}
          step={step}
          picks={inSection(key)}
          slotLimit={slotLimit}
          onChange={(next) => setSection(key, next, category)}
        />
      </details>
    )
  }
  const yours = redAbilityCategories.filter((c) => hasRedCategory(traits, c))
  const others = redAbilityCategories.filter((c) => !hasRedCategory(traits, c))
  const extras = extraRedOptions(hero)
  const categoryPicker = (c: (typeof redAbilityCategories)[number]) => picker(redCategoryKey(c), `${categoryName(c)} Red abilities`, c.abilities, redCategoryKey(c), formatEntryRef(c), redSlotLimit(c))
  // A category with a pick stays listed even when filtered out, so it can be removed.
  const shownOthers = onlyMine ? others.filter((c) => inSection(redCategoryKey(c)).length > 0) : others
  return (
    <div className="ability-groups">
      <div className="ability-groups__head">
        <span className="ability-groups__total">
          {picks.length} of {allowed} chosen
        </span>
        {others.length > 0 && (
          <label className="checkbox filter-toggle" htmlFor={filterId}>
            <input id={filterId} type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Only ones I can take
          </label>
        )}
      </div>
      {inSection('stray').length > 0 && picker('stray', 'Red abilities not on any list', [], undefined, 'Untick these to remove them.')}
      {extras.length > 0 && picker('extra', 'Extra Red abilities from your archetype', extras)}
      {yours.map(categoryPicker)}
      {shownOthers.map(categoryPicker)}
      {onlyMine && others.length > shownOthers.length && (
        <p className="hint">
          {others.length - shownOthers.length} more {others.length - shownOthers.length === 1 ? 'category needs' : 'categories need'} a power or quality you don't have. Untick "Only ones I can take" to see them.
        </p>
      )}
    </div>
  )
}

export function RedAbilitiesStep({ hero, update }: { hero: Hero; update: Update }) {
  return (
    <div className="step-form">
      <p className="hint">
        Choose {redAbilityStep.count}; you have {hero.redAbilities.length}. <DiceText text={redAbilityStep.rules} /> <span className="page-ref">{formatEntryRef(redAbilityStep)}</span>
      </p>
      <RedAbilityLists
        hero={hero}
        picks={hero.redAbilities}
        allowed={redAbilityStep.count}
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
