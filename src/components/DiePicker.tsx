/** Die icons as radio buttons, each labeled with its size (scrpg-aid-designs/npcs/spec.md, section 8). */
import { useId } from 'react'
import { DICE } from '../rules/dice'
import type { Die } from '../rules/types'
import { DieIcon } from './icons'

export function DiePicker({ value, onChange, label }: { value: Die; onChange: (die: Die) => void; label: string }) {
  const name = useId()
  return (
    <fieldset className="die-picker">
      <legend>{label}</legend>
      {DICE.map((d) => (
        <label key={d} className={d === value ? 'die-picker__option die-picker__option--on' : 'die-picker__option'}>
          <input type="radio" className="visually-hidden" name={name} value={d} checked={d === value} onChange={() => onChange(d)} aria-label={d} />
          <DieIcon die={d} />
        </label>
      ))}
    </fieldset>
  )
}

