/**
 * Puts a step's dice on powers or qualities from the step's list, one choice per die. A
 * trait the hero already has from an earlier step can be upgraded with a bigger die
 * (p. 44); the rules checks warn about anything that doesn't fit.
 */
import { useId } from 'react'
import { getCategory, getTrait, traitKey, type CatalogTrait, type TraitRef } from '../rules/catalog'
import type { Die } from '../rules/types'
import type { Hero, TraitAssignment } from '../hero/model'
import { assignRow, dieRows } from '../creation/assign'
import { traitLabel, type HeroTrait } from '../creation/traits'

interface DiceAssignerProps {
  hero: Hero
  /** e.g. "Background qualities" */
  legend: string
  dice: readonly Die[]
  assignments: readonly TraitAssignment[]
  /** The traits the step's list allows. */
  options: readonly CatalogTrait[]
  /** The hero's traits from earlier steps, for offering upgrades. */
  earlier: readonly HeroTrait[]
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

const fromKey = (key: string): TraitRef => {
  const [kind, id] = key.split(':') as [TraitRef['kind'], string]
  return { kind, id }
}

export function DiceAssigner({ hero, legend, dice, assignments, options, earlier, onChange }: DiceAssignerProps) {
  const baseId = useId()
  const rows = dieRows(dice, assignments)
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
        return (
          <div key={i} className="dice-assigner__row">
            <label htmlFor={selectId} className="die">
              {row.die}
              {/* Tells apart dice of the same size, e.g. "d6 #2". */}
              {dice.filter((d) => d === row.die).length > 1 && <span className="visually-hidden"> #{dice.slice(0, i + 1).filter((d) => d === row.die).length}</span>}
            </label>
            <select
              id={selectId}
              value={current ? traitKey(current.trait) : ''}
              onChange={(e) => onChange(assignRow(dice, assignments, i, e.target.value ? fromKey(e.target.value) : undefined))}
            >
              <option value="">Choose…</option>
              {offList && <option value={traitKey(current.trait)}>{traitLabel(hero, current.trait)} (not on this list)</option>}
              {groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.traits.map((t) => (
                    <option key={traitKey(t)} value={traitKey(t)}>
                      {traitLabel(hero, t)}
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
                  onChange={(e) => onChange(assignRow(dice, assignments, i, current.trait, e.target.checked))}
                />
                Upgrade my {getTrait(had.trait)?.name ?? had.name} ({had.die})
              </label>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}
