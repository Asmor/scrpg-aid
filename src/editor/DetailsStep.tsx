/** The hero's free-form details: name, look, and so on. */
import { DETAIL_FIELDS, type Hero } from '../hero/model'
import { DETAIL_LABEL } from '../hero/labels'

export function DetailsStep({ hero, update }: { hero: Hero; update: (change: (draft: Hero) => void) => void }) {
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
    </div>
  )
}
