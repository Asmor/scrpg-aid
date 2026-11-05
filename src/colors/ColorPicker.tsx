/**
 * The color picker (docs/design/character-colors/spec.md, section 3): primary, an optional secondary
 * and a gradient for heroes and villains, with previews in both themes. `SingleColorPicker` is the
 * one-color version for groups, challenges and environments, with By side first.
 */
import { useId, type CSSProperties, type ReactNode } from 'react'
import { appearanceOf, cleanAppearance, fillCss, fillStyle, GRADIENT_NAME, GRADIENTS, PALETTE, side, SIDE_COLOR, type Appearance, type CharColor, type ColoredItem, type Gradient, type Side } from './palette'

const Check = ({ ink }: { ink: string }) => (
  <svg className="color-swatch__check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="3" aria-hidden="true">
    <path d="M5 12l5 5 9-10" />
  </svg>
)

function Swatch({ name, label, checked, background, ink, children, onPick }: { name: string; label: string; checked: boolean; background?: string; ink?: string; children?: ReactNode; onPick: () => void }) {
  return (
    <label className="color-swatch" title={label} style={background ? { background } : undefined}>
      <input type="radio" name={name} aria-label={label} checked={checked} onChange={onPick} />
      {children}
      {checked && ink && <Check ink={ink} />}
    </label>
  )
}

function Swatches({ legend, optional, value, none, onChange }: { legend: string; optional?: boolean; value: CharColor | undefined; /** The choice first in the row, for no color of its own. */ none?: { label: string; background?: string; ink?: string }; onChange: (color: CharColor | undefined) => void }) {
  const name = useId()
  return (
    <fieldset className="color-row">
      <legend>
        {legend} {optional && <span className="muted">(optional)</span>}
      </legend>
      <div className="color-row__swatches">
        {none && (
          <Swatch name={name} label={none.label} checked={value === undefined} {...(none.background ? { background: none.background } : {})} {...(none.ink ? { ink: none.ink } : {})} onPick={() => onChange(undefined)}>
            {!none.background && value !== undefined && <span className="color-swatch__word">{none.label}</span>}
          </Swatch>
        )}
        {PALETTE.map((c) => (
          <Swatch key={c.id} name={name} label={c.name} checked={value === c.id} background={`var(--char-${c.id})`} ink={`var(--char-${c.id}-ink)`} onPick={() => onChange(c.id)} />
        ))}
      </div>
    </fieldset>
  )
}

function GradientChoice({ appearance, onChange }: { appearance: Appearance; onChange: (a: Appearance) => void }) {
  const name = useId()
  const current = appearance.gradient ?? 'vertical'
  return (
    <fieldset className="color-row">
      <legend>Gradient</legend>
      <div className="color-row__swatches">
        {GRADIENTS.map((g: Gradient) => (
          <label key={g} className="color-gradient" title={GRADIENT_NAME[g]}>
            <input type="radio" name={name} aria-label={GRADIENT_NAME[g]} checked={current === g} onChange={() => onChange({ ...appearance, gradient: g })} />
            <span className="color-gradient__square" style={{ background: fillCss({ ...appearance, gradient: g }) }} />
          </label>
        ))}
        <label className="checkbox">
          <input type="checkbox" checked={Boolean(appearance.invert)} onChange={(e) => onChange({ ...appearance, invert: e.target.checked })} />
          Invert
        </label>
      </div>
    </fieldset>
  )
}

const SIDE_CLASS: Record<Side, string> = { gm: 'char-chip--gm', heroes: 'char-chip--heroes', environment: 'char-chip--environment' }

function ThemePreview({ theme, name, appearance, chipSide }: { theme: 'light' | 'dark'; name: string; appearance: Appearance; chipSide: Side }) {
  return (
    <div className={`color-preview char-theme-${theme}`}>
      <span className="color-preview__theme">{theme === 'light' ? 'Light' : 'Dark'}</span>
      <span className={`char-chip ${SIDE_CLASS[chipSide]}`} style={{ '--char-side': `var(--char-${SIDE_COLOR[chipSide]})` } as CSSProperties}>
        <span className="char-chip__fill char-fill" style={fillStyle(appearance)}>
          {name}
        </span>
      </span>
      <div className="char-band char-fill" style={fillStyle(appearance)}>
        {name}
      </div>
    </div>
  )
}

function Previews({ name, appearance, chipSide }: { name: string; appearance: Appearance; chipSide: Side }) {
  return (
    <div className="color-previews" role="group" aria-label="Preview">
      <ThemePreview theme="light" name={name} appearance={appearance} chipSide={chipSide} />
      <ThemePreview theme="dark" name={name} appearance={appearance} chipSide={chipSide} />
    </div>
  )
}

interface ColorPickerProps {
  /** Hero or villain, for the default and the side. */
  kind: 'hero' | 'villain'
  appearance: Appearance | undefined
  /** The name in the previews. */
  name: string
  onChange: (appearance: Appearance) => void
}

export function ColorPicker({ kind, appearance, name, onChange }: ColorPickerProps) {
  const item: ColoredItem = { kind, appearance }
  const a = appearanceOf(item)
  const change = (next: Appearance) => onChange(cleanAppearance(next))
  return (
    <div className="color-picker">
      <Swatches legend="Primary" value={a.primary} onChange={(c) => c && change({ ...a, primary: c })} />
      <Swatches
        legend="Secondary"
        optional
        value={a.secondary}
        none={{ label: 'None', ink: 'var(--ui-text)' }}
        onChange={(c) => {
          if (c) return change({ ...a, secondary: c })
          change({ primary: a.primary })
        }}
      />
      {a.secondary && <GradientChoice appearance={a} onChange={change} />}
      <Previews name={name} appearance={a} chipSide={side(item)} />
    </div>
  )
}

interface SingleColorPickerProps {
  item: Extract<ColoredItem, { kind: 'group' | 'challenge' | 'environment' }>
  name: string
  onChange: (color: CharColor | undefined) => void
}

/** One color, with By side first (the side's color). */
export function SingleColorPicker({ item, name, onChange }: SingleColorPickerProps) {
  const bySide = SIDE_COLOR[side(item)]
  return (
    <div className="color-picker">
      <Swatches legend="Color" value={item.color} none={{ label: 'By side', background: `var(--char-${bySide})`, ink: `var(--char-${bySide}-ink)` }} onChange={onChange} />
      <Previews name={name} appearance={appearanceOf(item)} chipSide={side(item)} />
    </div>
  )
}
