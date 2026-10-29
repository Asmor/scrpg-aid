/**
 * Start: how the hero is made (Guided or Constructed, p. 42–43) and, for Guided, who rolls.
 * Both can change later; dice already rolled stay as they are.
 */
import { useId } from 'react'
import type { Hero, RollMode } from '../hero/model'
import { MethodPicker } from './MethodPicker'

const ROLL_MODES: { id: RollMode; label: string; hint: string }[] = [
  { id: 'app', label: 'Roll in the app', hint: "The app rolls each step's dice and shows the options they allow." },
  { id: 'manual', label: 'My own dice', hint: 'Type in what you rolled at each step.' },
]

export function StartStep({ hero, update }: { hero: Hero; update: (change: (draft: Hero) => void) => void }) {
  const id = useId()
  return (
    <div className="step-form start-step">
      <MethodPicker hero={hero} update={update} />
      {hero.method === 'guided' && (
        <fieldset className="choice-list">
          <legend>Who rolls?</legend>
          {ROLL_MODES.map((m) => (
            <label key={m.id} className="choice">
              <input
                type="radio"
                name={`${id}-roll-mode`}
                checked={(hero.rollMode ?? 'app') === m.id}
                onChange={() =>
                  update((h) => {
                    h.rollMode = m.id
                  })
                }
              />
              <span className="choice__body">
                <span className="choice__title">{m.label}</span>
                <span className="choice__detail">{m.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  )
}
