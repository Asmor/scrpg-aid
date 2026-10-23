import { useId } from 'react'
import { THEME_PREFERENCES, type ThemePreference } from '../theme/theme'

const LABELS: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' }

interface ThemeToggleProps {
  value: ThemePreference
  onChange: (preference: ThemePreference) => void
}

/** A segmented System / Light / Dark control, built from native radio buttons for keyboard and screen-reader support. */
export function ThemeToggle({ value, onChange }: ThemeToggleProps) {
  const name = useId()
  return (
    <fieldset className="theme-toggle">
      <legend className="visually-hidden">Color theme</legend>
      {THEME_PREFERENCES.map((preference) => (
        <label key={preference} className="theme-toggle__option">
          <input
            type="radio"
            name={name}
            value={preference}
            checked={value === preference}
            onChange={() => onChange(preference)}
          />
          <span>{LABELS[preference]}</span>
        </label>
      ))}
    </fieldset>
  )
}
