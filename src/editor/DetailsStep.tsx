/** The hero's free-form details: name, look, and so on. */
import { useId } from 'react'
import { ColorPicker } from '../colors/ColorPicker'
import { DETAIL_FIELDS, heroDisplayName, type Hero } from '../hero/model'
import { DETAIL_LABEL } from '../hero/labels'

export function DetailsStep({ hero, update }: { hero: Hero; update: (change: (draft: Hero) => void) => void }) {
  const colorsId = useId()
  return (
    <div className="step-form">
      <div className="field-grid">
        {DETAIL_FIELDS.map((field) => (
          <label key={field} className={`field ${field === 'costume' ? 'field--wide' : ''}`}>
            <span>{DETAIL_LABEL[field]}</span>
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
      <section className="step-section" aria-labelledby={colorsId}>
        <h3 id={colorsId}>Colors</h3>
        <ColorPicker
          kind="hero"
          appearance={hero.appearance}
          name={heroDisplayName(hero)}
          onChange={(appearance) =>
            update((h) => {
              h.appearance = appearance
            })
          }
        />
      </section>
    </div>
  )
}
