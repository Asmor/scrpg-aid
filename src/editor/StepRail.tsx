/**
 * A wizard's step list: for heroes Start, then the eight numbered steps; for villains their seven
 * (../villain/wizard-steps.ts). Each has its mark (not started, done, or its issue count) and the
 * current one is highlighted. In edit mode the summary comes first. A step that isn't needed
 * (a minor villain's Mastery) is greyed out with a note, and can still be opened.
 */
import type { ArchetypePart } from '../hero/archetype-parts'
import type { StepMark } from '../hero/wizard-steps'

/** What the rail needs to know about a step. */
export interface RailStep {
  id: string
  label: string
  /** Its number; 0 has none (the hero's Start). */
  index: number
  issues: readonly unknown[]
  mark: StepMark
  /** Greyed out, with `note` saying why ("Not needed"). */
  skipped?: boolean
  /** A short note after the label. */
  note?: string
}

/** A step's mark: a hollow dot, a check, or a count pill. */
export function StepMarkIcon({ mark, count }: { mark: StepMark; count: number }) {
  if (mark === 'issues') {
    return (
      <span className="mark mark--issues">
        <span aria-hidden="true">{count}</span>
        <span className="visually-hidden">
          , {count} {count === 1 ? 'issue' : 'issues'}
        </span>
      </span>
    )
  }
  if (mark === 'done') {
    return (
      <span className="mark mark--done">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="visually-hidden">, done</span>
      </span>
    )
  }
  return (
    <span className="mark mark--todo">
      <span className="visually-hidden">, not started</span>
    </span>
  )
}

interface StepRailProps {
  steps: readonly RailStep[]
  current: string
  href: (id: string) => string
  /** A complex archetype's parts, listed under Archetype. */
  parts?: readonly ArchetypePart[]
  /** The part in the address, if any. */
  currentPart?: string
  partHref?: (part: string) => string
  /** Opens a part when its link is chosen (also when it's already in the address). */
  onPart?: (part: string) => void
  /** Called when a step is chosen (the phone's step list closes then). */
  onNavigate?: () => void
  /** Edit mode's summary, listed first (current is "summary" when it's on screen). */
  summaryHref?: string
}

export function StepRail({ steps, current, href, parts = [], currentPart: given, partHref, onPart, onNavigate, summaryHref }: StepRailProps) {
  // A part left in the address after choosing another archetype isn't one of these; the step is current then.
  const currentPart = given && parts.some((p) => p.id === given) ? given : undefined
  return (
    <ol className="rail">
      {summaryHref && (
        <li>
          <a className="rail__item" href={summaryHref} aria-current={current === 'summary' ? 'page' : undefined} onClick={onNavigate}>
            <span className="rail__num" />
            <span className="rail__label">Summary</span>
          </a>
        </li>
      )}
      {steps.map((s) => (
        <li key={s.id}>
          <a className={s.skipped ? 'rail__item rail__item--skipped' : 'rail__item'} href={href(s.id)} aria-current={s.id === current && !currentPart ? 'step' : undefined} onClick={onNavigate}>
            <span className="rail__num">{s.index > 0 ? s.index : ''}</span>
            <span className="rail__label">
              {s.label}
              {s.note && (
                <>
                  {' '}
                  <span className="rail__note">{s.note}</span>
                </>
              )}
            </span>
            <StepMarkIcon mark={s.mark} count={s.issues.length} />
          </a>
          {s.id === 'archetype' && parts.length > 0 && partHref && (
            <ol className="rail rail--parts" aria-label="Archetype parts">
              {parts.map((p) => (
                <li key={p.id}>
                  <a className="rail__item rail__item--part" href={partHref(p.id)} aria-current={current === 'archetype' && currentPart === p.id ? 'step' : undefined}
                    onClick={() => {
                      onPart?.(p.id)
                      onNavigate?.()
                    }}
                  >
                    <span className="rail__label">{p.label}</span>
                    <StepMarkIcon mark={p.mark} count={p.issues.length} />
                  </a>
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ol>
  )
}
