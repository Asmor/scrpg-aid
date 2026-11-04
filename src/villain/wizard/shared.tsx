/**
 * Components the villain wizard's steps share (docs/design/villain-wizard/spec.md): the option
 * cards a step chooses from, and a section with a heading. ./choices.ts has the rest.
 */
import { useId, type ReactNode } from 'react'

/** One of a step's parts, with its heading and anything beside it (a count, a button). */
export function Section({ title, aside, section, children }: { title: string; aside?: ReactNode; section?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="step-section vw-section" aria-labelledby={id} data-section={section}>
      <div className="vw-section__head">
        <h4 id={id}>{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  )
}

export interface CardOption {
  id: string
  name: string
  page?: number
  /** The card's lines under its name. */
  body: ReactNode
  /** Tags at its foot ("Often paired with Bully", a constraint). */
  tags?: ReactNode
  /** A tag in its top line ("Your pick"). */
  flag?: string
}

/**
 * Option cards in a grid, as a radio group: each card is a label around a native radio, so the
 * arrow keys move between them. The chosen card is outlined in the accent color.
 */
export function OptionCards({ label, name, options, selected, onSelect }: { label: string; name: string; options: readonly CardOption[]; selected: string | undefined; onSelect: (id: string) => void }) {
  return (
    <div className="vw-cards" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.id} className={o.id === selected ? 'vw-card vw-card--on' : 'vw-card'}>
          <input type="radio" className="vw-card__radio" name={name} checked={o.id === selected} onChange={() => onSelect(o.id)} />
          <span className="vw-card__top">
            <span className="vw-card__name">{o.name}</span>
            {o.flag && <span className="tag tag--strong">{o.flag}</span>}
            {o.page !== undefined && <span className="page-ref">p. {o.page}</span>}
          </span>
          {o.body}
          {o.tags}
        </label>
      ))}
    </div>
  )
}
