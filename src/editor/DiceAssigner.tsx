/**
 * Puts a step's dice on powers or qualities from the step's list, one choice per die. A
 * trait the character already has from an earlier step can be upgraded with a bigger die
 * (p. 44), which adds a row for the old die it frees; the rules checks warn about anything
 * that doesn't fit.
 */
import { useId } from 'react'
import { getCategory, getTrait, parseTraitKey, traitKey, type CatalogTrait, type TraitRef } from '../rules/catalog'
import type { Die } from '../rules/types'
import type { TraitAssignment } from '../hero/model'
import { assignStepRow, dieRows, freedDice } from '../creation/assign'
import type { HeroTrait } from '../creation/traits'
import { DieIcon } from '../components/icons'

interface DiceAssignerProps {
  /** A trait's name for this character (the player's name for it, or the catalog's). */
  label: (trait: TraitRef) => string
  /** e.g. "Background qualities" */
  legend: string
  dice: readonly Die[]
  assignments: readonly TraitAssignment[]
  /** The traits the step's list allows. */
  options: readonly CatalogTrait[]
  /** The character's traits from earlier steps, for offering upgrades. */
  earlier: readonly Pick<HeroTrait, 'trait' | 'die' | 'name'>[]
  /** Traits that may swap in any die rather than only a bigger one (an archetype's required trait). */
  canSwap?: (trait: TraitRef) => boolean
  onChange: (assignments: TraitAssignment[]) => void
}

/** Groups traits by category, keeping the list's order. */
function byCategory(traits: readonly CatalogTrait[]): { label: string; traits: CatalogTrait[] }[] {
  const groups = new Map<string, { label: string; traits: CatalogTrait[] }>()
  for (const t of traits) {
    const key = `${t.kind}:${t.categoryId}`
    const group = groups.get(key) ?? { label: `${getCategory(t.kind, t.categoryId)?.name ?? t.categoryId} ${t.kind === 'power' ? 'powers' : 'qualities'}`, traits: [] }
    group.traits.push(t)
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function DiceAssigner({ label, legend, dice, assignments, options, earlier, canSwap = () => false, onChange }: DiceAssignerProps) {
  const baseId = useId()
  const freed = freedDice(assignments, earlier)
  const all = [...dice, ...freed.map((f) => f.die)]
  const rows = dieRows(all, assignments)
  const assign = (index: number, trait: TraitRef | undefined, upgrades = false) => onChange(assignStepRow(dice, earlier, assignments, index, trait, upgrades))
  const groups = byCategory(options)
  return (
    <fieldset className="dice-assigner">
      <legend>{legend}</legend>
      {rows.map((row, i) => {
        const current = row.assignment
        const selectId = `${baseId}-${i}`
        const had = current && earlier.find((t) => traitKey(t.trait) === traitKey(current.trait))
        // Keep the current choice selectable even if it isn't on the list (the checks warn about it).
        const offList = current && !options.some((o) => traitKey(o) === traitKey(current.trait))
        const freedFrom = freed[i - dice.length]?.from
        return (
          <div key={i} className="dice-assigner__row">
            <label htmlFor={selectId} className="die">
              <DieIcon die={row.die} />
              {/* Tells apart dice of the same size, e.g. "d6 #2". */}
              {/* The spaces sit outside the spans so they're kept in the accessible name. */}
              {all.filter((d) => d === row.die).length > 1 && (
                <>
                  {' '}
                  <span className="visually-hidden">#{all.slice(0, i + 1).filter((d) => d === row.die).length}</span>
                </>
              )}
              {freedFrom && (
                <>
                  {' '}
                  <span className="dice-assigner__freed">(was {label(freedFrom)}'s)</span>
                </>
              )}
            </label>
            <select
              id={selectId}
              value={current ? traitKey(current.trait) : ''}
              onChange={(e) => assign(i, e.target.value ? parseTraitKey(e.target.value) : undefined)}
            >
              <option value="">Choose…</option>
              {offList && <option value={traitKey(current.trait)}>{label(current.trait)} (not on this list)</option>}
              {groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.traits.map((t) => (
                    <option key={traitKey(t)} value={traitKey(t)}>
                      {label(t)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {had && (
              <label className="dice-assigner__upgrade">
                <input
                  type="checkbox"
                  checked={Boolean(current.upgrades)}
                  onChange={(e) => assign(i, current.trait, e.target.checked)}
                />
                {canSwap(had.trait) ? 'Swap this die onto' : 'Upgrade'} my {getTrait(had.trait)?.name ?? had.name} (<DieIcon die={had.die} />)
              </label>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}
