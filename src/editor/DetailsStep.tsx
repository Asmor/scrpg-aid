/** The hero's free-form details, and how they're being made (Guided or Constructed, p. 42–43). */
import { useId } from 'react'
import { DETAIL_FIELDS, type CreationMethod, type Hero, type HeroDetails } from '../hero/model'

const LABEL: Record<keyof HeroDetails, string> = {
  name: 'Hero name',
  alias: 'Alias',
  player: 'Player',
  gender: 'Gender',
  age: 'Age',
  height: 'Height',
  eyes: 'Eyes',
  hair: 'Hair',
  skin: 'Skin',
  build: 'Build',
  costume: 'Costume / equipment',
}

const METHODS: { id: CreationMethod; label: string; hint: string }[] = [
  { id: 'guided', label: 'Guided', hint: 'Roll dice at each step (in the app, or your own dice) and choose from what you rolled.' },
  { id: 'constructed', label: 'Constructed', hint: 'Pick any option at each step. The dice sizes still carry forward.' },
]

export function DetailsStep({ hero, update }: { hero: Hero; update: (change: (draft: Hero) => void) => void }) {
  const id = useId()
  return (
    <div className="step-form">
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

      <div className="field-grid">
        {DETAIL_FIELDS.map((field) => (
          <label key={field} className={`field ${field === 'costume' ? 'field--wide' : ''}`}>
            <span>{LABEL[field]}</span>
            {field === 'costume' ? (
              <textarea
                rows={3}
                value={hero.details[field]}
                onChange={(e) =>
                  update((h) => {
                    h.details[field] = e.target.value
                  })
                }
              />
            ) : (
              <input
                type="text"
                value={hero.details[field]}
                onChange={(e) =>
                  update((h) => {
                    h.details[field] = e.target.value
                  })
                }
              />
            )}
          </label>
        ))}
      </div>
    </div>
  )
}
