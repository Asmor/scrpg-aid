/**
 * The wizard's step list: Start, then the eight numbered steps, each with its mark (not
 * started, done, or its issue count) and the current one highlighted.
 */
import type { ArchetypePart } from '../hero/archetype-parts'
import type { StepMark, StepState } from '../hero/wizard-steps'

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
  steps: readonly StepState[]
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
}

export function StepRail({ steps, current, href, parts = [], currentPart: given, partHref, onPart, onNavigate }: StepRailProps) {
  // A part left in the address after choosing another archetype isn't one of these; the step is current then.
  const currentPart = given && parts.some((p) => p.id === given) ? given : undefined
  return (
    <ol className="rail">
      {steps.map((s) => (
        <li key={s.id}>
          <a className="rail__item" href={href(s.id)} aria-current={s.id === current && !currentPart ? 'step' : undefined} onClick={onNavigate}>
            <span className="rail__num">{s.index > 0 ? s.index : ''}</span>
            <span className="rail__label">{s.label}</span>
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
