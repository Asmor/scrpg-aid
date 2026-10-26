/**
 * Taking a step's bonus (a power source's, archetype's, or personality's). Each bonus kind
 * records its result as assignments: the trait and the die it ends up with.
 */
import { useId } from 'react'
import { expandRefs, traitKey, type CatalogTrait, type TraitRef } from '../rules/catalog'
import type { Bonus, Die, OptionRef } from '../rules/types'
import type { Hero, TraitAssignment } from '../hero/model'
import { fallbackOptions, gainOptions, shiftTargets, splitShift, upgradeTargets, usesFallback, type BonusTarget } from '../creation/bonus'
import { traitLabel, type HeroTrait } from '../creation/traits'
import { DiceText } from '../components/icons'

interface BonusPickerProps {
  hero: Hero
  /** e.g. "Mystical's bonus" */
  legend: string
  bonus: Bonus
  /** The power source's power list, for bonuses that refer to it. */
  listed: readonly OptionRef[]
  /** The hero's traits before the bonus applies. */
  before: readonly HeroTrait[]
  /** In the archetype step, the archetype's quality list, for Training's extra quality. */
  archetypeQualities?: readonly OptionRef[]
  assignments: readonly TraitAssignment[]
  onChange: (assignments: TraitAssignment[]) => void
}

interface PickOption {
  trait: TraitRef
  label: string
  die: Die
}

/** Options shown under a heading (an optgroup) when a select offers two kinds of choice. */
interface OptionGroup {
  label: string
  options: readonly PickOption[]
}

const sameChoice = (o: PickOption, a: TraitAssignment) => traitKey(o.trait) === traitKey(a.trait) && o.die === a.die

/** One select that records `{ trait, die }` for the chosen option. Takes plain options, or groups of them. */
function TraitSelect({ hero, label, options, value, onChange }: { hero: Hero; label: string; options: readonly PickOption[] | readonly OptionGroup[]; value: TraitAssignment | undefined; onChange: (a: TraitAssignment | undefined) => void }) {
  const id = useId()
  const groups = options.length > 0 && 'options' in options[0]! ? (options as readonly OptionGroup[]) : undefined
  const flat = groups ? groups.flatMap((g) => g.options) : (options as readonly PickOption[])
  // Option values say which group they're from, since the same trait may be in both (at different dice).
  const valueOf = (o: PickOption) => `${traitKey(o.trait)}@${o.die}`
  const offList = value && !flat.some((o) => sameChoice(o, value))
  const render = (list: readonly PickOption[]) =>
    list.map((o) => (
      <option key={valueOf(o)} value={valueOf(o)}>
        {o.label}
      </option>
    ))
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value ? `${traitKey(value.trait)}@${value.die}` : ''}
        onChange={(e) => {
          const option = flat.find((o) => valueOf(o) === e.target.value)
          onChange(option ? { trait: option.trait, die: option.die } : undefined)
        }}
      >
        <option value="">Choose…</option>
        {offList && (
          <option value={`${traitKey(value.trait)}@${value.die}`}>
            {traitLabel(hero, value.trait)} at {value.die} (doesn't fit)
          </option>
        )}
        {groups
          ? groups
              .filter((g) => g.options.length > 0)
              .map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {render(g.options)}
                </optgroup>
              ))
          : render(flat)}
      </select>
    </label>
  )
}

const gained = (hero: Hero, traits: readonly CatalogTrait[], die: Die): PickOption[] => traits.map((t) => ({ trait: { kind: t.kind, id: t.id }, die, label: `${traitLabel(hero, t)} at ${die}` }))
const changed = (targets: readonly BonusTarget[]): PickOption[] => targets.map((t) => ({ trait: t.trait.trait, die: t.die, label: `${t.trait.name}: ${t.trait.die} → ${t.die}` }))

export function BonusPicker({ hero, legend, bonus, listed, before, archetypeQualities, assignments, onChange }: BonusPickerProps) {
  const single = (a: TraitAssignment | undefined) => onChange(a ? [a] : [])
  let body
  switch (bonus.kind) {
    case 'extraArchetypeQuality':
      body = archetypeQualities ? (
        <TraitSelect hero={hero} label="Quality" options={gained(hero, expandRefs(archetypeQualities), bonus.die)} value={assignments[0]} onChange={single} />
      ) : (
        <p>You take this in the archetype step.</p>
      )
      break
    case 'gainQuality':
    case 'gainPower':
      body = <TraitSelect hero={hero} label={bonus.kind === 'gainQuality' ? 'Quality' : 'Power'} options={gained(hero, gainOptions(bonus, listed), bonus.die)} value={assignments[0]} onChange={single} />
      break
    case 'upgradeDie': {
      const fallback = bonus.fallback && usesFallback(bonus, before) ? bonus.fallback : undefined
      // With no power to upgrade, the hero gains a power instead, or (the user's ruling 9)
      // may still upgrade a quality the bonus allows.
      body = fallback ? (
        <>
          <p className="hint">You have no power it can upgrade, so you can gain a power instead.</p>
          <TraitSelect
            hero={hero}
            label="Upgrade or gain"
            options={[
              { label: 'Upgrade', options: changed(upgradeTargets(bonus, before)) },
              { label: 'Gain a power instead', options: gained(hero, fallbackOptions(bonus, listed), fallback.die) },
            ]}
            value={assignments[0]}
            onChange={single}
          />
        </>
      ) : (
        <TraitSelect hero={hero} label="Upgrade" options={changed(upgradeTargets(bonus, before))} value={assignments[0]} onChange={single} />
      )
      break
    }
    case 'shiftDice': {
      const { down, up } = shiftTargets(bonus, before)
      const { lowered, raised } = splitShift(assignments, before)
      const set = (which: 'lowered' | 'raised', a: TraitAssignment | undefined) => {
        const next = which === 'lowered' ? [a, raised] : [lowered, a]
        onChange(next.filter((x): x is TraitAssignment => Boolean(x)))
      }
      body = (
        <>
          <TraitSelect hero={hero} label="Lower" options={changed(down)} value={lowered} onChange={(a) => set('lowered', a)} />
          <TraitSelect hero={hero} label="Raise" options={changed(up).filter((o) => !lowered || traitKey(o.trait) !== traitKey(lowered.trait))} value={raised} onChange={(a) => set('raised', a)} />
        </>
      )
      break
    }
  }
  return (
    <fieldset className="bonus-picker">
      <legend>{legend}</legend>
      <p>
        <DiceText text={bonus.summary} />
      </p>
      {body}
    </fieldset>
  )
}
