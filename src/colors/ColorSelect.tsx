/** The compact color choice (scrpg-aid-designs/character-colors/spec.md, section 3): the default first, then the 13, with a swatch for what's chosen. */
import { useId } from 'react'
import { CharSwatch } from '../components/CharBand'
import { CHAR_COLORS, PALETTE, type CharColor } from './palette'

interface Props {
  value: CharColor | undefined
  /** What the unset choice is called, and looks like. */
  unset: { label: string; color: CharColor }
  /** The field's label, when "Color" doesn't say enough. */
  label?: string
  onChange: (color: CharColor | undefined) => void
}

export function ColorSelect({ value, unset, label = 'Color', onChange }: Props) {
  const id = useId()
  return (
    <div className="field color-select">
      <label htmlFor={id}>{label}</label>
      <span className="color-select__row">
        <CharSwatch appearance={{ primary: value ?? unset.color }} />
        <select id={id} value={value ?? ''} onChange={(e) => onChange((CHAR_COLORS as readonly string[]).includes(e.target.value) ? (e.target.value as CharColor) : undefined)}>
          <option value="">{unset.label}</option>
          {PALETTE.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </span>
    </div>
  )
}
