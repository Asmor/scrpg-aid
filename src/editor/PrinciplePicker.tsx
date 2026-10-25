/**
 * Choosing a principle from a category (or from any, grouped by category), and filling in its
 * blank if it has one, or writing one's own (p. 141).
 */
import { useId } from 'react'
import { principleCategories, principles, principlesById } from '../rules/data'
import { formatEntryRef } from '../rules/books'
import type { PrincipleCategoryId } from '../rules/types'
import { CUSTOM_PRINCIPLE_ID, type CustomPrinciple, type PrincipleChoice } from '../hero/model'

interface PrinciplePickerProps {
  /** Leave out to offer every principle (the change-principle retcon). */
  category: PrincipleCategoryId | undefined
  /** The select's label when there's no category. */
  label?: string
  choice: PrincipleChoice | undefined
  onChange: (choice: PrincipleChoice | undefined) => void
}

function CustomFields({ custom, fixedCategory, onChange }: { custom: CustomPrinciple; fixedCategory: boolean; onChange: (custom: CustomPrinciple) => void }) {
  const id = useId()
  const text = (key: 'name' | 'roleplaying' | 'minorTwist' | 'majorTwist', label: string, long = false) => (
    <label className="field" htmlFor={`${id}-${key}`}>
      <span>{label}</span>
      {long ? (
        <textarea id={`${id}-${key}`} rows={3} value={custom[key]} onChange={(e) => onChange({ ...custom, [key]: e.target.value })} />
      ) : (
        <input id={`${id}-${key}`} type="text" value={custom[key]} onChange={(e) => onChange({ ...custom, [key]: e.target.value })} />
      )}
    </label>
  )
  return (
    <div className="principle-picker__custom">
      <p className="hint">A principle you write needs your GM's approval. Its Green ability should improve an Overcome in a specific circumstance, neither too narrow nor too broad.</p>
      {text('name', 'Name')}
      {!fixedCategory && (
        <label className="field" htmlFor={`${id}-category`}>
          <span>Category</span>
          <select id={`${id}-category`} value={custom.category} onChange={(e) => onChange({ ...custom, category: e.target.value as PrincipleCategoryId })}>
            {principleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {text('roleplaying', 'During roleplaying', true)}
      {text('minorTwist', 'Minor twist question')}
      {text('majorTwist', 'Major twist question')}
      <label className="field" htmlFor={`${id}-ability-name`}>
        <span>Green ability name (optional)</span>
        <input id={`${id}-ability-name`} type="text" value={custom.greenAbility.name} onChange={(e) => onChange({ ...custom, greenAbility: { ...custom.greenAbility, name: e.target.value } })} />
      </label>
      <label className="field" htmlFor={`${id}-ability-text`}>
        <span>Green ability</span>
        <textarea id={`${id}-ability-text`} rows={3} value={custom.greenAbility.text} onChange={(e) => onChange({ ...custom, greenAbility: { ...custom.greenAbility, text: e.target.value } })} />
      </label>
    </div>
  )
}

const blankCustom = (category: PrincipleCategoryId): CustomPrinciple => ({ category, name: '', roleplaying: '', minorTwist: '', majorTwist: '', greenAbility: { name: '', text: '' } })

export function PrinciplePicker({ category, label = 'Principle', choice, onChange }: PrinciplePickerProps) {
  const id = useId()
  const categoryName = principleCategories.find((c) => c.id === category)?.name ?? category
  const options = principles.filter((p) => p.category === category)
  const isCustom = choice?.id === CUSTOM_PRINCIPLE_ID
  const principle = choice && !isCustom ? principlesById.get(choice.id) : undefined
  const offList = principle && category && principle.category !== category
  return (
    <div className="principle-picker">
      <label htmlFor={`${id}-principle`}>{category ? `Principle of ${categoryName}` : label}</label>
      <select
        id={`${id}-principle`}
        value={choice?.id ?? ''}
        onChange={(e) => {
          const value = e.target.value
          if (!value) return onChange(undefined)
          // A step's own category goes on a custom principle; the retcon lets the player pick one.
          if (value === CUSTOM_PRINCIPLE_ID) return onChange({ id: value, custom: choice?.custom ?? blankCustom(category ?? principleCategories[0]!.id) })
          onChange({ id: value })
        }}
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
        <option value={CUSTOM_PRINCIPLE_ID}>Write my own principle…</option>
      </select>
      {isCustom && (
        <>
          {category && choice.custom && choice.custom.category !== category && (
            <div className="leftovers">
              <p className="hint">This principle is saved as {principleCategories.find((c) => c.id === choice.custom!.category)?.name}, but this step's principle is {categoryName}.</p>
              <button type="button" className="button" onClick={() => onChange({ ...choice, custom: { ...choice.custom!, category } })}>
                Make it {categoryName}
              </button>
            </div>
          )}
          <CustomFields
            custom={choice.custom ?? blankCustom(category ?? principleCategories[0]!.id)}
            fixedCategory={Boolean(category)}
            onChange={(custom) => onChange({ ...choice, custom: category ? { ...custom, category } : custom })}
          />
        </>
      )}
      {principle && choice && (
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
