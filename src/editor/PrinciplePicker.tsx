/** Choosing a principle from a category (or from any, grouped by category), and filling in its blank if it has one. */
import { useId } from 'react'
import { principleCategories, principles, principlesById } from '../rules/data'
import { formatEntryRef } from '../rules/books'
import type { PrincipleCategoryId } from '../rules/types'
import type { PrincipleChoice } from '../hero/model'

interface PrinciplePickerProps {
  /** Leave out to offer every principle (the change-principle retcon). */
  category: PrincipleCategoryId | undefined
  /** The select's label when there's no category. */
  label?: string
  choice: PrincipleChoice | undefined
  onChange: (choice: PrincipleChoice | undefined) => void
}

export function PrinciplePicker({ category, label = 'Principle', choice, onChange }: PrinciplePickerProps) {
  const id = useId()
  const categoryName = principleCategories.find((c) => c.id === category)?.name ?? category
  const options = principles.filter((p) => p.category === category)
  const principle = choice && principlesById.get(choice.id)
  const offList = principle && category && principle.category !== category
  return (
    <div className="principle-picker">
      <label htmlFor={`${id}-principle`}>{category ? `Principle of ${categoryName}` : label}</label>
      <select
        id={`${id}-principle`}
        value={choice?.id ?? ''}
        onChange={(e) => onChange(e.target.value ? { id: e.target.value } : undefined)}
      >
        <option value="">Choose…</option>
        {offList && <option value={principle.id}>{principle.name} (not {categoryName})</option>}
        {category
          ? options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          : principleCategories.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {principles
                  .filter((p) => p.category === c.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
      </select>
      {principle && (
        <div className="principle-picker__detail">
          {principle.customization && (
            <label className="field">
              <span>{principle.customization}</span>
              <input
                type="text"
                value={choice.customization ?? ''}
                onChange={(e) => onChange({ ...choice, customization: e.target.value })}
              />
            </label>
          )}
          <p>{principle.roleplaying}</p>
          <p className="page-ref">{formatEntryRef(principle)}</p>
        </div>
      )}
    </div>
  )
}
