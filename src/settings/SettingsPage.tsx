/** The Settings page (docs/design/settings/spec.md): every change saves at once, with a short "Saved" beside it. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { DieIcon } from '../components/icons'
import { DICE } from '../rules/dice'
import { countsText, TRACKER_PRESETS } from '../rules/trackers'
import { useSettings } from './context'
import type { Settings } from './model'

const SAVED_FOR = 1800

/** Which control last changed, for its "Saved". */
function useSavedMark() {
  const [mark, setMark] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return {
    mark,
    saved(key: string) {
      setMark(key)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setMark(null), SAVED_FOR)
    },
  }
}

function Saved({ on }: { on: boolean }) {
  return (
    <span className="settings__saved" role="status" aria-live="polite">
      {on ? 'Saved' : ''}
    </span>
  )
}

function Radios<T extends string>({ legend, value, options, onChange, saved, hint }: { legend: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; saved: boolean; hint?: ReactNode }) {
  const name = useId()
  return (
    <fieldset className="settings__field">
      <legend>{legend}</legend>
      <div className="settings__row">
        <span className="theme-toggle">
          {options.map((o) => (
            <label key={o.value} className="theme-toggle__option">
              <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </span>
        <Saved on={saved} />
      </div>
      {hint}
    </fieldset>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="card settings__section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  )
}

export function SettingsPage() {
  const { settings, update, saveError } = useSettings()
  const { mark, saved } = useSavedMark()
  const set = (key: string, change: (s: Settings) => Settings) => {
    update(change)
    saved(key)
  }
  const newGame = (key: string, change: Partial<Settings['newGame']>) => set(key, (s) => ({ ...s, newGame: { ...s.newGame, ...change } }))
  const hiddenId = useId()
  return (
    <div className="settings">
      <h1>Settings</h1>
      <p className="muted">For this device. Changes save as you make them.</p>
      {saveError && (
        <p role="alert" className="error">
          Your last change couldn't be saved: {saveError}
        </p>
      )}
      <Section title="Dice">
        <Radios
          legend="Show dice as"
          value={settings.diceDisplay}
          options={[
            { value: 'icon', label: 'Icons' },
            { value: 'text', label: 'Text' },
          ]}
          onChange={(diceDisplay) => set('dice', (s) => ({ ...s, diceDisplay }))}
          saved={mark === 'dice'}
          hint={
            <p className="settings__preview">
              {DICE.map((d) => (
                <DieIcon key={d} die={d} />
              ))}
            </p>
          }
        />
      </Section>
      <Section title="Display">
        <Radios
          legend="Text size"
          value={settings.textSize}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'large', label: 'Large' },
            { value: 'larger', label: 'Larger' },
          ]}
          onChange={(textSize) => set('text', (s) => ({ ...s, textSize }))}
          saved={mark === 'text'}
        />
        <Radios
          legend="Motion"
          value={settings.motion}
          options={[
            { value: 'system', label: 'Follow my system' },
            { value: 'reduce', label: 'Reduce motion' },
            { value: 'allow', label: 'Allow motion' },
          ]}
          onChange={(motion) => set('motion', (s) => ({ ...s, motion }))}
          saved={mark === 'motion'}
        />
        <p className="hint">Theme is in the header. The display view keeps its own size.</p>
      </Section>
      <Section title="New games">
        <p className="hint">Defaults for games you start on this device. Games you already have don't change.</p>
        <Radios
          legend="Scene tracker"
          value={settings.newGame.trackerPreset}
          options={TRACKER_PRESETS.filter((p) => p.id === 'standard' || p.id === 'prolonged' || p.id === 'epic').map((p) => ({ value: p.id as Settings['newGame']['trackerPreset'], label: `${p.name} · ${countsText(p.counts)}` }))}
          onChange={(trackerPreset) => newGame('tracker', { trackerPreset })}
          saved={mark === 'tracker'}
        />
        <div className="settings__field">
          <span className="settings__label" id={hiddenId}>
            New opposition
          </span>
          <div className="settings__row">
            <label className="checkbox">
              <input type="checkbox" checked={settings.newGame.startHidden} aria-describedby={hiddenId} onChange={(e) => newGame('hidden', { startHidden: e.target.checked })} />
              Starts hidden
            </label>
            <Saved on={mark === 'hidden'} />
          </div>
        </div>
        <Radios
          legend="Players see villains as"
          value={settings.newGame.playersSee}
          options={[
            { value: 'name', label: 'Name only' },
            { value: 'status', label: 'Status' },
            { value: 'health', label: 'Health' },
          ]}
          onChange={(playersSee) => newGame('see', { playersSee })}
          saved={mark === 'see'}
        />
      </Section>
    </div>
  )
}
