/** How the hero is being made (Guided or Constructed, p. 42–43), chosen before the first roll. */
import { useId } from 'react'
import type { CreationMethod, Hero } from '../hero/model'

const METHODS: { id: CreationMethod; label: string; hint: string }[] = [
  { id: 'guided', label: 'Guided', hint: 'Roll dice at each step (in the app, or your own dice) and choose from what you rolled.' },
  { id: 'constructed', label: 'Constructed', hint: 'Pick any option at each step. The dice sizes still carry forward.' },
]

export function MethodPicker({ hero, update }: { hero: Hero; update: (change: (draft: Hero) => void) => void }) {
  const id = useId()
  return (
    <fieldset className="choice-list">
      <legend>How are you making this hero?</legend>
      {METHODS.map((m) => (
        <label key={m.id} className="choice">
          <input
            type="radio"
            name={`${id}-method`}
            checked={hero.method === m.id}
            onChange={() =>
              update((h) => {
                h.method = m.id
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
  )
}
